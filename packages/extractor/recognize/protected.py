"""
Regions of a sheet that hold no characteristics, whatever tool the inspector uses.

    title_block  a table or picture carrying title-block words (DRAWN, CHECKED, SHEET, SCALE …)
    picture      an embedded image: any text under it is not visible on the drawing
    table        any other ruled table (tolerance table, revision table, hole table)

Nothing in a title block or under a picture is ever ballooned. Values in other tables are not
ballooned on their own either, but a window drawn over one offers them for the inspector to pick,
because a hole table does hold real characteristics.
"""
from __future__ import annotations

import re
from typing import Any

import math

from .holes import find_hole_tables
from .tokens import Token
from .views import _regions, _strokes, _thick_pen

Box = tuple[float, float, float, float]

TITLE_WORDS = re.compile(
    r"^(DRAWN|DRN|CHECKED|CHKD?|APPROVED|APPD?|APPV.?D|SHEET|SCALE|TITLE|WEIGHT|VOLUME|MATERIAL|FINISH|REVISION|REV|DWG|DRAWING|PART|DATE|SIGNATURE|PROJECTION|FORMAT|SIZE|MFG|Q\.?A)\b", re.I)


def _inside(x: float, y: float, b: Box) -> bool:
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def ruled_grids(page: Any, tokens: list[Token], tips: list[tuple[float, float]], width: float, height: float) -> list[Box]:
    """
    Tables the table finder misses (merged cells, symbols in cells): an island of outline strokes that is
    nothing but horizontal and vertical rules, holds many words, and has no dimension arrowhead in it.
    """
    strokes = _strokes(page)
    thick = _thick_pen(strokes)
    out: list[Box] = []
    for box in _regions(page, width, height, [], []):
        inside = [(a, b) for pen, pts in strokes if pen >= thick for a, b in zip(pts, pts[1:]) if _inside((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, box)]
        total = sum(math.dist(a, b) for a, b in inside) or 1.0
        ruled = sum(math.dist(a, b) for a, b in inside if abs(a[0] - b[0]) < 0.5 or abs(a[1] - b[1]) < 0.5)
        words = sum(1 for t in tokens if _inside((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, box))
        if ruled >= 0.95 * total and words >= 12 and not any(_inside(x, y, box) for x, y in tips):
            out.append(box)
    return out


def outside_frame(x: float, y: float, width: float, height: float) -> bool:
    """In the outer strip of the sheet, beyond the border: format notes and plot stamps, never a characteristic."""
    edge = 0.012 * min(width, height)
    return x < edge or y < edge or x > width - edge or y > height - edge


def title_word_cluster(tokens: list[Token], width: float, height: float) -> Box | None:
    """
    A title block with no ruled table around it that anyone found: its field names still sit together.
    The box around the tightest group of at least five title words, padded by a few text heights.
    """
    hits = [t for t in tokens if TITLE_WORDS.match(t.text.upper().strip(":. "))]
    best: list[Token] = []
    reach_x, reach_y = 0.25 * width, 0.1 * height
    for seed in hits:
        group = [t for t in hits if abs(t.x0 - seed.x0) <= reach_x and abs(t.y0 - seed.y0) <= reach_y]
        if len(group) > len(best):
            best = group
    if len({t.text.upper().strip(":. ") for t in best}) < 5:
        return None
    pad = 1.5 * sorted(t.size for t in best)[len(best) // 2]
    return (min(t.x0 for t in best) - pad, min(t.y0 for t in best) - pad, max(t.x1 for t in best) + pad, max(t.y1 for t in best) + pad)


def protected_regions(page: Any, tables: list[Box], tokens: list[Token], width: float, height: float, tips: list[tuple[float, float]] = (), any_tables: list[Box] = ()) -> list[dict[str, Any]]:
    area = width * height or 1.0
    found: list[tuple[str, Box]] = []
    for im in page.images:
        box = (float(im["x0"]), float(im["top"]), float(im["x1"]), float(im["bottom"]))
        if 0.004 * area <= (box[2] - box[0]) * (box[3] - box[1]) <= 0.6 * area:
            found.append(("picture", box))
    pictures = {b for _, b in found}

    def border_strip(b: Box) -> bool:
        # The zone letters and numbers round the sheet sit in ruled cells: a long, very thin "table" along an edge.
        w, h = b[2] - b[0], b[3] - b[1]
        return (w <= 0.03 * width and h >= 0.4 * height) or (h <= 0.03 * height and w >= 0.4 * width)

    found += [("table", b) for b in (tuple(float(v) for v in t) for t in tables) if not border_strip(b)]  # type: ignore[misc]
    try:
        found += [("table", b) for b in ruled_grids(page, tokens, list(tips), width, height)]
    except Exception:  # noqa: BLE001 - an aid: the table finder's result still stands
        pass

    holes = set(find_hole_tables(tokens, width, height))
    found += [("table", b) for b in holes]
    # Sparse tables count only if they turn out to be a title block (decided by their words below).
    found += [("maybe", b) for b in (tuple(float(v) for v in t) for t in any_tables) if b not in {x for _, x in found} and not border_strip(b)]  # type: ignore[misc]

    out = []
    for kind, box in found:
        words = {t.text.upper().strip(":. ") for t in tokens if _inside((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, box)}
        titles = sum(1 for w in words if TITLE_WORDS.match(w))
        # Title-block words decide; a picture in the bottom-right corner of the sheet is one even without readable text.
        big = (box[2] - box[0]) * (box[3] - box[1]) >= 0.015 * area  # a logo is a picture, not a title block
        corner = kind == "picture" and big and (box[0] + box[2]) / 2 > 0.5 * width and (box[1] + box[3]) / 2 > 0.7 * height
        if (titles >= 3 or corner) and box not in holes:
            kind = "title_block"
        if kind == "maybe":
            continue  # a sparse table that is not a title block: left alone
        out.append({"kind": kind, "bbox": {"x": round(box[0], 1), "y": round(box[1], 1), "w": round(box[2] - box[0], 1), "h": round(box[3] - box[1], 1)}, "_box": box, "_picture": box in pictures, "_hole": box in holes})
    # A title block drawn as plain text and rules: found by its field names, and accepted only if no
    # dimension arrowhead falls inside (a box that reaches into the drawing is worse than none).
    box = title_word_cluster(tokens, width, height)
    if box and not any(_inside(x, y, box) for x, y in tips):
        if True:
            out.append({"kind": "title_text", "bbox": {"x": round(box[0], 1), "y": round(box[1], 1), "w": round(box[2] - box[0], 1), "h": round(box[3] - box[1], 1)}, "_box": box})
    return out


def region_at(x: float, y: float, regions: list[dict[str, Any]]) -> str | None:
    """The strictest kind of protected region containing the point, or None."""
    kinds = {r["kind"] for r in regions if _inside(x, y, r["_box"])}
    for kind in ("title_block", "picture", "title_text", "table"):
        if kind in kinds:
            return kind
    return None
