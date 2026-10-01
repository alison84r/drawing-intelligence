"""
One callout, one balloon.

A hole callout is written as one block and points at the hole with one leader:

    6 x Ø5 ↧15          row 1: the drilled hole and its depth
    M6 - 6H ↧12         row 2: the thread cut in it and its depth

Read word by word it falls apart: the depth symbol is drawn, not typed, so it leaves a gap in the row, and the
second row has no leader of its own. Two steps put it back together:

    mark_row_pieces   a piece on the same baseline, after a drawn symbol, belongs to the piece before it
    stack_rows        a row that starts with a thread or a hole symbol, directly under a hole row, belongs to it

The first piece carries the balloon. Every other piece is a feature to measure in its own right, so it stays
its own line in the report, as a sub-row of that balloon: 7 Ø5 · 7.1 ↧15 · 7.2 M6-6H · 7.3 ↧12.
"""
from __future__ import annotations

import math
import re

from .grouper import COUNT, NUMBER, PAREN_COUNT, Line

Segment = tuple[tuple[float, float], tuple[float, float]]

THREAD_START = re.compile(r"^(M|G|Tr|UN[CF]?)\d", re.I)


def _same_row(a: Line, b: Line) -> bool:
    size = max(a.size, b.size)
    return a.rot == 0 and b.rot == 0 and min(a.size, b.size) >= 0.85 * size and abs(a.tokens[-1].cy - b.tokens[0].cy) <= 0.35 * size


def _symbol_between(x0: float, x1: float, y0: float, y1: float, size: float, segs: list[Segment]) -> bool:
    """Strokes that begin and end inside the gap and stand about as tall as the text: a drawn symbol, not a line passing by."""
    pad = 0.15 * size
    inside = [(a, b) for a, b in segs
              if all(x0 - pad <= p[0] <= x1 + pad and y0 - pad <= p[1] <= y1 + pad for p in (a, b)) and math.dist(a, b) >= 0.1 * size]
    if len(inside) < 2:
        return False
    ys = [p[1] for a, b in inside for p in (a, b)]
    return max(ys) - min(ys) >= 0.45 * size


def head_of(line: Line) -> Line:
    """The first piece of the callout this line belongs to (the line itself when it stands alone)."""
    seen = 0
    while getattr(line, "sub_of", None) is not None and seen < 8:
        line, seen = line.sub_of, seen + 1  # type: ignore[attr-defined]
    return line


def mark_row_pieces(lines: list[Line], segs: list[Segment]) -> None:
    upright = sorted((ln for ln in lines if ln.rot == 0), key=lambda ln: ln.tokens[0].x0)
    for b in upright:
        first = b.tokens[0]
        if not (first.kind == "text" and (NUMBER.match(first.text) and first.text[0] not in "+-" or first.text.upper() == "THRU")):
            continue
        best, best_gap = None, 1e9
        for a in upright:
            if a is b or not _same_row(a, b):
                continue
            last = a.tokens[-1]
            gap = first.x0 - max(t.x1 for t in a.tokens)
            size = max(a.size, b.size)
            if not (0.3 * size <= gap <= 3.0 * size) or gap >= best_gap:
                continue
            if _symbol_between(first.x0 - gap, first.x0, min(last.y0, first.y0), max(last.y1, first.y1), size, segs):
                best, best_gap = a, gap
        if best is not None and head_of(best) is not b:
            b.sub_of = head_of(best)  # type: ignore[attr-defined]


def attach_counts(lines: list[Line]) -> list[Line]:
    """A count written on its own, "(4X)", belongs to the callout it follows on the same baseline or sits under."""
    for c in [ln for ln in lines if len(ln.tokens) == 1 and PAREN_COUNT.match(ln.tokens[0].text)]:
        tok = c.tokens[0]
        best, best_cost = None, 1e9
        for ln in lines:
            if ln is c or ln.rot != c.rot or not any(NUMBER.match(t.text) or t.kind == "dia" for t in ln.tokens):
                continue
            size = max(ln.size, tok.size)
            lo = min(t.along()[0] for t in ln.all_tokens)
            hi = max(t.along()[1] for t in ln.all_tokens)
            rows = [t.across() for t in ln.all_tokens]
            after = tok.along()[0] - hi
            down = tok.across() - max(rows)
            if 0 <= after <= 3.5 * size and min(rows) - 0.5 * size <= tok.across() <= max(rows) + 0.5 * size:
                cost = after
            elif 0.4 * size <= down <= 1.6 * size and tok.along()[0] <= hi and tok.along()[1] >= lo:
                cost = down + 2 * size
            else:
                continue
            if cost < best_cost:
                best, best_cost = ln, cost
        if best is not None:
            best.tokens.append(tok)
            lines.remove(c)
    return lines


def _hole_row(line: Line) -> bool:
    return any(t.kind == "dia" or COUNT.match(t.text) or THREAD_START.match(t.text) for t in line.tokens)


def _sub_row_start(line: Line) -> bool:
    first = line.tokens[0]
    return first.kind == "feat" or (first.kind == "text" and bool(THREAD_START.match(first.text)))


def stack_rows(lines: list[Line]) -> None:
    """Marks each sub-row with `sub_of`: the first row of the callout it belongs to."""
    upright = sorted((ln for ln in lines if ln.rot == 0), key=lambda ln: ln.bbox[1])
    for row in upright:
        if not _sub_row_start(row):
            continue
        x0, y0, x1, _ = row.bbox
        best, best_gap = None, 1e9
        for above in upright:
            if above is row or min(above.size, row.size) < 0.85 * max(above.size, row.size):
                continue
            ax0, _, ax1, ay1 = above.bbox
            gap = y0 - ay1
            overlap = min(x1, ax1) - max(x0, ax0)
            if -0.3 * row.size <= gap <= 0.9 * row.size and overlap >= 0.5 * min(x1 - x0, ax1 - ax0) and gap < best_gap:
                best, best_gap = above, gap
        if best is None:
            continue
        head = head_of(best)
        if _hole_row(head) and head is not row and getattr(row, "sub_of", None) is None:
            row.sub_of = head  # type: ignore[attr-defined]
