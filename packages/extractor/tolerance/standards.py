"""
General tolerance tables that drawings refer to by name.

ISO 2768-1 (general tolerances for linear and angular dimensions without individual tolerance indications).
Rows are (over, up to and including, plus/minus). A class that has no value for a range omits it.
These tables are the reference copy: a model or a parser never supplies standard values from memory.
"""
from __future__ import annotations

Row = tuple[float, float, float]

ISO_2768_LINEAR: dict[str, list[Row]] = {
    "f": [(0.5, 3, 0.05), (3, 6, 0.05), (6, 30, 0.1), (30, 120, 0.15), (120, 400, 0.2), (400, 1000, 0.3), (1000, 2000, 0.5)],
    "m": [(0.5, 3, 0.1), (3, 6, 0.1), (6, 30, 0.2), (30, 120, 0.3), (120, 400, 0.5), (400, 1000, 0.8), (1000, 2000, 1.2), (2000, 4000, 2.0)],
    "c": [(0.5, 3, 0.2), (3, 6, 0.3), (6, 30, 0.5), (30, 120, 0.8), (120, 400, 1.2), (400, 1000, 2.0), (1000, 2000, 3.0), (2000, 4000, 4.0)],
    "v": [(3, 6, 0.5), (6, 30, 1.0), (30, 120, 1.5), (120, 400, 2.5), (400, 1000, 4.0), (1000, 2000, 6.0), (2000, 4000, 8.0)],
}

# External radii and chamfer heights (broken edges).
ISO_2768_RADIUS: dict[str, list[Row]] = {
    "f": [(0.5, 3, 0.2), (3, 6, 0.5), (6, 1e9, 1.0)],
    "m": [(0.5, 3, 0.2), (3, 6, 0.5), (6, 1e9, 1.0)],
    "c": [(0.5, 3, 0.4), (3, 6, 1.0), (6, 1e9, 2.0)],
    "v": [(0.5, 3, 0.4), (3, 6, 1.0), (6, 1e9, 2.0)],
}

CLASS_NAMES = {"fine": "f", "medium": "m", "coarse": "c", "very coarse": "v", "f": "f", "m": "m", "c": "c", "v": "v"}
CLASS_LABEL = {"f": "fine", "m": "medium", "c": "coarse", "v": "very coarse"}


def lookup(rows: list[Row] | list[list[float]], value: float) -> Row | None:
    """The row whose range holds |value|: over the lower bound, up to and including the upper one."""
    v = abs(float(value))
    for i, (lo, hi, tol) in enumerate(rows):
        if (v > lo or (i == 0 and v >= lo)) and v <= hi:
            return float(lo), float(hi), float(tol)
    return None
