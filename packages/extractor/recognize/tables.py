"""
A table read cell by cell.

Finding a table on a whole drawing sheet is unreliable with any general table finder (dimension lines and
frames look like rules). So the region comes from our own detector (protected.py), and only then is the
ruled grid inside it resolved into rows and columns. Cell text is taken glyph by glyph (words in a tight
heading run across cell borders, so word boxes cannot be used), minus anything that is not printed.
"""
from __future__ import annotations

import re
from typing import Any

Box = tuple[float, float, float, float]


NUM = re.compile(r"\d+(?:[.,]\d+)?")


def tidy(text: str | None) -> str | None:
    """
    Cell text in reading order. Symbol glyphs (±, °) are stored after the digits they belong to, so a cell
    reads "0.05 ±" or "0 30' ±°" in the file: put them back where they are printed.
    """
    if text is None:
        return None
    t = re.sub(r"\s+", " ", text).strip()
    if "±" in t and not re.search(r"[A-Za-z]", t):
        nums = NUM.findall(t)
        if "°" in t and nums:
            return f"±{nums[0]}°" + (f"{nums[1]}'" if len(nums) > 1 else "")
        if len(nums) == 1:
            return f"±{nums[0]}"
    return t


def read_grid(page: Any, box: Box, hidden: list[Box] = ()) -> dict[str, Any] | None:
    """
    The ruled grid inside `box` as rows of cell text. A merged cell appears once, in its first position; the
    positions it covers hold None. `hidden` are boxes of text that is in the file but not visible.
    Returns None when no grid of at least 2 x 2 is found.
    """
    width, height = float(page.width), float(page.height)
    clip = (max(0.0, box[0] - 3), max(0.0, box[1] - 3), min(width, box[2] + 3), min(height, box[3] + 3))

    def printed(obj: dict[str, Any]) -> bool:
        if obj.get("object_type") != "char":
            return True
        cx, cy = (obj["x0"] + obj["x1"]) / 2, (obj["top"] + obj["bottom"]) / 2
        return not any(b[0] <= cx <= b[2] and b[1] <= cy <= b[3] for b in hidden)

    try:
        found = page.crop(clip).filter(printed).find_tables()
    except Exception:  # noqa: BLE001 - no grid is an answer, not an error
        return None
    if not found:
        return None
    table = max(found, key=lambda t: len(t.cells))
    rows = [[tidy(c) for c in row] for row in table.extract()]
    boxes = [[None if c is None else [round(float(v), 1) for v in c] for c in row.cells] for row in table.rows]
    cols = max((len(r) for r in rows), default=0)
    if len(rows) < 2 or cols < 2:
        return None
    x0, y0, x1, y1 = (float(v) for v in table.bbox)
    return {
        "bbox": {"x": round(x0, 1), "y": round(y0, 1), "w": round(x1 - x0, 1), "h": round(y1 - y0, 1)},
        "rows": [r + [None] * (cols - len(r)) for r in rows],
        "cells": [b + [None] * (cols - len(b)) for b in boxes],
        "cols": cols,
    }
