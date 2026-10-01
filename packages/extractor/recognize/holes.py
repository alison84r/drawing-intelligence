"""
Hole tables: found by what they say, not by their rules.

A hole table lists holes by tag with their X and Y position and their size:

    TAG   X LOC   Y LOC   SIZE            HOLE  XDIM  YDIM  DESCRIPTION
    A1    -460    149.5   Ø11 THRU        A1    33,00 -16,00 Ø6.0H7 THRU

General table finders miss them on a drawing sheet (the table often shares its rules with the sheet border,
or has merged SIZE cells), and then its cells get ballooned one by one as if they were dimensions. The heading
row is unmistakable, so the table is located from it: the heading, then every row under the tag column.
"""
from __future__ import annotations

import re

from .tokens import Token

Box = tuple[float, float, float, float]

TAG_HEAD = re.compile(r"^(TAG|HOLE|HOLE\s*NO\.?|REF)$", re.I)
X_HEAD = re.compile(r"^X(\s*LOC|DIM|\s*POS|\s*COORD)?\.?$", re.I)
Y_HEAD = re.compile(r"^Y(\s*LOC|DIM|\s*POS|\s*COORD)?\.?$", re.I)
TAG = re.compile(r"^[A-Z]{1,2}\d{1,3}$")


def find_hole_tables(tokens: list[Token], width: float, height: float) -> list[Box]:
    upright = [t for t in tokens if t.rot == 0 and t.text.strip()]
    out: list[Box] = []
    for head in upright:
        if not TAG_HEAD.match(head.text.strip()):
            continue
        cy, size = (head.y0 + head.y1) / 2, head.size
        row = sorted((t for t in upright if abs((t.y0 + t.y1) / 2 - cy) <= 0.6 * size and t.x0 > head.x0 and t.x0 - head.x1 <= 0.5 * width), key=lambda t: t.x0)
        # The heading continues until the next table's TAG heading on the same row.
        stop = next((t.x0 for t in row if TAG_HEAD.match(t.text.strip())), None)
        row = [t for t in row if stop is None or t.x0 < stop]
        words = [t.text.strip() for t in row]
        joined = [f"{a} {b}" for a, b in zip(words, words[1:])]  # "X" "LOC" arrive as two words
        has_x = any(X_HEAD.match(w) for w in words + joined)
        has_y = any(Y_HEAD.match(w) for w in words + joined)
        if not (has_x and has_y):
            continue
        # Rows: tags under the heading, one below the other.
        column = sorted((t for t in upright if TAG.match(t.text.strip()) and t.y0 > head.y1 - 0.2 * size
                         and abs((t.x0 + t.x1) / 2 - (head.x0 + head.x1) / 2) <= 2.5 * size), key=lambda t: t.y0)
        rows: list[Token] = []
        for t in column:
            last = rows[-1] if rows else head
            if t.y0 - last.y1 > 3.2 * max(size, t.size):
                break
            rows.append(t)
        if len(rows) < 3:
            continue
        top, bottom = head.y0, rows[-1].y1
        # The last heading (SIZE, DESCRIPTION) is centred over a wide column: allow for the text that runs past it,
        # but never into the next table.
        heading_end = max((t.x1 for t in row if t.x0 - head.x1 <= 0.35 * width), default=head.x1)
        right_limit = heading_end + 9.0 * size
        if stop is not None:
            right_limit = min(right_limit, stop - 0.5 * size)
        inside = [t for t in upright if top - 0.5 * size <= (t.y0 + t.y1) / 2 <= bottom + 0.5 * size and head.x0 - size <= t.x0 and t.x1 <= right_limit]
        # Table text runs on from the headings without a wide gap; text of a view beside the table is a gap away.
        right = heading_end
        for t in sorted(inside, key=lambda t: t.x0):
            if t.x0 - right > 2.5 * size:
                break
            right = max(right, t.x1)
        out.append((max(0.0, head.x0 - 1.2 * size), max(0.0, top - 0.8 * size), min(width, right + 1.2 * size), min(height, bottom + 0.8 * size)))
    return out
