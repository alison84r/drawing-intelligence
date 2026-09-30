"""
Step 5: arrowheads from the vector layer. Two drawing styles are covered:
filled triangles (SolidWorks, CenturyGothic drawings) and open strokes meeting at a tip (18_xxxx family).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


@dataclass
class Arrowhead:
    x: float
    y: float
    size: float


def _dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def detect_arrowheads(page: Any) -> list[Arrowhead]:
    heads: list[Arrowhead] = []

    # Filled small polygons with 3 to 5 points.
    for obj in list(page.curves) + list(page.rects):
        w, h = float(obj["width"]), float(obj["height"])
        pts = obj.get("pts") or []
        if not (1.5 <= max(w, h) <= 10) or not (3 <= len(pts) <= 6):
            continue
        if not (obj.get("fill") or obj.get("non_stroking_color") not in (None, 1, (1,), (1, 1, 1))):
            continue
        # Tip = the vertex farthest from the centroid.
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        tip = max(pts, key=lambda p: _dist(p, (cx, cy)))
        heads.append(Arrowhead(float(tip[0]), float(tip[1]), max(w, h)))

    # Open arrowheads: two short strokes sharing an endpoint at a narrow angle.
    short = []
    for ln in page.lines:
        a = (float(ln["x0"]), float(ln["top"]))
        b = (float(ln["x1"]), float(ln["bottom"]))
        length = _dist(a, b)
        if 1.5 <= length <= 9:
            short.append((a, b, length))
    if len(short) <= 6000:
        ends: list[tuple[float, float, tuple[float, float]]] = []  # (x, y, other end)
        for a, b, _ in short:
            ends.append((a[0], a[1], b))
            ends.append((b[0], b[1], a))
        ends.sort()
        used: set[int] = set()
        for i in range(len(ends)):
            if i in used:
                continue
            xi, yi, oi = ends[i]
            j = i + 1
            while j < len(ends) and ends[j][0] - xi <= 2.2:
                if j not in used and abs(ends[j][1] - yi) <= 2.2:
                    xj, yj, oj = ends[j]
                    v1 = (oi[0] - xi, oi[1] - yi)
                    v2 = (oj[0] - xj, oj[1] - yj)
                    n1, n2 = math.hypot(*v1), math.hypot(*v2)
                    if n1 and n2:
                        cosang = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
                        ang = math.degrees(math.acos(cosang))
                        if 10 <= ang <= 80:
                            heads.append(Arrowhead(xi, yi, max(n1, n2)))
                            used.add(i)
                            used.add(j)
                            break
                j += 1
    return heads


def nearest_arrowhead(heads: list[Arrowhead], x0: float, y0: float, x1: float, y1: float, reach: float) -> float | None:
    """Distance from a box to the closest arrowhead tip, or None when none is within reach."""
    best: float | None = None
    for h in heads:
        dx = max(x0 - h.x, 0, h.x - x1)
        dy = max(y0 - h.y, 0, h.y - y1)
        d = math.hypot(dx, dy)
        if d <= reach and (best is None or d < best):
            best = d
    return best
