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

from .grouper import COUNT, NUMBER, Line
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
