"""
A general tolerance table understood from its cells: which column is which size range, which row is which class.

Works on the grid from recognize/tables.py. Nothing is assumed about where the ranges are: they are read from
the heading cells ("UPTO 3", "OVER 3 UPTO 6", "OVER 400"), so a company table with its own ranges reads correctly.
"""
from __future__ import annotations

import re
from typing import Any

CLASS_OF = {"f": "f", "fine": "f", "m": "m", "medium": "m", "c": "c", "coarse": "c", "v": "v", "very coarse": "v"}
OVER_UPTO = re.compile(r"OVER\s*(\d+(?:[.,]\d+)?)\s*(?:UP\s*TO|TO|-)\s*(\d+(?:[.,]\d+)?)", re.I)
UPTO = re.compile(r"^(?:UP\s*TO|≤|<=)\s*(\d+(?:[.,]\d+)?)$", re.I)
OVER = re.compile(r"^(?:OVER|>)\s*(\d+(?:[.,]\d+)?)$", re.I)
LINEAR = re.compile(r"^±\s*(\d+(?:[.,]\d+)?)$")
ANGULAR = re.compile(r"^±\s*(\d+)\s*°\s*(?:(\d+)\s*')?$")
OPEN_END = 1e9  # "OVER 400" has no upper bound


def _f(s: str) -> float:
    return float(s.replace(",", "."))


def _range(text: str | None) -> tuple[float, float] | None:
    t = (text or "").strip()
    m = OVER_UPTO.search(t)
    if m:
        return _f(m.group(1)), _f(m.group(2))
    m = UPTO.match(t)
    if m:
        return 0.0, _f(m.group(1))
    m = OVER.match(t)
    if m:
        return _f(m.group(1)), OPEN_END
    return None


def read_tolerance_grid(rows: list[list[str | None]]) -> dict[str, Any] | None:
    """
    {'linear': {cls: [[lo, hi, tol], ...]}, 'angular': {cls: [[lo, hi, degrees], ...]}} or None when the grid
    is not a tolerance table. A merged cell (None) takes the value of the cell above it: one printed value
    shared by two classes.
    """
    heading = max(rows, key=lambda r: sum(1 for c in r if _range(c)), default=None)
    if heading is None or sum(1 for c in heading if _range(c)) < 3:
        return None
    ranges = {i: _range(c) for i, c in enumerate(heading) if _range(c)}
    linear: dict[str, list[list[float]]] = {}
    angular: dict[str, list[list[float]]] = {}
    above: dict[int, str | None] = {}
    for row in rows:
        label = next((CLASS_OF[c.strip().lower()] for c in row[:3] if c and c.strip().lower() in CLASS_OF), None)
        if label is None:
            continue
        for i, span in ranges.items():
            cell = row[i] if i < len(row) else None
            if cell is None:
                cell = above.get(i)
            above[i] = cell
            text = (cell or "").strip()
            m = LINEAR.match(text)
            if m:
                linear.setdefault(label, []).append([span[0], span[1], _f(m.group(1))])
                continue
            m = ANGULAR.match(text)
            if m:
                angular.setdefault(label, []).append([span[0], span[1], round(int(m.group(1)) + int(m.group(2) or 0) / 60, 4)])
    if not linear:
        return None
    return {"linear": {k: sorted(v) for k, v in linear.items()}, "angular": {k: sorted(v) for k, v in angular.items()}}
