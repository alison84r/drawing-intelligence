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


def add_vector_diameter(lines: list[Line], page: Any) -> None:
    """Some exporters draw the diameter sign as a small circle with a stroke. Put it back before the number."""
    circles = []
    for cv in page.curves:
        w, h = float(cv["width"]), float(cv["height"])
        if w > 2 and h > 2 and 0.75 <= w / h <= 1.33:
            circles.append((float(cv["x0"]), float(cv["top"]), float(cv["x1"]), float(cv["bottom"])))
    if not circles:
        return
    for ln in lines:
        if ln.rot != 0:
            continue
        for i, t in enumerate(list(ln.tokens)):
            if not NUMBER.match(t.text) or t.text[0] in "+-":
                continue
            prev = ln.tokens[i - 1] if i > 0 else None
            if prev is not None and prev.kind == "dia":
                continue
            s = t.size
            left_limit = prev.x1 if prev is not None and not COUNT.match(prev.text) else t.x0 - 1.6 * s
            for cx0, cy0, cx1, cy1 in circles:
                side = max(cx1 - cx0, cy1 - cy0)
                if not (0.4 * s <= side <= 1.0 * s):
                    continue
                if cx1 <= t.x0 + 0.1 * s and cx0 >= max(left_limit - 0.2 * s, t.x0 - 1.6 * s) and cy0 >= t.y0 - 0.5 * s and cy1 <= t.y1 + 0.5 * s:
                    dia = Token(content_id(t.page, "Ø", cx0, cy0), t.page, "Ø", cx0, cy0, cx1, cy1, s, "vector", 0, "dia")
                    dia.extra["synthetic"] = True
                    ln.tokens.insert(ln.tokens.index(t), dia)
                    break


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
        for dist in (1.5, 2.6, 3.8, 5.2):
            for dx, dy in dirs:
                n = math.hypot(dx, dy)
                x = cx + dx * (hw if dx else 0) + dx / n * dist * size
                y = cy + dy * (hh if dy else 0) + dy / n * dist * size
                c = cost(x, y, own) + 0.02 * dist
                if c < best_cost:
                    best, best_cost = (x, y), c
            if best_cost < 0.2:
                break
        if best is None:
            best = (cx + hw + 1.5 * size, cy - hh - 1.5 * size)
        placed.append(best)
        r["balloonPos"] = {"x": round(best[0], 2), "y": round(best[1], 2)}


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
