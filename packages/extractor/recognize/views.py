"""
Views on a sheet: where each one is, what it is called, and its scale.

Geometry only. CAD draws the part outline with a thick pen and dimensions, leaders and hatching with a thin one,
so the thick strokes alone are laid on a coarse grid: each island of them is one view, and no dimension line can
bridge two views. A sheet drawn with a single pen falls back to all strokes.
A region is a view when it carries a view label (SECTION A-A, DETAIL A, ISOMETRIC VIEW) or its own dimensions.
Scale comes from two independent sources that are reported side by side:
    declared: printed with the label ("SCALE 2.000", "SCALE 2:1")
    measured: dimension-line length against the printed value, in points per unit
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from statistics import median
from typing import Any

import numpy as np
from scipy import ndimage

from .tokens import Token

CELL = 6.0  # points per grid cell
THICKER = 1.25  # an outline pen is at least this much heavier than the thin pen (ISO 128 pairs are 2:1, some CAD exports 1.4:1)
POINTS_PER_UNIT = {"mm": 72.0 / 25.4, "in": 72.0}

LABEL = re.compile(
    r"^(SECTION\s+[A-Z0-9]+\s*-\s*[A-Z0-9]+|DETAIL\s+[A-Z0-9]+|ISOMETRIC(?:\s+VIEW)?|AUXILIARY\s+VIEW(?:\s*-?\s*[A-Z0-9]{1,2})?"
    r"|(?:FRONT|TOP|SIDE|BOTTOM|REAR|LEFT|RIGHT)\s+VIEW|VIEW\s+[A-Z0-9]{1,2}(?:\s*-\s*[A-Z0-9]{1,2})?)(?=$|\s)", re.I)
SCALE = re.compile(r"SCALE\s*:?\s*(\d+(?:\.\d+)?)\s*(?:[:/]\s*(\d+(?:\.\d+)?))?", re.I)

Box = tuple[float, float, float, float]


@dataclass
class View:
    box: Box
    name: str = ""
    declared: float | None = None
    measured: float | None = None
    sheet: float | None = None  # the sheet's one scale, used when the view has too few dimensions of its own
    callouts: int = 0
    ratios: list[float] = field(default_factory=list)

    @property
    def scale(self) -> float | None:
        return self.declared if self.declared is not None else self.measured if self.measured is not None else self.sheet

    def to_json(self, index: int) -> dict[str, Any]:
        x0, y0, x1, y1 = self.box
        return {
            "id": f"v{index + 1}",
            "name": self.name or f"View {index + 1}",
            "labelled": bool(self.name),
            "bbox": {"x": round(x0, 1), "y": round(y0, 1), "w": round(x1 - x0, 1), "h": round(y1 - y0, 1)},
            "scale": None if self.scale is None else round(self.scale, 4),
            "scaleText": scale_text(self.scale),
            "scaleSource": "declared" if self.declared is not None else "measured" if self.measured is not None else "sheet" if self.sheet is not None else None,
            "measuredScale": None if self.measured is None else round(self.measured, 4),
            "callouts": self.callouts,
        }


def scale_text(scale: float | None) -> str:
    """0.5 -> '1:2', 2 -> '2:1', 1 -> '1:1'; anything that is not a round ratio is printed as a factor."""
    if not scale or scale <= 0:
        return ""
    for value, text in ((scale, "{}:1"), (1 / scale, "1:{}")):
        nearest = round(value * 2) / 2
        if nearest >= 1 and abs(value - nearest) <= 0.02 * nearest:
            return text.format(f"{nearest:g}")
    return f"{scale:.3g}x"


def _box_gap(a: Box, b: Box) -> float:
    return math.hypot(max(a[0] - b[2], 0.0, b[0] - a[2]), max(a[1] - b[3], 0.0, b[1] - a[3]))


def _inside(p: tuple[float, float], b: Box) -> bool:
    return b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3]


def _text_lines(tokens: list[Token]) -> list[tuple[str, Box, float]]:
    """Horizontal words joined into lines: (text, box, size)."""
    words = sorted((t for t in tokens if t.rot == 0 and t.text.strip()), key=lambda t: (round(t.y0 / 2), t.x0))
    lines: list[list[Token]] = []
    for t in words:
        last = lines[-1][-1] if lines else None
        if last and abs(t.y0 - last.y0) <= 0.5 * max(t.size, last.size) and -0.5 * t.size <= t.x0 - last.x1 <= 2.5 * max(t.size, last.size):
            lines[-1].append(t)
        else:
            lines.append([t])
    out = []
    for ln in lines:
        box = (min(t.x0 for t in ln), min(t.y0 for t in ln), max(t.x1 for t in ln), max(t.y1 for t in ln))
        out.append((" ".join(t.text for t in ln), box, max(t.size for t in ln)))
    return out


def _strokes(page: Any) -> list[tuple[float, list[tuple[float, float]]]]:
    """Every stroked path on the page as (pen width, points)."""
    out: list[tuple[float, list[tuple[float, float]]]] = []
    for obj in list(page.lines) + list(page.curves) + list(page.rects):
        if obj.get("stroke") is False:
            continue
        pts = [(float(p[0]), float(p[1])) for p in (obj.get("pts") or [])]
        if len(pts) < 2:
            x0, y0, x1, y1 = float(obj["x0"]), float(obj["top"]), float(obj["x1"]), float(obj["bottom"])
            pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)] if obj.get("object_type") == "rect" else [(x0, y0), (x1, y1)]
        out.append((float(obj.get("linewidth") or 0.0), pts))
    return out


def _thick_pen(strokes: list[tuple[float, list[tuple[float, float]]]]) -> float:
    """The pen width from which a stroke counts as part outline; 0 when the sheet uses a single pen."""
    lengths: dict[float, float] = {}
    for w, pts in strokes:
        lengths[round(w, 2)] = lengths.get(round(w, 2), 0.0) + sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    total = sum(lengths.values()) or 1.0
    real = sorted(w for w, n in lengths.items() if w > 0.05 and n >= 0.02 * total)
    # The thinnest pen in real use draws dimensions, leaders and hatching; anything clearly heavier is outline.
    if len(real) < 2 or real[-1] < THICKER * real[0]:
        return 0.0
    return THICKER * real[0]


def _merge(boxes: list[Box]) -> list[Box]:
    """Join boxes that mostly overlap: a hole pattern or an inner contour belongs to the view around it."""
    boxes = list(boxes)
    changed = True
    while changed:
        changed = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                ix, iy = min(a[2], b[2]) - max(a[0], b[0]), min(a[3], b[3]) - max(a[1], b[1])
                small = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1])) or 1.0
                if ix > 0 and iy > 0 and ix * iy >= 0.5 * small:
                    boxes[i] = (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))
                    del boxes[j]
                    changed = True
                    break
            if changed:
                break
    return boxes


def _regions(page: Any, width: float, height: float, skip: list[Box], words: list[tuple[float, float, bool]]) -> list[Box]:
    strokes = _strokes(page)
    thick = _thick_pen(strokes)
    cols, rows = int(width // CELL) + 2, int(height // CELL) + 2
    grid = np.zeros((rows, cols), dtype=bool)
    edge = 0.04 * min(width, height)
    for pen, pts in strokes:
        if pen < thick:
            continue
        for a, b in zip(pts, pts[1:]):
            length = math.dist(a, b)
            flat, upright = abs(a[1] - b[1]) < 0.5, abs(a[0] - b[0]) < 0.5
            # Sheet border, zone ticks and table rules are not part of any view.
            if (flat and length >= 0.5 * width) or (upright and length >= 0.5 * height):
                continue
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if not (edge <= mid[0] <= width - edge and edge <= mid[1] <= height - edge) or any(_inside(mid, s) for s in skip):
                continue
            steps = max(1, int(length // (CELL / 2)))
            for k in range(steps + 1):
                x, y = a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps
                if 0 <= x < width and 0 <= y < height:
                    grid[int(y // CELL), int(x // CELL)] = True
    labels, _ = ndimage.label(ndimage.binary_dilation(grid, iterations=2), structure=np.ones((3, 3), dtype=bool))
    out: list[Box] = []
    for sl in ndimage.find_objects(labels):
        if sl is None:
            continue
        ys, xs = np.nonzero(grid[sl])  # the box hugs the strokes, not the dilated island
        if ys.size == 0:
            continue
        x0, x1 = (sl[1].start + xs.min()) * CELL, (sl[1].start + xs.max() + 1) * CELL
        y0, y1 = (sl[0].start + ys.min()) * CELL, (sl[0].start + ys.max() + 1) * CELL
        if max(x1 - x0, y1 - y0) >= 30.0:
            out.append((x0, y0, x1, y1))
    boxes = []
    for box in _merge(out):
        # A table or title block the table finder missed: full of words that were already ruled out as not being
        # dimensions. A view holds callouts, and little else.
        plain = sum(1 for x, y, ruled_out in words if ruled_out and _inside((x, y), box))
        other = sum(1 for x, y, ruled_out in words if not ruled_out and _inside((x, y), box))
        if plain >= 12 and plain >= 3 * other:
            continue
        boxes.append(box)
    return boxes


def _key(name: str) -> str:
    """What a label identifies: 'VIEW B' and 'AUXILIARY VIEW -B' are one view; 'SECTION A-A' and 'DETAIL A' are two."""
    kind = "SECTION" if name.startswith("SECTION") else "DETAIL" if name.startswith("DETAIL") else "VIEW"
    last = re.split(r"[\s-]+", name.strip())[-1]
    return f"{kind} {last}" if len(last) <= 2 else name


def detect_views(page: Any, tokens: list[Token], tables: list[Box], width: float, height: float, callouts: list[dict[str, Any]], units: str, sheet_scales: list[float] | None = None) -> list[View]:
    """
    callouts: dicts with 'box', and where known 'nominal' and 'geometry' (with 'kind' and 'span').
    Sets 'view' (an index into the returned list, or None) on every callout.
    """
    words = [((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, t.cls == "ruled") for t in tokens]
    regions = [View(box) for box in _regions(page, width, height, tables, words)]
    lines = [ln for ln in _text_lines(tokens) if not any(_inside(((ln[1][0] + ln[1][2]) / 2, (ln[1][1] + ln[1][3]) / 2), t) for t in tables)]

    # Labels, each with the scale printed on the same line or the line beneath it.
    labels: list[tuple[str, float | None, Box]] = []
    for text, box, size in lines:
        m = LABEL.match(text.strip())
        if not m:
            continue
        found = SCALE.search(text)
        if not found:
            for other, obox, _ in lines:
                below = -0.5 * size <= obox[1] - box[3] <= 2.5 * size and obox[1] > box[1] and min(box[2], obox[2]) - max(box[0], obox[0]) > 0
                if below and SCALE.match(other.strip()):
                    found = SCALE.search(other)
                    box = (min(box[0], obox[0]), box[1], max(box[2], obox[2]), obox[3])
                    break
        declared = None
        if found:
            top, bottom = float(found.group(1)), float(found.group(2)) if found.group(2) else 1.0
            declared = top / bottom if bottom else None
        labels.append((re.sub(r"\s+", " ", m.group(1).upper()), declared, box))

    # The same view is often mentioned twice: once as its title, once beside the parent view ("VIEW B" with an
    # arrow, "DETAIL A" on a leader). The title is the mention with a scale, or failing that the fuller one.
    best_by_key: dict[str, tuple[str, float | None, Box]] = {}
    for lab in labels:
        cur = best_by_key.get(_key(lab[0]))
        if cur is None or (lab[1] is not None, len(lab[0])) > (cur[1] is not None, len(cur[0])):
            best_by_key[_key(lab[0])] = lab
    labels = list(best_by_key.values())

    # A label names the nearest region; one with a printed scale is placed first.
    reach = 0.2 * max(width, height)
    def cost(label: Box, view: Box) -> float:
        # A title sits under its view far more often than over it, so between two views the one above wins.
        return _box_gap(label, view) * (1.0 if view[3] <= label[1] + 2.0 else 4.0)

    pairs = sorted(((0 if declared is not None else 1, cost(box, v.box), i, name, declared) for name, declared, box in labels for i, v in enumerate(regions) if _box_gap(box, v.box) <= reach))
    named: set[str] = set()
    for _, _, i, name, declared in pairs:
        if regions[i].name or name in named:
            continue
        regions[i].name, regions[i].declared = name, declared
        named.add(name)

    unit = POINTS_PER_UNIT.get(units, POINTS_PER_UNIT["mm"])
    for c in callouts:
        x0, y0, x1, y1 = c["box"]
        centre = ((x0 + x1) / 2, (y0 + y1) / 2)
        g = c.get("geometry") or {}
        probes = [tuple(t) for t in g.get("tips", [])] + [centre]
        best = None
        far = 0.2 * max(width, height)  # a dimension line can sit well outside the outline it measures
        for i, v in enumerate(regions):
            gap = min(_box_gap((p[0], p[1], p[0], p[1]), v.box) for p in probes)
            if gap <= far and (best is None or gap < best[0]):
                best = (gap, i)
        c["view"] = best[1] if best else None
        if best:
            v = regions[best[1]]
            v.callouts += 1
            if g.get("kind") == "dimension" and g.get("ratioOk") and g.get("span") and c.get("nominal"):
                v.ratios.append(g["span"] / c["nominal"] / unit)

    for v in regions:
        if len(v.ratios) >= 2:
            v.measured = median(v.ratios)
        elif sheet_scales and len(sheet_scales) == 1 and v.callouts:
            v.sheet = sheet_scales[0] / unit

    # A view is a region someone labelled or dimensioned; the rest (title block, logos, symbols) is dropped.
    keep = [i for i, v in enumerate(regions) if v.name or v.callouts >= 2]
    order = sorted(keep, key=lambda i: (round(regions[i].box[1] / (height / 4)), regions[i].box[0]))
    remap = {old: new for new, old in enumerate(order)}
    for c in callouts:
        c["view"] = remap.get(c.get("view"))
    return [regions[i] for i in order]


def recheck_with_view_scale(callouts: list[dict[str, Any]], views: list[View], units: str) -> int:
    """
    A value whose dimension line disagreed at the sheet scale may agree at its own view's printed scale
    (a lone dimension in a 2:1 detail). Those are verified, not mismatches. Returns how many were cleared.
    """
    unit = POINTS_PER_UNIT.get(units, POINTS_PER_UNIT["mm"])
    cleared = 0
    for c in callouts:
        g = c.get("geometry")
        v = views[c["view"]] if c.get("view") is not None else None
        if not g or g.get("ratioOk") is not False or not v or v.declared is None or not g.get("span") or not c.get("nominal"):
            continue
        drawn = g["span"] / (v.declared * unit)
        if abs(drawn - c["nominal"]) <= 0.025 * abs(c["nominal"]):
            g["ratioOk"], g["viewScale"] = True, True
            g.pop("measured", None)
            cleared += 1
    return cleared
