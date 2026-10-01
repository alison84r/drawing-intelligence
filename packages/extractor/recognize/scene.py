"""
Geometry scene: what the drawing's vector layer says, independent of the text.

    arrowheads  → filled triangles
    dimensions  → two opposed arrowheads on one line (inside or outside arrows), with the measured span
    leaders     → an arrowhead, its shaft and the shoulder it runs into

Callouts are then tied to this geometry. A value with a dimension line or a leader is a dimension;
text with none is not. A dimension line with no value is reported instead of silently ignored.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

Pt = tuple[float, float]


def _sub(a: Pt, b: Pt) -> Pt:
    return a[0] - b[0], a[1] - b[1]


def _dot(a: Pt, b: Pt) -> float:
    return a[0] * b[0] + a[1] * b[1]


def _cross(a: Pt, b: Pt) -> float:
    return a[0] * b[1] - a[1] * b[0]


def _len(a: Pt) -> float:
    return math.hypot(a[0], a[1])


def _dist(a: Pt, b: Pt) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


@dataclass
class Arrow:
    tip: Pt
    base: Pt
    dir: Pt  # unit vector, base → tip
    length: float
    shaft_end: Pt | None = None
    partner: "Arrow | None" = None
    used: bool = False


@dataclass
class Dimension:
    a: Arrow
    b: Arrow
    kind: str  # 'inside' | 'outside'
    used: bool = False

    @property
    def span(self) -> float:
        return _dist(self.a.tip, self.b.tip)

    def segments(self) -> list[list[float]]:
        segs = [[*self.a.tip, *self.b.tip]]
        for ar in (self.a, self.b):
            if self.kind == "outside" and ar.shaft_end:
                segs.append([*ar.tip, *ar.shaft_end])
        return segs


@dataclass
class Leader:
    arrow: Arrow
    path: list[Pt]  # tip → … → end
    used: bool = False

    @property
    def end(self) -> Pt:
        return self.path[-1]

    def segments(self) -> list[list[float]]:
        return [[*self.path[i], *self.path[i + 1]] for i in range(len(self.path) - 1)]


@dataclass
class Scene:
    arrows: list[Arrow] = field(default_factory=list)
    dimensions: list[Dimension] = field(default_factory=list)
    leaders: list[Leader] = field(default_factory=list)
    segments: list[tuple[Pt, Pt]] = field(default_factory=list)


def _unique(pts: list[Pt]) -> list[Pt]:
    out: list[Pt] = []
    for p in pts:
        p = (float(p[0]), float(p[1]))
        if not any(_dist(p, q) < 0.05 for q in out):
            out.append(p)
    return out


def find_arrows(page: Any) -> list[Arrow]:
    arrows: list[Arrow] = []
    for cv in page.curves:
        if not cv.get("fill"):
            continue
        w, h = float(cv["width"]), float(cv["height"])
        if not (3.0 <= max(w, h) <= 24.0):
            continue
        pts = _unique(cv.get("pts") or [])
        if len(pts) not in (3, 4):
            continue
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        tip = max(pts, key=lambda p: _dist(p, (cx, cy)))
        rest = [p for p in pts if p is not tip]
        # Base = the two vertices farthest apart among the rest (a notched arrow has a third, inner one).
        base_a, base_b = max(((p, q) for p in rest for q in rest if p is not q), key=lambda pq: _dist(*pq))
        base = ((base_a[0] + base_b[0]) / 2, (base_a[1] + base_b[1]) / 2)
        length = _dist(tip, base)
        width = _dist(base_a, base_b)
        if length < 3.0 or length < 1.7 * width:
            continue  # datum triangles and other stubby shapes are not arrowheads
        d = _sub(tip, base)
        d = (d[0] / length, d[1] / length)
        if any(_dist(a.tip, tip) < 0.4 and _dot(a.dir, d) > 0.9 for a in arrows):
            continue  # fill and stroke copies of the same head
        arrows.append(Arrow(tip, base, d, length))
    return arrows


def find_segments(page: Any) -> list[tuple[Pt, Pt]]:
    segs: list[tuple[Pt, Pt]] = []
    for ln in page.lines:
        pts = ln.get("pts")
        if pts and len(pts) >= 2:
            a, b = (float(pts[0][0]), float(pts[0][1])), (float(pts[-1][0]), float(pts[-1][1]))
        else:
            a, b = (float(ln["x0"]), float(ln["top"])), (float(ln["x1"]), float(ln["bottom"]))
        if _dist(a, b) >= 2.0:
            segs.append((a, b))
    for cv in page.curves:
        pts = cv.get("pts") or []
        if len(pts) == 2 and not cv.get("fill"):
            a, b = (float(pts[0][0]), float(pts[0][1])), (float(pts[1][0]), float(pts[1][1]))
            if _dist(a, b) >= 2.0:
                segs.append((a, b))
    return segs


def _attach_shafts(arrows: list[Arrow], segs: list[tuple[Pt, Pt]]) -> None:
    for ar in arrows:
        best = None
        for a, b in segs:
            for near, far in ((a, b), (b, a)):
                # The shaft starts somewhere on the head (tip … base) and runs backwards along its axis.
                rel = _sub(near, ar.tip)
                along = -_dot(rel, ar.dir)
                if not (-0.8 <= along <= ar.length + 1.2) or abs(_cross(rel, ar.dir)) > 0.9:
                    continue
                v = _sub(far, near)
                n = _len(v)
                if n == 0 or abs(_cross(v, ar.dir)) / n > 0.05 or _dot(v, ar.dir) > 0:
                    continue
                reach = -_dot(_sub(far, ar.tip), ar.dir)
                if best is None or reach > best[0]:
                    best = (reach, far)
        if best is not None:
            ar.shaft_end = best[1]


def _pair(arrows: list[Arrow]) -> list[Dimension]:
    def candidates(a: Arrow) -> list[tuple[float, Arrow, str]]:
        out = []
        for b in arrows:
            if b is a or _dot(a.dir, b.dir) > -0.985:
                continue
            rel = _sub(b.tip, a.tip)
            if abs(_cross(rel, a.dir)) > 1.5:
                continue
            back = -_dot(rel, a.dir)  # distance behind a's tip
            if back > a.length * 0.8:
                out.append((back, b, "inside"))
            elif -90.0 <= back < -0.2:
                out.append((-back, b, "outside"))
        return out

    choice: dict[int, tuple[Arrow, str]] = {}
    for a in arrows:
        c = candidates(a)
        inside = sorted((x for x in c if x[2] == "inside"), key=lambda x: x[0])
        outside = sorted((x for x in c if x[2] == "outside"), key=lambda x: x[0])
        pick = None
        if inside:
            dist, b, _ = inside[0]
            reach_a = _dist(a.tip, a.shaft_end) if a.shaft_end else a.length
            reach_b = _dist(b.tip, b.shaft_end) if b.shaft_end else b.length
            # The two shafts must meet, or leave only a gap a dimension text fits in.
            if dist - reach_a - reach_b <= 75.0:
                pick = (b, "inside")
        if pick is None and outside:
            pick = (outside[0][1], "outside")
        if pick:
            choice[id(a)] = pick
    dims: list[Dimension] = []
    done: set[int] = set()
    for a in arrows:
        if id(a) in done or id(a) not in choice:
            continue
        b, kind = choice[id(a)]
        back = choice.get(id(b))
        if back and back[0] is a and id(b) not in done:
            a.partner, b.partner = b, a
            dims.append(Dimension(a, b, kind))
            done.update((id(a), id(b)))
    return dims


def _leaders(arrows: list[Arrow], segs: list[tuple[Pt, Pt]]) -> list[Leader]:
    out: list[Leader] = []
    for ar in arrows:
        path = [ar.tip]
        if ar.shaft_end is not None:
            path.append(ar.shaft_end)
            # Follow the shoulder(s): segments that start where the path ends.
            for _ in range(3):
                end = path[-1]
                nxt = None
                for a, b in segs:
                    for near, far in ((a, b), (b, a)):
                        if _dist(near, end) <= 1.2 and _dist(far, path[-2]) > _dist(end, path[-2]) * 0.5 and _dist(far, end) >= 2.5:
                            v1, v2 = _sub(end, path[-2]), _sub(far, end)
                            if _len(v1) and _len(v2) and abs(_cross(v1, v2)) / (_len(v1) * _len(v2)) > 0.05:
                                if nxt is None or _dist(far, end) > _dist(nxt, end):
                                    nxt = far
                if nxt is None:
                    break
                path.append(nxt)
        out.append(Leader(ar, path))
    return out


def build_scene(page: Any) -> Scene:
    arrows = find_arrows(page)
    segs = find_segments(page)
    _attach_shafts(arrows, segs)
    dims = _pair(arrows)
    return Scene(arrows, dims, _leaders(arrows, segs), segs)


# ───────────────────────────── association ─────────────────────────────

def _box_point_distance(box: tuple[float, float, float, float], p: Pt) -> float:
    x0, y0, x1, y1 = box
    return math.hypot(max(x0 - p[0], 0, p[0] - x1), max(y0 - p[1], 0, p[1] - y1))


def _dimension_score(box: tuple[float, float, float, float], size: float, d: Dimension, wide: bool = False) -> float | None:
    x0, y0, x1, y1 = box
    c = ((x0 + x1) / 2, (y0 + y1) / 2)
    span = d.span
    if span < 0.5:
        return None
    u = _sub(d.b.tip, d.a.tip)
    u = (u[0] / span, u[1] / span)
    rel = _sub(c, d.a.tip)
    t = _dot(rel, u)
    perp = abs(_cross(rel, u))
    half = (x1 - x0) / 2 * abs(u[1]) + (y1 - y0) / 2 * abs(u[0])  # box half-extent across the line
    perp_box = max(0.0, perp - half)
    if perp_box > (4.0 if wide else 1.1) * size:
        return None
    half_along = (x1 - x0) / 2 * abs(u[0]) + (y1 - y0) / 2 * abs(u[1])
    over = max(0.0, -t - half_along, t - span - half_along)  # how far the text sits beyond the tips
    if over > (14.0 if wide else 6.5) * size:
        return None
    return perp_box + 0.6 * over


def _scales(ratios: list[float]) -> list[float]:
    """Sheet scales: span / value ratios that at least three dimensions agree on (detail views add more)."""
    ratios = sorted(r for r in ratios if r > 0)
    groups: list[list[float]] = []
    for r in ratios:
        if groups and r <= groups[-1][0] * 1.02:
            groups[-1].append(r)
        else:
            groups.append([r])
    need = 3 if len(ratios) >= 6 else 2
    return [sum(g) / len(g) for g in groups if len(g) >= need]


def _fits(scales: list[float], span: float, nominal: float | None) -> bool:
    if not nominal:
        return False
    r = span / nominal
    return any(abs(r - sc) <= 0.025 * sc for sc in scales)


def _crossed(segs: list[tuple[Pt, Pt]], p: Pt, axis: Pt) -> bool:
    """Is there a line through p that is not parallel to the axis?"""
    for a, b in segs:
        v = _sub(b, a)
        n = _len(v)
        if n < 3.0 or abs(_cross(v, axis)) / n < 0.5:
            continue
        t = max(0.0, min(1.0, _dot(_sub(p, a), v) / (n * n)))
        q = (a[0] + v[0] * t, a[1] + v[1] * t)
        if _dist(p, q) <= 1.0:
            return True
    return False


def _geometry(kind: str, obj: Any) -> dict[str, Any]:
    if kind == "dimension":
        return {"kind": "dimension", "segments": obj.segments(), "tips": [list(obj.a.tip), list(obj.b.tip)], "span": round(obj.span, 2)}
    return {"kind": "leader", "segments": obj.segments(), "tips": [list(obj.arrow.tip)]}


def associate(callouts: list[dict[str, Any]], scene: Scene) -> dict[str, Any]:
    """
    callouts: dicts with 'box' (x0, y0, x1, y1), 'size', 'linear' (may sit on a dimension line), 'angular', 'nominal'.
    Sets 'geometry' on each. Returns {'scales': [...]}.
    """
    def dimension_options(wide: bool, only_fit: list[float] | None) -> list[tuple[float, int, Dimension]]:
        out = []
        for i, c in enumerate(callouts):
            if not c.get("linear") or c.get("geometry"):
                continue
            for d in scene.dimensions:
                if d.used:
                    continue
                if only_fit is not None and not _fits(only_fit, d.span, c.get("nominal")):
                    continue
                sc = _dimension_score(c["box"], c["size"], d, wide)
                if sc is not None:
                    out.append((sc, i, d))
        return sorted(out, key=lambda o: o[0])

    def take(options: list[tuple[float, int, Dimension]], ratio_ok: bool | None) -> None:
        for _, i, d in options:
            c = callouts[i]
            if c.get("geometry") or d.used:
                continue
            d.used = True
            c["geometry"] = _geometry("dimension", d) | {"ratioOk": ratio_ok}

    # Pass 1: nearest dimension line. Its only job is to find the sheet scale(s).
    first = dimension_options(False, None)
    seen_c: set[int] = set()
    seen_d: set[int] = set()
    ratios = []
    for _, i, d in first:
        if i in seen_c or id(d) in seen_d:
            continue
        seen_c.add(i)
        seen_d.add(id(d))
        if callouts[i].get("nominal"):
            ratios.append(d.span / callouts[i]["nominal"])
    scales = _scales(ratios)

    if scales:
        # Pass 2: value-driven. Any two opposed arrowheads on one line whose distance agrees with the value
        # at the sheet scale are that value's dimension. Pre-pairing is only a hint; the measured length decides.
        pairs: list[Dimension] = []
        for ia, a in enumerate(scene.arrows):
            for b in scene.arrows[ia + 1 :]:
                if _dot(a.dir, b.dir) > -0.985 or abs(_cross(_sub(b.tip, a.tip), a.dir)) > 1.5:
                    continue
                if _dist(a.tip, b.tip) < 1.5:
                    continue
                pairs.append(Dimension(a, b, "outside" if _dot(_sub(b.tip, a.tip), a.dir) > 0 else "inside"))
        options = []
        for i, c in enumerate(callouts):
            if not c.get("linear") or not c.get("nominal"):
                continue
            for d in pairs:
                if not _fits(scales, d.span, c["nominal"]):
                    continue
                sc = _dimension_score(c["box"], c["size"], d, True)
                if sc is not None:
                    # Prefer the pair the geometry itself suggested.
                    options.append((sc - (0.5 if d.a.partner is d.b else 0.0), i, d))
        for _, i, d in sorted(options, key=lambda o: o[0]):
            c = callouts[i]
            if c.get("geometry") or d.a.used or d.b.used:
                continue
            d.a.used = d.b.used = d.used = True
            c["geometry"] = _geometry("dimension", d) | {"ratioOk": True}
        # One arrowhead is enough when the other end is hidden (under a datum triangle, at a break): measure the
        # value from the tip along the shaft and require a crossing line there (extension line or feature edge).
        for c in callouts:
            if c.get("geometry") or not c.get("linear") or not c.get("nominal"):
                continue
            best = None
            for a in scene.arrows:
                if a.used:
                    continue
                for sc_ in scales:
                    span = c["nominal"] * sc_
                    for sign in (-1.0, 1.0):  # inside arrow: the far end is behind the head; outside arrow: in front
                        end = (a.tip[0] + sign * a.dir[0] * span, a.tip[1] + sign * a.dir[1] * span)
                        if not _crossed(scene.segments, end, a.dir):
                            continue
                        ghost = Arrow(end, end, (-a.dir[0], -a.dir[1]), 0.0)
                        d = Dimension(a, ghost, "inside" if sign < 0 else "outside")
                        score = _dimension_score(c["box"], c["size"], d, False)
                        if score is not None and (best is None or score < best[0]):
                            best = (score, d)
            if best is not None:
                d = best[1]
                d.a.used = True
                c["geometry"] = _geometry("dimension", d) | {"ratioOk": True, "oneArrow": True}
        # A value with a dimension line nearby whose length disagrees: linked for the audit, not for display.
        for _, i, d in dimension_options(False, None):
            c = callouts[i]
            if c.get("geometry") or d.a.used or d.b.used:
                continue
            c["geometry"] = {"kind": "unverified", "segments": [], "tips": [], "span": round(d.span, 2), "ratioOk": False}
    else:
        take(first, None)
        for c in callouts:
            g = c.get("geometry")
            if g:
                for d in scene.dimensions:
                    if d.used:
                        d.a.used = d.b.used = True

    # Leaders that end at the callout.
    options: list[tuple[float, int, Leader]] = []
    for i, c in enumerate(callouts):
        if c.get("geometry"):
            continue
        for ld in scene.leaders:
            if ld.arrow.used or len(ld.path) < 2:
                continue
            dist = _box_point_distance(c["box"], ld.end)
            if dist <= 1.4 * c["size"]:
                options.append((dist, i, ld))
    for _, i, ld in sorted(options, key=lambda o: o[0]):
        c = callouts[i]
        if c.get("geometry") or ld.used:
            continue
        ld.used = ld.arrow.used = True
        c["geometry"] = _geometry("leader", ld)

    # Leaders whose shaft is an arc or was not found: the head points at the feature, the text sits behind it.
    for c in callouts:
        if c.get("geometry"):
            continue
        x0, y0, x1, y1 = c["box"]
        centre = ((x0 + x1) / 2, (y0 + y1) / 2)
        reach = (11.0 if c.get("angular") else 14.0) * c["size"]
        near = sorted((ld for ld in scene.leaders if not ld.used and not ld.arrow.used and _dist(ld.arrow.tip, centre) <= reach),
                      key=lambda ld: _dist(ld.arrow.tip, centre))
        if c.get("angular"):
            if near:
                picked = near[:2]
                for ld in picked:
                    ld.used = ld.arrow.used = True
                c["geometry"] = {"kind": "angular", "segments": [], "tips": [list(ld.arrow.tip) for ld in picked]}
            continue
        for ld in near:
            rel = _sub(centre, ld.arrow.tip)
            behind = -_dot(rel, ld.arrow.dir)
            off = abs(_cross(rel, ld.arrow.dir))
            if (behind > 0 and off <= 1.6 * c["size"] + (y1 - y0)) or _box_point_distance(c["box"], ld.end) <= 2.2 * c["size"]:
                ld.used = ld.arrow.used = True
                c["geometry"] = _geometry("leader", ld)
                break

    # A frame or a second line stacked on a callout, or the other half of "12.00 X 37.00", shares its geometry.
    for _ in range(2):
        for c in callouts:
            if c.get("geometry"):
                continue
            x0, y0, x1, y1 = c["box"]
            for o in callouts:
                g = o.get("geometry")
                if o is c or not g:
                    continue
                ox0, oy0, ox1, oy1 = o["box"]
                vgap = max(y0 - oy1, oy0 - y1)
                hgap = max(x0 - ox1, ox0 - x1)
                stacked = vgap <= 0.9 * c["size"] and min(x1, ox1) - max(x0, ox0) > 0
                beside = hgap <= 2.2 * c["size"] and min(y1, oy1) - max(y0, oy0) > 0.5 * (y1 - y0)
                if stacked or beside:
                    c["geometry"] = {"kind": "attached", "segments": g["segments"], "tips": g["tips"]}
                    break
    return {"scales": [round(v, 4) for v in scales]}


def unexplained(scene: Scene) -> list[dict[str, Any]]:
    """Dimension lines that no value claimed."""
    out = []
    for d in scene.dimensions:
        if d.a.used or d.b.used or d.span < 3.0:
            continue
        if any(ld.used and ld.arrow in (d.a, d.b) for ld in scene.leaders):
            continue
        mid = ((d.a.tip[0] + d.b.tip[0]) / 2, (d.a.tip[1] + d.b.tip[1]) / 2)
        out.append({"kind": "dimension", "at": {"x": round(mid[0], 1), "y": round(mid[1], 1)}, "segments": d.segments(), "span": round(d.span, 1)})
    return out
