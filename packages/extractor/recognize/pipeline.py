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
from .grouper import attach_stacks, build_lines, dimension_font_size, parse_line, rule_out, score_with_geometry
from .tokens import Token, build_tokens
from .zones import detect_zones, synthetic_grid

Region = dict[str, float]  # x, y, w, h in page points


def _intersects(t: Token, r: Region) -> bool:
    return not (t.x1 < r["x"] or t.x0 > r["x"] + r["w"] or t.y1 < r["y"] or t.y0 > r["y"] + r["h"])


def _overlaps(a: dict[str, float], b: dict[str, float], frac: float = 0.3) -> bool:
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
            attach_stacks(tokens, dim_size)
            lines = build_lines(tokens, dim_size)
            heads = detect_arrowheads(page)
            tables: list[tuple[float, float, float, float]] = []
            try:
                for tb in page.find_tables():
                    bx0, by0, bx1, by1 = tb.bbox
                    if (bx1 - bx0) * (by1 - by0) < 0.25 * width * height and len(tb.rows) >= 2:
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
                    for t in line.all_tokens:
                        t.cls, t.reason = "open", "could not read a value"
                    continue
                score_with_geometry(group, heads)
                x0, y0, x1, y1 = line.bbox
                bbox = {"x": round(x0, 2), "y": round(y0, 2), "w": round(x1 - x0, 2), "h": round(y1 - y0, 2)}
                zone = grid.zone((x0 + x1) / 2, (y0 + y1) / 2)
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
                    "zone": zone,
                    "designator": "",
                    "result": None,
                    "status": "Draft",
                    "source": "auto",
                    "confidence": group.confidence,
                    "comments": "",
                    "style": None,
                    **{k: v for k, v in group.record.items() if not k.startswith("_")},
                }
                already = any(e.get("page") == index and e.get("bbox") and _overlaps(e["bbox"], bbox) for e in existing)
                confident = relaxed or group.confidence >= 0.8
                if already:
                    for t in group.tokens:
                        t.cls, t.reason = "char", "already ballooned"
                    continue
                if confident:
                    characteristics.append(record)
                    for t in group.tokens:
                        t.cls, t.reason, t.char_id = "char", group.reason, record["id"]
                else:
                    open_groups += 1
                    for t in group.tokens:
                        t.cls, t.reason, t.guess = "open", group.reason, record
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
