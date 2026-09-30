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
    margin_x, margin_y = width * 0.03, height * 0.035
    tokens = [t for t in tokens if t.size >= 5]
    left = [t for t in tokens if t.rot == 0 and _LETTER.match(t.text) and t.cx < margin_x]
    right = [t for t in tokens if t.rot == 0 and _LETTER.match(t.text) and t.cx > width - margin_x]
    top = [t for t in tokens if t.rot == 0 and _NUMBER.match(t.text) and t.cy < margin_y]
    bottom = [t for t in tokens if t.rot == 0 and _NUMBER.match(t.text) and t.cy > height - margin_y]

    letters = left if len(left) >= len(right) else right
    numbers = top if len(top) >= len(bottom) else bottom
    if len(letters) < 2 or len(numbers) < 3:
        return None
    # Border labels share one font size; drop strays of another size.
    from collections import Counter
    common = Counter(round(t.size) for t in letters + numbers).most_common(1)[0][0]
    keep = lambda t: abs(t.size - common) <= max(1.0, 0.15 * common)  # noqa: E731
    left, right, top, bottom = [[t for t in g if keep(t)] for g in (left, right, top, bottom)]
    letters = left if len(left) >= len(right) else right
    numbers = top if len(top) >= len(bottom) else bottom
    if len(letters) < 2 or len(numbers) < 3:
        return None
    for t in left + right + top + bottom:
        t.cls, t.reason = "ruled", "zone label"

    # Merge duplicates (same label printed on both edges) by averaging positions.
    def centres(items: list[Token], axis: str) -> list[tuple[float, str]]:
        by: dict[str, list[float]] = {}
        for t in items:
            by.setdefault(t.text, []).append(getattr(t, axis))
        return [(sum(v) / len(v), k) for k, v in by.items()]

    return ZoneGrid(cols=_edges(centres(numbers, "cx"), width), rows=_edges(centres(letters, "cy"), height))


def synthetic_grid(width: float, height: float) -> ZoneGrid:
    """No border labels printed: a nominal grid so every record still has a zone."""
    ncols = 8 if width >= height else 6
    nrows = 6 if width >= height else 8
    cols = [(width * (i + 1) / ncols, str(i + 1)) for i in range(ncols)]
    rows = [(height * (i + 1) / nrows, chr(ord("A") + i)) for i in range(nrows)]
    return ZoneGrid(cols=cols, rows=rows)
