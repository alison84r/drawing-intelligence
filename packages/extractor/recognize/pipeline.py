"""
The Recognize pass, end to end, for one PDF: tokens → zones → rule out → group → score → balloon.
Deterministic: same PDF, same result. No model in the loop.
"""
from __future__ import annotations

import io
import uuid
from typing import Any

import pdfplumber

from .geometry import detect_arrowheads
from .inkfit import fit_box, render_gray
from .grouper import attach_stacks, build_lines, dimension_font_size, parse_line, rule_out, score_with_geometry
from .tokens import Token, build_tokens
from .refine import (add_vector_diameter, attach_modifier_lines, attach_orphan_degrees, enclosure_of, enclosures, is_basic,
                     mark_datum_boxes, merge_counts, oriented_box, place_balloons, split_at_x)
from .zones import detect_zones, synthetic_grid

Region = dict[str, float]  # x, y, w, h in page points


def _intersects(t: Token, r: Region) -> bool:
    return not (t.x1 < r["x"] or t.x0 > r["x"] + r["w"] or t.y1 < r["y"] or t.y0 > r["y"] + r["h"])


def _overlaps(a: dict[str, float], b: dict[str, float], frac: float = 0.2) -> bool:
    ix = max(0.0, min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]))
    iy = max(0.0, min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"]))
    inter = ix * iy
    small = min(a["w"] * a["h"], b["w"] * b["h"]) or 1.0
    return inter / small >= frac


def recognize(
    pdf_bytes: bytes,
    *,
    pages: list[int] | None = None,
    region: Region | None = None,
    relaxed: bool = False,
    units: str = "mm",
    existing_bboxes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    out_pages: list[dict[str, Any]] = []
    existing = existing_bboxes or []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for index, page in enumerate(pdf.pages):
            if pages is not None and index not in pages:
                continue
            width, height = float(page.width), float(page.height)
            tokens = build_tokens(page.chars, index)
            grid = detect_zones(tokens, width, height)
            synthetic = grid is None
            if grid is None:
                grid = synthetic_grid(width, height)
            dim_size = dimension_font_size([t for t in tokens if t.cls != "ruled"])
            if region is not None:
                tokens = [t for t in tokens if _intersects(t, region)]
            try:
                ink = render_gray(pdf_bytes, index)
            except Exception:  # noqa: BLE001 - without a render the PDF text boxes are used as they are
                ink = None
            mark_datum_boxes([t for t in tokens if t.size >= 0.6 * dim_size or t.kind == "gdt"], ink)
            attach_stacks(tokens, dim_size)
            lines = build_lines(tokens, dim_size)
            lines = attach_modifier_lines(attach_orphan_degrees(merge_counts(split_at_x(lines))))
            shapes = enclosures(page)
            if not any(t.kind == "dia" for t in tokens):
                add_vector_diameter(lines, page)
            heads = detect_arrowheads(page)
            tables: list[tuple[float, float, float, float]] = []
            try:
                for tb in page.find_tables():
                    bx0, by0, bx1, by1 = tb.bbox
                    if (bx1 - bx0) * (by1 - by0) >= 0.25 * width * height or len(tb.rows) < 2:
                        continue
                    cells = [c for row in tb.extract() for c in row]
                    filled = sum(1 for c in cells if c and str(c).strip())
                    if len(cells) >= 6 and filled / len(cells) >= 0.5:
                        tables.append((float(bx0), float(by0), float(bx1), float(by1)))
            except Exception:  # noqa: BLE001 - table finding is best effort
                tables = []

            characteristics: list[dict[str, Any]] = []
            open_groups = 0
            for line in lines:
                why = rule_out(line, dim_size, width, height, relaxed, tables)
                if why:
                    for t in line.all_tokens:
                        t.cls, t.reason = "ruled", why
                    continue
                group = parse_line(line, units)
                if group is None:
                    general = any(t.kind == "pm" for t in line.tokens)
                    for t in line.all_tokens:
                        t.cls, t.reason = ("ruled", "general tolerance note") if general else ("open", "could not read a value")
                    continue
                score_with_geometry(group, heads)
                x0, y0, x1, y1 = line.bbox
                if ink is not None and line.rot % 90 == 0:
                    # Fit each token to its ink and take the union: stacked deviations and frames keep every part.
                    fitted = [fit_box(ink, (t.x0, t.y0, t.x1, t.y1), t.rot, t.size) for t in line.all_tokens]
                    x0, y0 = min(f[0] for f in fitted), min(f[1] for f in fitted)
                    x1, y1 = max(f[2] for f in fitted), max(f[3] for f in fitted)
                bbox = {"x": round(x0, 2), "y": round(y0, 2), "w": round(x1 - x0, 2), "h": round(y1 - y0, 2)}
                zone = grid.zone((x0 + x1) / 2, (y0 + y1) / 2)
                obox = oriented_box(line.tokens, line.size)
                # Geometry around the text decides what kind of callout this is.
                around = enclosure_of((x0, y0, x1, y1), line.size, shapes)
                if around == "bubble" and group.kind == "dimension" and len(line.tokens) == 1 and line.tokens[0].text.isdigit():
                    for t in line.all_tokens:
                        t.cls, t.reason = "ruled", "item balloon"
                    continue
                if group.kind == "dimension" and group.record["toleranceType"] not in ("Reference",) and is_basic(line, ink):
                    group.record.update(toleranceType="Basic", tolHigh=None, tolLow=None)
                    group.confidence, group.reason = 1.0, "basic dimension (boxed)"
                notes_below = getattr(line, "notes_below", [])
                if notes_below:
                    group.record["specification"] = f"{group.record['specification']} {' '.join(notes_below)}"
                    if group.confidence == 0.5 and group.reason.startswith("single digit"):
                        group.confidence, group.reason = 0.8, "default tolerance applies"
                size = line.size
                record = {
                    "id": str(uuid.uuid4()),
                    "balloonNumber": 0,
                    "subNumber": None,
                    "page": index,
                    "anchor": {"x": round((x0 + x1) / 2, 2), "y": round((y0 + y1) / 2, 2)},
                    "balloonPos": {"x": round(x1 + 1.3 * size, 2), "y": round(y0 - 1.2 * size, 2)},
                    "leader": True,
                    "bbox": bbox,
                    "obox": obox,
                    "zone": zone,
                    "designator": "Key" if around == "flag" else "",
                    "result": None,
                    "status": "Draft",
                    "source": "auto",
                    "confidence": group.confidence,
                    "comments": "Inspection flag item" if around == "flag" else "",
                    "style": None,
                    **{k: v for k, v in group.record.items() if not k.startswith("_")},
                }
                if obox:
                    record["anchor"] = {"x": obox["cx"], "y": obox["cy"]}
                already = any(e.get("page") == index and e.get("bbox") and _overlaps(e["bbox"], bbox) for e in existing)
                confident = relaxed or group.confidence >= 0.8
                if already:
                    for t in group.tokens:
                        t.cls, t.reason = "char", "already ballooned"
                    continue
                if confident:
                    characteristics.append(record)
                    for t in list(group.tokens) + list(getattr(line, "extra_tokens", [])):
                        t.cls, t.reason, t.char_id = "char", group.reason, record["id"]
                else:
                    open_groups += 1
                    for t in group.tokens:
                        t.cls, t.reason, t.guess = "open", group.reason, record
            for t in tokens:
                ob = oriented_box([t], t.size)
                if ob:
                    t.extra["obox"] = ob
            # Balloons go where they cover neither text nor each other.
            place_balloons(characteristics, tokens, width, height, dim_size)
            # Token boxes follow the ink too, so every overlay sits on the glyphs.
            if ink is not None:
                for t in tokens:
                    if t.size >= 5:
                        t.x0, t.y0, t.x1, t.y1 = fit_box(ink, (t.x0, t.y0, t.x1, t.y1), t.rot, t.size)
            # Tokens that no line claimed stay open with a reason.
            for t in tokens:
                if t.cls == "open" and not t.reason:
                    t.reason = "not part of a callout"

            # Number by zone band, then left to right, like the manual renumber.
            band = max(1.0, height / 8)
            characteristics.sort(key=lambda c: (int(c["anchor"]["y"] // band), c["anchor"]["x"]))
            out_pages.append({
                "page": index,
                "width": width,
                "height": height,
                "dimensionFontSize": dim_size,
                "zones": {"cols": grid.cols, "rows": grid.rows, "synthetic": synthetic},
                "tables": [list(t) for t in tables],
                "arrowheads": len(heads),
                "tokens": [t.to_json() for t in tokens],
                "characteristics": characteristics,
                "stats": {
                    "tokens": len(tokens),
                    "char": sum(1 for t in tokens if t.cls == "char"),
                    "open": sum(1 for t in tokens if t.cls == "open"),
                    "ruled": sum(1 for t in tokens if t.cls == "ruled"),
                    "characteristics": len(characteristics),
                    "needsYou": open_groups,
                },
            })
    return {"pages": out_pages}
