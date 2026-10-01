"""
Fit a callout box to the actual ink.

The text box stored in a PDF comes from font metrics: for several CAD fonts it starts below the
top of the digits and includes empty space under the baseline. Highlights and leaders drawn from
it land too low. We render the page once in grey and tighten each box to the rows and columns
that really hold ink, ignoring ruled lines (dimension lines, frame borders).

Demo build renders with PyMuPDF (AGPL); the shipped build swaps this one function for pypdfium2.
"""
from __future__ import annotations

import numpy as np

SCALE = 3.0  # pixels per point
DARK = 200  # grey level below which a pixel counts as ink
Box = tuple[float, float, float, float]


def render_gray(pdf_bytes: bytes, page_index: int) -> np.ndarray:
    import fitz  # PyMuPDF

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        pix = doc[page_index].get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), colorspace=fitz.csGRAY, alpha=False)
        return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width).copy()
    finally:
        doc.close()


def _best_run(counts: np.ndarray, extent: int) -> tuple[int, int] | None:
    """Longest run of lines that hold some ink; ruled lines (ink across most of the box) break runs."""
    ruled = counts >= 0.8 * extent
    inked = (counts >= 2) & ~ruled
    best: tuple[int, int] | None = None
    start = None
    gap = 0
    last = -1
    for i in range(len(counts)):
        if inked[i]:
            if start is None:
                start = i
            last = i
            gap = 0
        elif start is not None:
            gap += 1
            if ruled[i] or gap > 3:
                if best is None or last - start > best[1] - best[0]:
                    best = (start, last)
                start = None
    if start is not None and (best is None or last - start > best[1] - best[0]):
        best = (start, last)
    return best


def fit_box(img: np.ndarray, box: Box, rot: int, size: float) -> Box:
    """Tighten (x0, y0, x1, y1) in page points to the ink. Unsupported rotations return the box unchanged."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    rot = rot % 360
    if rot not in (0, 90, 180, 270) or w <= 0 or h <= 0:
        return box
    # Look further on the side where the glyph tops are.
    up, down = 0.6, 0.08
    if rot == 0:
        sx0, sx1, sy0, sy1 = x0, x1, y0 - up * h, y1 + down * h
    elif rot == 180:
        sx0, sx1, sy0, sy1 = x0, x1, y0 - down * h, y1 + up * h
    elif rot == 90:  # reads upward, glyph tops point left
        sx0, sx1, sy0, sy1 = x0 - up * w, x1 + down * w, y0, y1
    else:  # 270: reads downward, glyph tops point right
        sx0, sx1, sy0, sy1 = x0 - down * w, x1 + up * w, y0, y1
    px0, px1 = max(0, int(sx0 * SCALE)), min(img.shape[1], int(sx1 * SCALE) + 1)
    py0, py1 = max(0, int(sy0 * SCALE)), min(img.shape[0], int(sy1 * SCALE) + 1)
    if px1 - px0 < 3 or py1 - py0 < 3:
        return box
    dark = img[py0:py1, px0:px1] < DARK

    if rot in (0, 180):
        run = _best_run(dark.sum(axis=1), px1 - px0)
        if run is None:
            return box
        cols = np.flatnonzero(dark[run[0] : run[1] + 1].any(axis=0))
        if cols.size == 0:
            return box
        fitted = ((px0 + cols[0]) / SCALE, (py0 + run[0]) / SCALE, (px0 + cols[-1] + 1) / SCALE, (py0 + run[1] + 1) / SCALE)
        if fitted[3] - fitted[1] < 0.3 * size:
            return box
    else:
        run = _best_run(dark.sum(axis=0), py1 - py0)
        if run is None:
            return box
        rows = np.flatnonzero(dark[:, run[0] : run[1] + 1].any(axis=1))
        if rows.size == 0:
            return box
        fitted = ((px0 + run[0]) / SCALE, (py0 + rows[0]) / SCALE, (px0 + run[1] + 1) / SCALE, (py0 + rows[-1] + 1) / SCALE)
        if fitted[2] - fitted[0] < 0.3 * size:
            return box
    return fitted
