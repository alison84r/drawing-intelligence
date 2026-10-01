"""
Step 2: border letters and numbers become the zone grid. Zone labels are ruled out from then on.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .tokens import Token

_LETTER = re.compile(r"^[A-Z]$")
_NUMBER = re.compile(r"^\d{1,2}$")


@dataclass
class ZoneGrid:
    cols: list[tuple[float, str]]  # (right edge x, label) sorted by x
    rows: list[tuple[float, str]]  # (bottom edge y, label) sorted by y

    def zone(self, x: float, y: float) -> str:
        col = next((label for edge, label in self.cols if x <= edge), self.cols[-1][1] if self.cols else "")
        row = next((label for edge, label in self.rows if y <= edge), self.rows[-1][1] if self.rows else "")
        return f"{row}{col}"


def _edges(labels: list[tuple[float, str]], extent: float) -> list[tuple[float, str]]:
    labels = sorted(labels)
    out = []
    for i, (c, label) in enumerate(labels):
        edge = (c + labels[i + 1][0]) / 2 if i + 1 < len(labels) else extent
        out.append((edge, label))
    return out


def detect_zones(tokens: list[Token], width: float, height: float) -> ZoneGrid | None:
    """Border labels: a row of numbers along the top or bottom, a column of letters down a side."""
    cand = [t for t in tokens if t.rot == 0 and t.size >= 3]

    def clusters(items: list[Token], axis: str, spread_axis: str, extent: float, need: int) -> list[list[Token]]:
        by: dict[int, list[Token]] = {}
        for t in items:
            by.setdefault(int(round(getattr(t, axis) / 4)), []).append(t)
        out = []
        for key in sorted(by):
            grp = by[key] + by.get(key + 1, [])
            labels = {t.text for t in grp}
            span = max(getattr(t, spread_axis) for t in grp) - min(getattr(t, spread_axis) for t in grp)
            sizes = {round(t.size) for t in grp}
            if len(labels) >= need and len(grp) <= len(labels) + 1 and span >= 0.4 * extent and len(sizes) <= 2:
                out.append(grp)
        return out

    numbers = [t for t in cand if _NUMBER.match(t.text) and (t.cy < 0.09 * height or t.cy > 0.91 * height)]
    letters = [t for t in cand if _LETTER.match(t.text) and (t.cx < 0.09 * width or t.cx > 0.91 * width)]
    rows = clusters(numbers, "cy", "cx", width, 3)
    cols = clusters(letters, "cx", "cy", height, 2)
    if not rows or not cols:
        return None
    for grp in rows + cols:
        for t in grp:
            t.cls, t.reason = "ruled", "zone label"
    row = max(rows, key=len)
    col = max(cols, key=len)
    return ZoneGrid(cols=_edges([(t.cx, t.text) for t in row], width), rows=_edges([(t.cy, t.text) for t in col], height))


def synthetic_grid(width: float, height: float) -> ZoneGrid:
    """No border labels printed: a nominal grid so every record still has a zone."""
    ncols = 8 if width >= height else 6
    nrows = 6 if width >= height else 8
    cols = [(width * (i + 1) / ncols, str(i + 1)) for i in range(ncols)]
    rows = [(height * (i + 1) / nrows, chr(ord("A") + i)) for i in range(nrows)]
    return ZoneGrid(cols=cols, rows=rows)
