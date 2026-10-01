"""
Refinements between grouping and parsing, and balloon placement after it.

- "12.00 X 37.00" is two dimensions (slot width by length), not a count of 12.
- "2 x" far left of its value belongs to that value.
- A diameter sign drawn as a vector circle (not a font glyph) is put back as a token.
- Diagonal text gets an oriented box so highlights hug the digits.
- Balloons are placed where they do not cover text or each other.
"""
from __future__ import annotations

import math
import re
from typing import Any

from .grouper import COUNT, MODIFIER_WORDS, NUMBER, Line
from .inkfit import fit_box, is_boxed
from .tokens import Token, content_id

DECIMAL = re.compile(r"^\d+[.,]\d+$")
COUNT_ONLY = re.compile(r"^\d{1,2}\s*[xX]$")


def split_at_x(lines: list[Line]) -> list[Line]:
    out: list[Line] = []
    for ln in lines:
        cut = None
        for i in range(1, len(ln.tokens) - 1):
            if ln.tokens[i].text in ("X", "x") and DECIMAL.match(ln.tokens[i - 1].text) and DECIMAL.match(ln.tokens[i + 1].text):
                if i + 2 < len(ln.tokens) and ln.tokens[i + 2].kind == "deg":
                    continue  # "3.0 X 45.00°" is one chamfer, leg by angle
                cut = i
                break
        if cut is None:
            out.append(ln)
            continue
        x_tok = ln.tokens[cut]
        x_tok.cls, x_tok.reason = "ruled", "by: joins two dimensions"
        out.append(Line(ln.rot, ln.tokens[:cut], ln.size))
        out.append(Line(ln.rot, ln.tokens[cut + 1 :], ln.size))
    return out


def merge_counts(lines: list[Line]) -> list[Line]:
    """A line that is only "2 x" joins the nearest line to its right on the same baseline."""
    counts = [ln for ln in lines if COUNT_ONLY.match("".join(t.text for t in ln.tokens))]
    for c in counts:
        end = max(t.along()[1] for t in c.tokens)
        across = c.tokens[-1].across()
        best, best_gap = None, 1e9
        for ln in lines:
            if ln is c or ln.rot != c.rot or ln in counts:
                continue
            gap = min(t.along()[0] for t in ln.tokens) - end
            if 0 <= gap <= 3.2 * c.size and abs(ln.tokens[0].across() - across) <= 0.7 * c.size and gap < best_gap:
                best, best_gap = ln, gap
        if best is not None:
            first = c.tokens[0]
            joined = Token(first.id, first.page, "".join(t.text for t in c.tokens).replace(" ", "").upper(),
                           min(t.x0 for t in c.tokens), min(t.y0 for t in c.tokens), max(t.x1 for t in c.tokens), max(t.y1 for t in c.tokens),
                           first.size, first.font, first.rot, "text")
            for t in c.tokens:
                t.extra["merged_into"] = joined
            best.tokens.insert(0, joined)
            best.extra_tokens = getattr(best, "extra_tokens", []) + list(c.tokens)  # type: ignore[attr-defined]
            lines.remove(c)
    return lines


def attach_orphan_degrees(lines: list[Line]) -> list[Line]:
    """A degree sign on its own (it sits high, and off-axis on diagonal text) joins the number it follows."""
    for d in [ln for ln in lines if len(ln.tokens) == 1 and ln.tokens[0].kind == "deg"]:
        deg = d.tokens[0]
        best, best_dist = None, 1e9
        for ln in lines:
            last = ln.tokens[-1]
            if ln is d or not NUMBER.match(last.text) or abs(((ln.rot - d.rot + 180) % 360) - 180) > 10:
                continue
            ux, uy = last.u
            half = len(last.text) * 0.29 * last.size
            ex, ey = last.cx + ux * half, last.cy + uy * half  # where the number ends
            dist = math.hypot(deg.cx - ex, deg.cy - ey)
            if dist <= 1.2 * last.size and dist < best_dist:
                best, best_dist = ln, dist
        if best is not None:
            deg.rot = best.rot
            best.tokens.append(deg)
            lines.remove(d)
    return lines


SYMBOL_NOTE = {"⌴": "Counterbore", "↧": "Depth", "⌵": "Countersink"}


def _classify_symbol(region: tuple[float, float, float, float], size: float, circles: list[tuple[float, float, float, float]],
                     segs: list[tuple[tuple[float, float], tuple[float, float]]]) -> tuple[str, tuple[float, float, float, float]] | None:
    """Which drafting symbol is drawn in this gap? Decided by shape, not by proximity."""
    rx0, ry0, rx1, ry1 = region
    pad = 0.15 * size
    inside = [(a, b) for a, b in segs if all(rx0 - pad <= p[0] <= rx1 + pad and ry0 - pad <= p[1] <= ry1 + pad for p in (a, b))]
    hs, vs, ds = [], [], []
    for a, b in inside:
        dx, dy = abs(a[0] - b[0]), abs(a[1] - b[1])
        n = math.hypot(dx, dy)
        if n < 0.15 * size:
            continue
        (hs if dy < 0.15 * n else vs if dx < 0.15 * n else ds).append((a, b, n))

    def box_of(items: list) -> tuple[float, float, float, float]:
        xs = [p[0] for a, b, _ in items for p in (a, b)]
        ys = [p[1] for a, b, _ in items for p in (a, b)]
        return min(xs), min(ys), max(xs), max(ys)

    # Diameter: a circle with a stroke through it.
    for cx0, cy0, cx1, cy1 in circles:
        side = max(cx1 - cx0, cy1 - cy0)
        if not (0.4 * size <= side <= 1.05 * size) or cx0 < rx0 - pad or cx1 > rx1 + pad or cy0 < ry0 - pad or cy1 > ry1 + pad:
            continue
        ccx, ccy = (cx0 + cx1) / 2, (cy0 + cy1) / 2
        if not (ry0 + 0.2 * size <= ccy <= ry1 - 0.2 * size):
            continue
        for a, b, n in ds:
            if not (0.9 * side <= n <= 1.9 * side):
                continue
            # distance from the circle centre to the stroke, and the centre must lie between its ends
            vx, vy = b[0] - a[0], b[1] - a[1]
            tpar = ((ccx - a[0]) * vx + (ccy - a[1]) * vy) / (n * n)
            off = abs((ccx - a[0]) * vy - (ccy - a[1]) * vx) / n
            if 0.3 <= tpar <= 0.7 and off <= 0.15 * side:
                return "Ø", (min(cx0, a[0], b[0]), min(cy0, a[1], b[1]), max(cx1, a[0], b[0]), max(cy1, a[1], b[1]))
    tall = [v for v in vs if v[2] >= 0.35 * size]
    # Counterbore: two uprights joined by a bottom bar.
    if len(tall) == 2 and len(hs) == 1 and not ds and abs(tall[0][2] - tall[1][2]) <= 0.2 * max(tall[0][2], tall[1][2]):
        bottom = max(max(a[1], b[1]) for a, b, _ in tall)
        if any(abs(a[1] - bottom) <= 0.2 * size and n >= 0.3 * size for a, b, n in hs):
            return "⌴", box_of(tall + hs)
    def vee(items: list) -> bool:
        for i_, (a1, b1, n1) in enumerate(items):
            for a2, b2, n2 in items[i_ + 1:]:
                lo1, lo2 = max((a1, b1), key=lambda q: q[1]), max((a2, b2), key=lambda q: q[1])
                hi1, hi2 = min((a1, b1), key=lambda q: q[1]), min((a2, b2), key=lambda q: q[1])
                if math.hypot(lo1[0] - lo2[0], lo1[1] - lo2[1]) <= 0.12 * size and abs(hi1[1] - hi2[1]) <= 0.15 * size and (hi1[0] - lo1[0]) * (hi2[0] - lo2[0]) < 0 and abs(n1 - n2) <= 0.25 * max(n1, n2):
                    return True
        return False

    # Depth: a bar on top, a stem, and an arrowhead at the bottom.
    if len(tall) == 1 and len(ds) == 2 and len(hs) == 1 and vee(ds):
        top = min(min(a[1], b[1]) for a, b, _ in tall)
        if any(abs(a[1] - top) <= 0.25 * size for a, b, _ in hs):
            return "↧", box_of(tall + hs + ds)
    # Countersink: a V.
    if len(ds) == 2 and not tall and not hs and not vs and vee(ds) and all(0.4 * size <= n <= 1.3 * size for _, _, n in ds):
        return "⌵", box_of(ds)
    return None


def add_vector_symbols(lines: list[Line], page: Any, segs: list[tuple[tuple[float, float], tuple[float, float]]]) -> None:
    """Symbols some exporters draw as shapes instead of font glyphs are put back as tokens, left of the value."""
    circles = []
    for cv in page.curves:
        w, h = float(cv["width"]), float(cv["height"])
        pts = cv.get("pts") or []
        if w > 2 and h > 2 and 0.8 <= w / h <= 1.25 and not cv.get("fill") and len(pts) >= 4:
            first, last = pts[0], pts[-1]
            if math.hypot(float(first[0]) - float(last[0]), float(first[1]) - float(last[1])) <= 0.12 * max(w, h):
                circles.append((float(cv["x0"]), float(cv["top"]), float(cv["x1"]), float(cv["bottom"])))
    for ln in lines:
        if ln.rot != 0:
            continue
        for t in list(ln.tokens):
            if not NUMBER.match(t.text) or t.text[0] in "+-" or t.extra.get("stack_of"):
                continue
            s_ = t.size
            right = t.x0 - 0.02 * s_
            for turn in range(2):  # a value can carry two symbols: counterbore then diameter
                idx = ln.tokens.index(t)
                before = [o for o in ln.tokens[:idx] if not o.extra.get("synthetic")]
                prev = before[-1] if before else None
                if prev is not None and prev.kind in ("dia", "gdt", "pm"):
                    break
                left = right - (1.7 if turn == 0 else 2.6) * s_
                if prev is not None:
                    left = max(left, prev.x1 - 0.05 * s_)
                if right - left < 0.35 * s_:
                    break
                found = _classify_symbol((left, t.y0 - 0.1 * s_, right, min(t.y1, t.y0 + 0.85 * s_)), s_, circles, segs)  # the row below must stay out
                if not found:
                    break
                text, (bx0, by0, bx1, by1) = found
                tok = Token(content_id(t.page, text, bx0, by0), t.page, text, bx0, by0, bx1, by1, s_, "vector", 0, "dia" if text == "Ø" else "feat")
                tok.extra["synthetic"] = True
                first_synth = next((k for k, o in enumerate(ln.tokens[:idx]) if o.extra.get("synthetic") and o.x0 >= left - 2 * s_), idx)
                ln.tokens.insert(min(first_synth, idx), tok)
                right = bx0 - 0.02 * s_
                if text == "↧":
                    break  # a depth stands directly before its value; what lies further left is another feature


def _closed_circles(page: Any) -> list[tuple[float, float, float, float]]:
    out = []
    for cv in page.curves:
        w, h = float(cv["width"]), float(cv["height"])
        pts = cv.get("pts") or []
        if w > 2 and h > 2 and 0.8 <= w / h <= 1.25 and not cv.get("fill") and len(pts) >= 4:
            first, last = pts[0], pts[-1]
            if math.hypot(float(first[0]) - float(last[0]), float(first[1]) - float(last[1])) <= 0.12 * max(w, h):
                out.append((float(cv["x0"]), float(cv["top"]), float(cv["x1"]), float(cv["bottom"])))
    return out


def _frame_symbol(cell: tuple[float, float, float, float], size: float, circles: list[tuple[float, float, float, float]],
                  segs: list[tuple[tuple[float, float], tuple[float, float]]]) -> str | None:
    """
    The geometric characteristic drawn in the first cell of a feature control frame, told by its strokes:
    ⟂ a bar with an upright on it · ∥ two slanted strokes · ⏥ a parallelogram · ⌖ a circle with a cross ·
    ⏤ one bar · ∠ a bar and a slanted stroke · ⌯ three bars · ○ a circle · ◎ two circles · ⌭ a circle between two slanted strokes.
    None when the cell is empty; "?" when something is drawn that is not one of these.
    """
    x0, y0, x1, y1 = cell
    m = 0.04 * size
    inner = [(a, b) for a, b in segs if all(x0 + m <= p[0] <= x1 - m and y0 + m <= p[1] <= y1 - m for p in (a, b)) and math.dist(a, b) >= 0.12 * size]
    rings = [c for c in circles if x0 <= c[0] and c[2] <= x1 and y0 <= c[1] and c[3] <= y1]
    hs = [s for s in inner if abs(s[0][1] - s[1][1]) < 0.15 * math.dist(*s)]
    vs = [s for s in inner if abs(s[0][0] - s[1][0]) < 0.15 * math.dist(*s)]
    ds = [s for s in inner if s not in hs and s not in vs]
    if not inner and not rings:
        return None
    if rings:
        if hs and vs:
            return "⌖"
        if len(ds) == 2 and not hs and not vs:
            return "⌭"
        if not inner:
            return "◎" if len(rings) >= 2 else "○"
        return "?"
    shape = (len(hs), len(vs), len(ds))
    if shape == (1, 1, 0):
        return "⟂"
    if shape == (0, 0, 2):
        (a1, b1), (a2, b2) = ds
        slope = lambda a, b: math.atan2(b[1] - a[1], b[0] - a[0]) % math.pi  # noqa: E731
        return "∥" if abs(slope(a1, b1) - slope(a2, b2)) < 0.12 else "?"
    if shape == (2, 0, 2):
        return "⏥"
    if shape == (1, 0, 0):
        return "⏤"
    if shape == (1, 0, 1):
        return "∠"
    if shape == (3, 0, 0):
        return "⌯"
    return "?"


def add_frame_symbols(lines: list[Line], page: Any, segs: list[tuple[tuple[float, float], tuple[float, float]]]) -> None:
    """
    A feature control frame whose symbol is drawn, not typed, reads as a bare boxed value ("0.1 A").
    The value's cell has a square cell on its left: what is drawn there is the symbol, put back as the first token.
    """
    circles = _closed_circles(page)
    uprights = [(a[0], min(a[1], b[1]), max(a[1], b[1])) for a, b in segs if abs(a[0] - b[0]) < 0.5 and abs(a[1] - b[1]) >= 4]
    for ln in lines:
        t = ln.tokens[0]
        if ln.rot != 0 or t.kind != "text" or not NUMBER.match(t.text) or t.text[0] in "+-" or t.extra.get("stack"):
            continue
        s_ = t.size
        walls = [u for u in uprights if u[2] - u[1] >= 0.9 * s_ and u[1] <= t.cy <= u[2]]
        divider = max((u for u in walls if t.x0 - 1.0 * s_ <= u[0] <= t.x0 + 0.05 * s_), key=lambda u: u[0], default=None)
        if divider is None:
            continue
        left = max((u for u in walls if divider[0] - 2.4 * s_ <= u[0] <= divider[0] - 0.6 * s_), key=lambda u: u[0], default=None)
        if left is None:
            continue
        cell = (left[0], max(left[1], divider[1]), divider[0], min(left[2], divider[2]))
        tall, wide = cell[3] - cell[1], cell[2] - cell[0]
        # A frame cell is about as tall as its text and nearly square, and both its walls have that same height:
        # sheet borders and view outlines that happen to run past a value are neither.
        if not (1.05 * s_ <= tall <= 2.6 * s_ and 0.6 * tall <= wide <= 1.8 * tall):
            continue
        if any(abs((u[2] - u[1]) - tall) > 0.25 * s_ for u in (left, divider)):
            continue
        symbol = _frame_symbol(cell, s_, circles, segs)
        if symbol is None:
            continue
        tok = Token(content_id(t.page, symbol, cell[0], cell[1]), t.page, symbol, cell[0], cell[1], cell[2], cell[3], s_, "vector", 0, "gdt")
        tok.extra["synthetic"] = True
        ln.tokens.insert(0, tok)


def oriented_box(tokens: list[Token], size: float) -> dict[str, float] | None:
    """Box along the reading direction for diagonal text; None for upright or vertical text."""
    if not tokens or tokens[0].rot % 90 == 0:
        return None
    t0 = tokens[0]
    (ux, uy), (vx, vy) = t0.u, t0.v
    lo, hi, acr = 1e9, -1e9, 0.0
    for t in tokens:
        c = sum(t.along()) / 2
        half = max(1, len(t.text)) * 0.29 * t.size
        lo, hi = min(lo, c - half), max(hi, c + half)
        acr += t.across()
    acr /= len(tokens)
    mid = (lo + hi) / 2
    return {"cx": round(ux * mid + vx * acr, 2), "cy": round(uy * mid + vy * acr, 2), "w": round(hi - lo, 2), "h": round(0.85 * size, 2), "angle": t0.rot}


def place_balloons(records: list[dict[str, Any]], tokens: list[Token], width: float, height: float, size: float, radius: float = 12.0) -> None:
    """Pick, per callout, the first spot around it that covers no text and no other balloon."""
    boxes = [(t.x0, t.y0, t.x1, t.y1) for t in tokens if t.size >= 0.5 * size]
    placed: list[tuple[float, float]] = []
    dirs = [(1, -1), (-1, -1), (1, 1), (-1, 1), (1, 0), (-1, 0), (0, -1), (0, 1)]

    def cost(x: float, y: float, own: tuple[float, float, float, float]) -> float:
        if x < radius + 4 or y < radius + 4 or x > width - radius - 4 or y > height - radius - 4:
            return 1e6
        c = 0.0
        for bx0, by0, bx1, by1 in boxes:
            dx = max(bx0 - x, 0, x - bx1)
            dy = max(by0 - y, 0, y - by1)
            if dx * dx + dy * dy < (radius + 1.5) ** 2:
                c += 0.2 if (bx0, by0, bx1, by1) == own else 1.0
        for px, py in placed:
            if (px - x) ** 2 + (py - y) ** 2 < (2 * radius + 3) ** 2:
                c += 2.0
        return c

    for r in records:
        b = r["bbox"]
        ob = r.get("obox")
        if ob:
            cx, cy, hw, hh = ob["cx"], ob["cy"], ob["h"] * 0.7, ob["h"] * 0.7
        else:
            cx, cy, hw, hh = b["x"] + b["w"] / 2, b["y"] + b["h"] / 2, b["w"] / 2, b["h"] / 2
        own = (b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"])
        best, best_cost = None, 1e9
        chain = [1.9 * radius * k for k in range(1, int(r.get("_chain") or 0) + 1)]  # sub-balloons hang to its right
        for dist in (1.5, 2.6, 3.8, 5.2):
            for dx, dy in dirs:
                n = math.hypot(dx, dy)
                x = cx + dx * (hw if dx else 0) + dx / n * dist * size
                y = cy + dy * (hh if dy else 0) + dy / n * dist * size
                if chain and dx < 0:
                    x -= chain[-1]  # on the left of the callout the whole chain must fit before it
                c = cost(x, y, own) + sum(cost(x + off, y, own) for off in chain) + 0.02 * dist
                if c < best_cost:
                    best, best_cost = (x, y), c
            if best_cost < 0.2:
                break
        if best is None:
            best = (cx + hw + 1.5 * size, cy - hh - 1.5 * size)
        placed.append(best)
        placed.extend((best[0] + off, best[1]) for off in chain)
        r["balloonPos"] = {"x": round(float(best[0]), 2), "y": round(float(best[1]), 2)}


LETTER = re.compile(r"^[A-Z]$")


def mark_datum_boxes(tokens: list[Token], ink: Any) -> None:
    """A single letter in its own box is a datum feature symbol. Letters in a frame have boxed neighbours and stay."""
    if ink is None:
        return
    boxed: dict[str, bool] = {}

    def boxed_token(t: Token) -> bool:
        if t.id not in boxed:
            fitted = fit_box(ink, (t.x0, t.y0, t.x1, t.y1), t.rot, t.size)
            boxed[t.id] = is_boxed(ink, fitted, t.size)
        return boxed[t.id]

    for t in tokens:
        if t.kind != "text" or not LETTER.match(t.text) or t.rot != 0 or t.cls == "ruled":
            continue
        if not boxed_token(t):
            continue
        neighbours = [o for o in tokens if o is not t and o.rot == 0 and abs(o.cy - t.cy) <= 0.6 * t.size
                      and (0 <= o.x0 - t.x1 <= 2.2 * t.size or 0 <= t.x0 - o.x1 <= 2.2 * t.size)]
        if any(boxed_token(o) for o in neighbours):
            continue
        if any(o.kind == "gdt" and o.rot == 0 and abs(o.cy - t.cy) <= 0.8 * t.size and 0 <= t.x0 - o.x1 <= 9 * t.size for o in tokens):
            continue
        t.extra["datum_box"] = True


def nominal_token(line: Line) -> Token | None:
    for t in line.tokens:
        if t.kind == "text" and NUMBER.match(t.text) and t.text[0] not in "+-":
            return t
    return None


def is_basic(line: Line, ink: Any) -> bool:
    """The nominal sits in its own drawn box: a theoretically exact (basic) dimension."""
    if ink is None:
        return False
    t = nominal_token(line)
    if t is None:
        return False
    fitted = fit_box(ink, (t.x0, t.y0, t.x1, t.y1), t.rot, t.size)
    return is_boxed(ink, fitted, t.size)


def enclosures(page: Any) -> dict[str, list[tuple[float, float, float, float]]]:
    """Closed shapes that may be drawn round a callout: whole curves, and ovals built from two lines and two end arcs."""
    shapes = []
    arcs = []
    for cv in page.curves:
        w, h = float(cv["width"]), float(cv["height"])
        box = (float(cv["x0"]), float(cv["top"]), float(cv["x1"]), float(cv["bottom"]))
        if 6 <= w <= 260 and 6 <= h <= 90:
            shapes.append(box)
        if 4 <= w <= 60 and 4 <= h <= 60:
            arcs.append(box)
    hlines = []
    for ln in page.lines:
        if abs(float(ln["bottom"]) - float(ln["top"])) < 0.6 and 8 <= float(ln["width"]) <= 300:
            hlines.append((float(ln["x0"]), float(ln["top"]), float(ln["x1"])))
    return {"shapes": shapes, "arcs": arcs, "hlines": hlines}


def enclosure_of(box: tuple[float, float, float, float], size: float, geo: dict[str, list]) -> str | None:
    """'flag' when an oval is drawn round the callout, 'bubble' when a circle is drawn round it."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    for sx0, sy0, sx1, sy1 in geo["shapes"]:
        if sx0 <= x0 + 0.5 and sy0 <= y0 + 0.5 and sx1 >= x1 - 0.5 and sy1 >= y1 - 0.5:
            sw, sh = sx1 - sx0, sy1 - sy0
            if sw <= w + 5 * size and sh <= h + 2.6 * size:
                return "bubble" if sw / sh < 1.25 else "flag"
    # Two parallel lines above and below with the same ends, closed by arcs.
    above = [l for l in geo["hlines"] if y0 - 1.6 * size <= l[1] <= y0 + 0.5 and l[0] <= x0 + 0.35 * w and l[2] >= x1 - 0.35 * w and l[2] - l[0] <= w + 6 * size]
    below = [l for l in geo["hlines"] if y1 - 0.5 <= l[1] <= y1 + 1.6 * size and l[0] <= x0 + 0.35 * w and l[2] >= x1 - 0.35 * w and l[2] - l[0] <= w + 6 * size]
    for a in above:
        for b in below:
            if abs(a[0] - b[0]) > 1.5 or abs(a[2] - b[2]) > 1.5:
                continue
            gap = b[1] - a[1]
            ends = 0
            for ex in (a[0], a[2]):
                if any(abs(((ax0 + ax1) / 2) - ex) <= 0.6 * gap and ay0 >= a[1] - 1 and ay1 <= b[1] + 1 and (ay1 - ay0) >= 0.4 * gap for ax0, ay0, ax1, ay1 in geo["arcs"]):
                    ends += 1
            if ends == 2:
                return "flag"
    return None


def attach_modifier_lines(lines: list[Line]) -> list[Line]:
    """A line that is only "TYP" or "TYP ON BOTH ENDS" belongs to the callout right above it."""
    def words(ln: Line) -> list[str]:
        return [t.text.upper().strip(".") for t in ln.tokens]

    mods = [ln for ln in lines if ln.rot == 0 and words(ln)[0] in ("TYP", "TYPICAL") and all(re.fullmatch(r"[A-Z]+", w) for w in words(ln))]
    for m in mods:
        mx0, my0, mx1, my1 = m.bbox
        best, best_gap = None, 1e9
        for ln in lines:
            if ln is m or ln in mods or ln.rot != 0 or nominal_token(ln) is None and not any(t.kind == "text" and t.text[:1] == "R" for t in ln.tokens):
                continue
            x0, y0, x1, y1 = ln.bbox
            gap = my0 - y1
            if -0.3 * m.size <= gap <= 1.2 * m.size and min(mx1, x1) - max(mx0, x0) > 0 and gap < best_gap:
                best, best_gap = ln, gap
        if best is not None:
            best.notes_below = getattr(best, "notes_below", []) + [t.text for t in m.tokens]  # type: ignore[attr-defined]
            best.extra_tokens = getattr(best, "extra_tokens", []) + list(m.tokens)  # type: ignore[attr-defined]
            lines.remove(m)
    return lines
