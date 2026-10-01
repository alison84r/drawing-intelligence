"""
The Recognize pass, end to end, for one PDF: tokens → zones → rule out → group → score → balloon.
Deterministic: same PDF, same result. No model in the loop.
"""
from __future__ import annotations

import io
import re
import uuid
from typing import Any

import pdfplumber

from .inkfit import fit_box, has_ink, render_gray
from .grouper import MODIFIER_WORDS, attach_stacks, build_lines, dimension_font_size, parse_line, rule_out
from .tokens import Token, build_tokens
from .refine import (SYMBOL_NOTE, add_vector_symbols, attach_modifier_lines, attach_orphan_degrees, enclosure_of, enclosures, is_basic,
                     mark_datum_boxes, merge_counts, oriented_box, place_balloons, split_at_x)
from .scene import associate, build_scene, unexplained
from .views import detect_views, recheck_with_view_scale
from .tables import read_grid
from tolerance.grid import read_tolerance_grid
from .protected import outside_frame, protected_regions, region_at
from tolerance.detect import detect_scheme
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
            try:
                ink = render_gray(pdf_bytes, index)
            except Exception:  # noqa: BLE001 - without a render the PDF text boxes are used as they are
                ink = None
            # Text can be in the file and not on the drawing: under a white patch, under a pasted picture.
            # Only printed text may say anything about the part: not a tolerance class, not a note, not a value.
            pictures = [(float(im["x0"]), float(im["top"]), float(im["x1"]), float(im["bottom"])) for im in page.images
                        if (float(im["x1"]) - float(im["x0"])) * (float(im["bottom"]) - float(im["top"])) >= 0.004 * width * height]

            def printed_token(t: Token) -> bool:
                cx, cy = (t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2
                if any(x0 <= cx <= x1 and y0 <= cy <= y1 for x0, y0, x1, y1 in pictures):
                    return False
                # A symbol font can place its text box beside the glyph it draws (a degree sign sits above the box):
                # one- and two-character tokens are given some room before being called invisible.
                pad = 0.4 * t.size if len(t.text.strip()) <= 2 else 0.0
                return ink is None or has_ink(ink, (t.x0 - pad, t.y0 - pad, t.x1 + pad, t.y1 + pad))

            hidden_ids = {t.id for t in tokens if not printed_token(t)}
            # The class a tolerance table singles out: the designation letter with a circle drawn round it.
            shapes = enclosures(page)
            def ringed(t: Token) -> bool:
                # A circle about the size of the letter, centred on it. The font's text box can poke out of the ring,
                # so the test is on centres and size, not on containment.
                cx, cy = (t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2
                for sx0, sy0, sx1, sy1 in shapes["shapes"]:
                    sw, sh = sx1 - sx0, sy1 - sy0
                    if 0.8 <= sw / sh <= 1.25 and 0.7 * t.size <= sw <= 2.2 * t.size and abs((sx0 + sx1) / 2 - cx) <= 0.25 * sw and abs((sy0 + sy1) / 2 - cy) <= 0.25 * sh:
                        return True
                return False

            circled = {t.text.lower() for t in tokens if t.id not in hidden_ids and t.text.lower() in ("f", "m", "c", "v") and ringed(t)}
            marked_class = circled.pop() if len(circled) == 1 else None
            sheet_text = [t for t in tokens if t.id not in hidden_ids]  # the whole sheet, before any window narrows it
            hidden_boxes = [(t.x0, t.y0, t.x1, t.y1) for t in tokens if t.id in hidden_ids]
            grid = detect_zones(tokens, width, height)
            synthetic = grid is None
            if grid is None:
                grid = synthetic_grid(width, height)
            dim_size = dimension_font_size([t for t in tokens if t.cls != "ruled"])
            if region is not None:
                tokens = [t for t in tokens if _intersects(t, region)]
            mark_datum_boxes([t for t in tokens if t.size >= 0.6 * dim_size or t.kind == "gdt"], ink)
            attach_stacks(tokens, dim_size)
            lines = build_lines(tokens, dim_size)
            lines = attach_modifier_lines(attach_orphan_degrees(merge_counts(split_at_x(lines))))
            scene = build_scene(page)
            add_vector_symbols(lines, page, scene.segments)
            heads = scene.arrows
            tables: list[tuple[float, float, float, float]] = []
            all_tables: list[tuple[float, float, float, float]] = []  # every ruled table, filled or not: none of them is a view
            try:
                for tb in page.find_tables():
                    bx0, by0, bx1, by1 = tb.bbox
                    if (bx1 - bx0) * (by1 - by0) >= 0.25 * width * height or len(tb.rows) < 2:
                        continue
                    all_tables.append((float(bx0), float(by0), float(bx1), float(by1)))
                    cells = [c for row in tb.extract() for c in row]
                    filled = sum(1 for c in cells if c and str(c).strip())
                    if len(cells) >= 6 and filled / len(cells) >= 0.5:
                        tables.append((float(bx0), float(by0), float(bx1), float(by1)))
            except Exception:  # noqa: BLE001 - table finding is best effort
                tables = []

            # Title block, pictures and tables: no balloons there, whatever tool asked.
            printed = [t for t in tokens if t.id not in hidden_ids]  # text that is really on the sheet
            shielded = protected_regions(page, tables, printed, width, height, [a.tip for a in heads], all_tables)
            withheld = {"title_block": 0, "picture": 0, "table": 0}
            # Tables are read cell by cell; a general tolerance table is then understood from its cells.
            grids: list[dict[str, Any]] = []
            tolerance_table = None
            if region is None:
                for r in shielded:
                    if r["kind"] == "picture" or r.get("_picture"):
                        continue  # whatever rules lie under a picture are not on the drawing
                    cells = read_grid(page, r["_box"], hidden_boxes)
                    if not cells or any(_overlaps(g["bbox"], cells["bbox"], 0.6) for g in grids):
                        continue  # the same table found twice (as a ruled table and by its field names)
                    as_tolerance = read_tolerance_grid(cells["rows"])
                    if as_tolerance and tolerance_table is None:
                        tolerance_table = as_tolerance
                    grids.append({**cells, "kind": "tolerance" if as_tolerance else r["kind"] if r["kind"] != "title_text" else "title_block"})
            tolerance = detect_scheme(sheet_text, marked_class, tolerance_table)
            offered: set[str] = set()  # records inside a table under a window: offered for picking, not placed

            characteristics: list[dict[str, Any]] = []
            open_groups = 0
            pending: list[tuple[Any, Any, dict[str, Any]]] = []
            notes: list[tuple[dict[str, Any], Any]] = []
            text_lines: list[Any] = []
            for line in lines:
                lx0, ly0, lx1, ly1 = line.bbox
                zone_kind = region_at((lx0 + lx1) / 2, (ly0 + ly1) / 2, shielded)
                if outside_frame((lx0 + lx1) / 2, (ly0 + ly1) / 2, width, height):
                    for t in line.all_tokens:
                        t.cls, t.reason = "ruled", "outside the drawing border"
                    continue
                if sum(1 for t in line.all_tokens if t.id in hidden_ids) >= 0.6 * len(line.all_tokens):
                    for t in line.all_tokens:
                        t.cls, t.reason = "ruled", "in the file but not visible on the drawing"
                    continue
                if zone_kind == "title_text":
                    # A title block known only by its field names has a loose outline: inside it, text that is
                    # smaller than the dimensions or carries words is title-block text; a plain value at
                    # dimension size is left to the normal rules.
                    wordy = any(re.search(r"[A-Za-z]{2,}", t.text) for t in line.tokens)
                    zone_kind = "title_block" if wordy or line.size < 0.85 * dim_size else None
                if zone_kind in ("title_block", "picture"):
                    withheld[zone_kind] += 1
                    for t in line.all_tokens:
                        t.cls, t.reason = "ruled", "title block" if zone_kind == "title_block" else "under a picture, not visible on the drawing"
                    continue
                why = rule_out(line, dim_size, width, height, relaxed, tables)
                if why == "note":
                    nx0, ny0, nx1, ny1 = line.bbox
                    nbox = {"x": round(nx0, 2), "y": round(ny0, 2), "w": round(nx1 - nx0, 2), "h": round(ny1 - ny0, 2)}
                    text = " ".join(t.text for t in line.tokens)
                    number, _, body = text.partition(".")
                    note = {
                        "id": str(uuid.uuid4()), "balloonNumber": 0, "subNumber": None, "page": index,
                        "anchor": {"x": round(nx0, 2), "y": round((ny0 + ny1) / 2, 2)},
                        "balloonPos": {"x": round(max(14.0, nx0 - 1.6 * line.size), 2), "y": round((ny0 + ny1) / 2, 2)},
                        "leader": False, "bbox": nbox, "obox": None, "zone": grid.zone((nx0 + nx1) / 2, (ny0 + ny1) / 2),
                        "designator": "", "result": None, "status": "Draft", "source": "auto", "confidence": 0.5,
                        "comments": f"Drawing note {number.strip()}", "style": None, "geometry": None,
                        "descriptionType": "Note", "specification": body.strip(), "nominal": None, "tolHigh": None, "tolLow": None,
                        "toleranceType": "Attribute", "gdt": None, "places": 0, "count": 1, "measurementType": "Attribute", "units": units,
                    }
                    if any(e.get("page") == index and e.get("bbox") and _overlaps(e["bbox"], nbox) for e in existing):
                        for t in line.all_tokens:
                            t.cls, t.reason = "char", "already ballooned"
                    else:
                        open_groups += 1
                        notes.append((note, line))
                        for t in line.all_tokens:
                            t.cls, t.reason, t.guess = "open", "drawing note: add it if it is inspected", note
                    continue
                if why and (why == "text" or why.startswith("small text") or why == "no value") and line.rot == 0:
                    text_lines.append(line)
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
                feats = group.record.get("_feats") or []
                if feats and not record["comments"]:
                    record["comments"] = ", ".join(SYMBOL_NOTE[f] for f in feats if f in SYMBOL_NOTE)
                already = any(e.get("page") == index and e.get("bbox") and _overlaps(e["bbox"], bbox) for e in existing)
                if zone_kind == "table" and relaxed and not already:
                    withheld["table"] += 1
                    # A table row read as one string ("400 UPTO 6 UPTO 30") is not a value. Only a clean value is
                    # worth offering; headings, ranges and sentences are table text.
                    if any(re.search(r"[A-Za-z]{3,}", t.text) and t.text.upper() not in MODIFIER_WORDS for t in line.tokens):
                        for t in line.all_tokens:
                            t.cls, t.reason = "ruled", "table text"
                        continue
                    offered.add(record["id"])
                # A callout that is already ballooned still takes part in the geometry pass, so the audit stays whole on a re-run.
                pending.append((line, group, record, already))

            # A note that wraps: the text lines directly under it are part of it.
            for note, nline in sorted(notes, key=lambda n: n[0]["bbox"]["y"]):
                grew = True
                while grew:
                    grew = False
                    nb = note["bbox"]
                    for tl in list(text_lines):
                        tx0, ty0, tx1, ty1 = tl.bbox
                        if abs(tl.size - nline.size) > 0.2 * nline.size:
                            continue
                        gap = ty0 - (nb["y"] + nb["h"])
                        if -0.4 * nline.size <= gap <= 0.9 * nline.size and nb["x"] - 0.5 * nline.size <= tx0 <= nb["x"] + 5 * nline.size:
                            note["specification"] = f"{note['specification']} {' '.join(t.text for t in tl.tokens)}"
                            x0n, y0n = min(nb["x"], tx0), min(nb["y"], ty0)
                            x1n, y1n = max(nb["x"] + nb["w"], tx1), max(nb["y"] + nb["h"], ty1)
                            note["bbox"] = {"x": round(x0n, 2), "y": round(y0n, 2), "w": round(x1n - x0n, 2), "h": round(y1n - y0n, 2)}
                            for t in tl.all_tokens:
                                t.cls, t.reason, t.guess = "open", "drawing note: add it if it is inspected", note
                            text_lines.remove(tl)
                            grew = True
                            break

            # ── Geometry decides: tie every callout to a dimension line, a leader, or nothing.
            callouts = []
            for line, group, record, _ in pending:
                b = record["bbox"]
                callouts.append({
                    "box": (b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]),
                    "size": line.size,
                    "nominal": record.get("nominal"),
                    "angular": record["descriptionType"] == "Angular",
                    "linear": group.kind == "dimension" and record["descriptionType"] in ("Linear", "Diameter", "Thread", "Chamfer"),
                })
            info = associate(callouts, scene)
            scales = info["scales"]
            # Views: which one each callout belongs to, and a second look at lengths that only disagree at the sheet scale.
            try:
                views = detect_views(page, tokens, all_tables, width, height, callouts, units, scales) if region is None else []
                recheck_with_view_scale(callouts, views, units)
            except Exception:  # noqa: BLE001 - views are an aid; recognition never depends on them
                views = []
                for c in callouts:
                    c["view"] = None
            linear = [c for c in callouts if c["linear"]]
            geometry_readable = bool(scales) or (len(linear) >= 5 and sum(1 for c in linear if c.get("geometry")) >= 0.6 * len(linear))
            audit_none, audit_mismatch = [], []
            for (line, group, record, already), c in zip(pending, callouts):
                g = c.get("geometry")
                record["geometry"] = g
                record["view"] = views[c["view"]].to_json(c["view"])["name"] if views and c.get("view") is not None else ""
                at = {"x": record["anchor"]["x"], "y": record["anchor"]["y"]}
                kind = g["kind"] if g else "none"
                if kind == "dimension" and g.get("ratioOk") and group.confidence == 0.5 and group.reason.startswith("single digit"):
                    group.confidence, group.reason = 0.8, "single digit on a dimension line"
                if g and g.get("ratioOk") is False:
                    audit_mismatch.append({"id": record["id"], "specification": record["specification"], "at": at, "measured": g.get("measured")})
                    if not record["comments"]:
                        record["comments"] = f"Drawn length is {g.get('measured')} at sheet scale; the printed value differs (overridden or not to scale?)"
                if kind == "none" and c["linear"]:
                    audit_none.append({"id": record["id"], "specification": record["specification"], "at": at})
                    # On a sheet where geometry is readable, a value with no dimension line or leader is not trusted.
                    if geometry_readable and not relaxed and record["toleranceType"] not in ("Basic",) and group.confidence < 1.0:
                        group.confidence, group.reason = 0.5, "no dimension line or leader found"
                if already:
                    for t in group.tokens:
                        t.cls, t.reason = "char", "already ballooned"
                    continue
                record["confidence"] = group.confidence
                confident = (relaxed or group.confidence >= 0.8) and record["id"] not in offered
                if record["id"] in offered:
                    group.reason = "inside a table: click to add it if it is inspected"
                if confident:
                    characteristics.append(record)
                    for t in list(group.tokens) + list(getattr(line, "extra_tokens", [])):
                        t.cls, t.reason, t.char_id = "char", group.reason, record["id"]
                else:
                    open_groups += 1
                    for t in group.tokens:
                        t.cls, t.reason, t.guess = "open", group.reason, record
            kinds = [(c.get("geometry") or {}).get("kind", "none") for c in callouts]
            audit = {
                "callouts": len(callouts),
                "scales": scales,
                "verified": sum(1 for c in callouts if (c.get("geometry") or {}).get("ratioOk") is True),
                "onDimensionLine": kinds.count("dimension"),
                "onLeader": kinds.count("leader") + kinds.count("angular"),
                "attached": kinds.count("attached"),
                "mismatch": audit_mismatch,
                "noGeometry": audit_none,
                "unexplained": unexplained(scene) if region is None else [],
            }
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
            # Text that was not turned into a value is only worth the inspector's eye where a characteristic can be.
            # In a title block, under a picture, in a table, or not printed at all, it is settled: not amber.
            for t in tokens:
                if t.cls != "open" or t.guess:
                    continue
                tx, ty = (t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2
                where = region_at(tx, ty, shielded)
                if t.id in hidden_ids:
                    t.cls, t.reason = "ruled", "in the file but not visible on the drawing"
                elif outside_frame(tx, ty, width, height):
                    t.cls, t.reason = "ruled", "outside the drawing border"
                elif where in ("title_block", "picture"):
                    t.cls, t.reason = "ruled", "title block" if where == "title_block" else "under a picture, not visible on the drawing"
                elif where == "title_text" and (re.search(r"[A-Za-z]{2,}", t.text) or t.size < 0.85 * dim_size):
                    t.cls, t.reason = "ruled", "title block"
                elif where == "table":
                    t.cls, t.reason = "ruled", "table text"
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
                "audit": audit,
                "views": [v.to_json(i) for i, v in enumerate(views)],
                "protected": [{"kind": "title_block" if r["kind"] == "title_text" else r["kind"], "bbox": r["bbox"], "picture": bool(r.get("_picture"))} for r in shielded],
                "grids": grids,
                "withheld": {**withheld, "offered": len(offered)} if region is not None else None,
                "tolerance": tolerance,
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
