"""
Status stamp and legend for the ballooned drawing: what they say and where they may sit.

Pure logic, no PDF library: the caller hands in an ink mask of the sheet and draws the result.
The stamp never claims more than the results support, and nothing is placed over the drawing.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from .characteristics import derive_limits, display_status

GREEN, RED, AMBER = "#15803d", "#b91c1c", "#b45309"


@dataclass(frozen=True)
class Summary:
    total: int
    passed: int
    failed: int
    accepted: int  # reviewed, no result yet
    draft: int  # not reviewed
    to_measure: int  # rows that need a result (reference and basic dimensions do not)
    measured: int

    @property
    def verdict(self) -> str:
        if self.failed:
            return "REJECTED"
        if self.to_measure and self.measured == self.to_measure:
            return "ACCEPTED"
        return "IN PROGRESS"

    @property
    def color(self) -> str:
        return {"REJECTED": RED, "ACCEPTED": GREEN}.get(self.verdict, AMBER)


def summarise(chars: list[dict[str, Any]], defaults: dict[str, Any]) -> Summary:
    counts = {"Pass": 0, "Fail": 0, "Accepted": 0, "Draft": 0}
    to_measure = measured = 0
    for c in chars:
        status = display_status(c, derive_limits(c, defaults))
        counts[status] = counts.get(status, 0) + 1
        if c.get("toleranceType") in ("Reference", "Basic"):
            continue
        to_measure += 1
        if status in ("Pass", "Fail"):
            measured += 1
    return Summary(len(chars), counts["Pass"], counts["Fail"], counts["Accepted"], counts["Draft"], to_measure, measured)


def stamp_lines(summary: Summary, fair_number: str, day: str) -> tuple[str, str, str]:
    ident = " · ".join(x for x in (fair_number.strip(), day) if x)
    tail = f"{summary.measured} of {summary.to_measure} measured · {summary.failed} nonconforming"
    return f"FAI {summary.verdict}", ident, tail


def legend_rows(summary: Summary) -> list[tuple[str, str, int]]:
    """(mark, label, count) for every state that is present on the drawing."""
    rows = [("pass", "Pass", summary.passed), ("fail", "Fail", summary.failed), ("accepted", "Accepted, not measured", summary.accepted), ("draft", "Draft, not reviewed", summary.draft)]
    return [r for r in rows if r[2] > 0]


def find_free_box(ink: np.ndarray, box_w: int, box_h: int, margin: int, prefer: tuple[int, int], max_ink: float = 0.0) -> tuple[int, int] | None:
    """
    Top-left cell of the emptiest box_w x box_h window in the ink mask, nearest to `prefer` among equals.
    Returns None when every window holds more ink than `max_ink` (a fraction of the window): no clear space.
    """
    rows, cols = ink.shape
    if box_h + 2 * margin > rows or box_w + 2 * margin > cols:
        return None
    table = np.zeros((rows + 1, cols + 1), dtype=np.int64)
    table[1:, 1:] = ink.astype(np.int64).cumsum(0).cumsum(1)
    sums = table[box_h:, box_w:] - table[:-box_h, box_w:] - table[box_h:, :-box_w] + table[:-box_h, :-box_w]
    sums = sums[margin : rows - box_h - margin + 1, margin : cols - box_w - margin + 1]
    if sums.size == 0:
        return None
    ys, xs = np.mgrid[0 : sums.shape[0], 0 : sums.shape[1]]
    distance = np.hypot(xs + margin + box_w / 2 - prefer[0], ys + margin + box_h / 2 - prefer[1])
    cost = sums * 1e6 + distance
    y, x = np.unravel_index(int(np.argmin(cost)), cost.shape)
    if sums[y, x] > max_ink * box_w * box_h:
        return None
    return int(x) + margin, int(y) + margin
