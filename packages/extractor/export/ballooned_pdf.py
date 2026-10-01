"""
Ballooned drawing: the stored PDF with balloons, leaders and a stamp drawn as vector shapes.
Positions are in page points (top-left origin, unrotated), the same space the app stores.

Demo build uses PyMuPDF (AGPL); the shipped build swaps this module for a permissive library.
"""
from __future__ import annotations

import math
from datetime import date
from typing import Any

import fitz  # PyMuPDF
import numpy as np

from .brand import COMPANY, COPYRIGHT, PRODUCT, logo_bytes
from .characteristics import balloon_label, derive_limits, display_status, sort_key
from .stamp import Summary, find_free_box, legend_rows, stamp_lines, summarise

DEFAULT_STYLE = {"shape": "circle", "fill": "outline", "color": "#1d4ed8", "size": 22.0, "prefix": "", "weight": 600}
STATUS_COLOR = {"Pass": "#15803d", "Fail": "#b91c1c"}


def _rgb(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def _shape_points(shape: str, cx: float, cy: float, r: float) -> list[tuple[float, float]] | None:
    if shape == "hex":
        return [(cx + r * 1.1 * math.cos(math.pi / 3 * i - math.pi / 6), cy + r * 1.1 * math.sin(math.pi / 3 * i - math.pi / 6)) for i in range(6)]
    if shape == "triangle":
        return [(cx, cy - r * 1.3), (cx + r * 1.25, cy + r * 0.9), (cx - r * 1.25, cy + r * 0.9)]
    return None


def _clip_to_box(bx: float, by: float, ax: float, ay: float, box: dict[str, float] | None, pad: float = 2.0) -> tuple[float, float]:
    """Where the leader from the balloon (bx, by) meets the callout box around the anchor."""
    if not box:
        return ax, ay
    x0, y0, x1, y1 = box["x"] - pad, box["y"] - pad, box["x"] + box["w"] + pad, box["y"] + box["h"] + pad
    if x0 <= bx <= x1 and y0 <= by <= y1:
        return ax, ay
    dx, dy = ax - bx, ay - by
    best = 1.0
    for edge, d, o, lo, hi, od in ((x0, dx, bx, y0, y1, dy), (x1, dx, bx, y0, y1, dy)):
        if d:
            t = (edge - o) / d
            y = by + t * od
            if 0 <= t <= best and lo <= y <= hi:
                best = t
    for edge, d, o, lo, hi, od in ((y0, dy, by, x0, x1, dx), (y1, dy, by, x0, x1, dx)):
        if d:
            t = (edge - o) / d
            x = bx + t * od
            if 0 <= t <= best and lo <= x <= hi:
                best = t
    return bx + best * dx, by + best * dy


CELL = 4.0  # points per cell of the ink mask used to find empty space
AIR = 3  # clear cells kept around the stamp and the legend
STAMP_TILT = -7.0


def _ink_mask(page: "fitz.Page") -> np.ndarray:
    """True where the sheet already has something drawn, at one cell per CELL points."""
    pix = page.get_pixmap(matrix=fitz.Matrix(1 / CELL, 1 / CELL), colorspace=fitz.csGRAY, alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width) < 235


def _place(ink: np.ndarray, w: float, h: float, prefer: tuple[float, float]) -> "fitz.Rect | None":
    """A clear w x h rectangle (points) on the sheet, or None. Tries smaller sizes before giving up."""
    for k in (1.0, 0.8, 0.64):
        # The window searched is the box plus clear air around it, so nothing touches the drawing.
        bw, bh = math.ceil(w * k / CELL) + 2 * AIR, math.ceil(h * k / CELL) + 2 * AIR
        margin = max(2, int(min(ink.shape) * 0.03))
        at = find_free_box(ink, bw, bh, margin, (int(prefer[0] / CELL), int(prefer[1] / CELL)))
        if at:
            ink[at[1] : at[1] + bh, at[0] : at[0] + bw] = True  # taken: the next item goes elsewhere
            x, y = (at[0] + AIR) * CELL, (at[1] + AIR) * CELL
            return fitz.Rect(x, y, x + w * k, y + h * k)
    return None


def _centered(shape: "fitz.Shape", cx: float, y: float, text: str, size: float, font: str, color, morph) -> None:
    width = fitz.get_text_length(text, fontname=font, fontsize=size)
    shape.insert_text(fitz.Point(cx - width / 2, y), text, fontsize=size, fontname=font, color=color, morph=morph)


def _draw_stamp(page: "fitz.Page", rect: "fitz.Rect", summary: Summary, fair_number: str) -> None:
    title, ident, tail = stamp_lines(summary, fair_number, date.today().strftime("%d %b %Y").upper())
    color = _rgb(summary.color)
    inner = fitz.Rect(rect.x0 + rect.width * 0.06, rect.y0 + rect.height * 0.14, rect.x1 - rect.width * 0.06, rect.y1 - rect.height * 0.14)
    centre = fitz.Point((inner.x0 + inner.x1) / 2, (inner.y0 + inner.y1) / 2)
    morph = (centre, fitz.Matrix(STAMP_TILT))
    shape = page.new_shape()
    shape.draw_rect(inner)
    shape.finish(color=color, width=max(1.4, inner.height * 0.045), morph=morph)
    big = inner.height * 0.30
    while fitz.get_text_length(title, fontname="hebo", fontsize=big) > inner.width * 0.9:
        big *= 0.94
    small = min(inner.height * 0.15, big * 0.6)
    while max(fitz.get_text_length(t, fontname="helv", fontsize=small) for t in (ident or " ", tail)) > inner.width * 0.92:
        small *= 0.94
    _centered(shape, centre.x, inner.y0 + inner.height * 0.44, title, big, "hebo", color, morph)
    if ident:
        _centered(shape, centre.x, inner.y0 + inner.height * 0.67, ident, small, "helv", color, morph)
    _centered(shape, centre.x, inner.y0 + inner.height * 0.88, tail, small, "helv", color, morph)
    shape.commit()


def _draw_legend(page: "fitz.Page", rect: "fitz.Rect", summary: Summary) -> None:
    rows = legend_rows(summary)
    line = rect.height / (len(rows) + 2.4)
    size = line * 0.62
    # Text is sized to the box, never the other way round: the longest row must fit.
    room = rect.width - line * 2.2
    longest = max((f"{label} · {count}" for _, label, count in rows), key=len, default="LEGEND")
    while size > 3 and fitz.get_text_length(longest, fontname="helv", fontsize=size) > room:
        size *= 0.94
    note = "Marks added by Drawing Intelligence. Original drawing unchanged."
    note_size = size * 0.62
    while note_size > 2.5 and fitz.get_text_length(note, fontname="helv", fontsize=note_size) > rect.width - line * 1.2:
        note_size *= 0.94
    shape = page.new_shape()
    shape.draw_rect(rect)
    shape.finish(color=(0.25, 0.3, 0.35), fill=(1, 1, 1), width=0.5)
    x, y = rect.x0 + line * 0.6, rect.y0 + line * 1.05
    shape.insert_text(fitz.Point(x, y), "LEGEND", fontsize=size, fontname="hebo", color=(0.15, 0.2, 0.25))
    for mark, label, count in rows:
        y += line
        cx, cy, r = x + line * 0.35, y - size * 0.34, line * 0.33
        shape.draw_circle(fitz.Point(cx, cy), r)
        if mark == "pass":
            shape.finish(color=_rgb("#15803d"), fill=_rgb("#15803d"), width=0.6)
        elif mark == "fail":
            shape.finish(color=_rgb("#b91c1c"), fill=_rgb("#b91c1c"), width=0.6)
        elif mark == "accepted":
            shape.finish(color=_rgb(DEFAULT_STYLE["color"]), fill=(1, 1, 1), width=0.9)
        else:
            shape.finish(color=_rgb(DEFAULT_STYLE["color"]), fill=(1, 1, 1), width=0.9, dashes="[2 1.5] 0")
        shape.insert_text(fitz.Point(x + line * 1.0, y), f"{label} · {count}", fontsize=size, fontname="helv", color=(0.15, 0.2, 0.25))
    shape.insert_text(fitz.Point(x, rect.y1 - line * 0.35), note, fontsize=note_size, fontname="helv", color=(0.4, 0.45, 0.5))
    shape.commit()


def _stamp_and_legend(doc: "fitz.Document", summary: Summary, fair_number: str) -> None:
    """Stamp on every sheet, legend on the first, each only where the sheet is clear."""
    for number, page in enumerate(doc):
        if page.rotation:
            continue  # a rotated sheet keeps the caption band only: placing upright marks needs its own transform
        w, h = page.rect.width, page.rect.height
        ink = _ink_mask(page)
        sw = min(max(w * 0.17, 130.0), 300.0)
        spot = _place(ink, sw, sw * 0.42, (w, 0.0))
        if spot:
            _draw_stamp(page, spot, summary, fair_number)
        if number == 0:
            rows = len(legend_rows(summary))
            lw = min(max(w * 0.16, 125.0), 280.0)
            prefer = (spot.x0 + spot.width / 2, spot.y1 + 40.0) if spot else (w, 0.0)
            box = _place(ink, lw, lw * 0.105 * (rows + 2.4), prefer)
            if box and rows:
                _draw_legend(page, box, summary)


def build_ballooned_pdf(pdf_bytes: bytes, chars: list[dict[str, Any]], settings: dict[str, Any], stamp: str, status_stamp: dict[str, Any] | None = None) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    global_style = {**DEFAULT_STYLE, **(settings.get("balloonStyle") or {})}
    defaults = settings.get("defaults") or {}

    heads = {(int(c.get("page") or 0), c.get("balloonNumber")): c for c in chars if not c.get("subNumber")}
    links: dict[tuple[int, Any], int] = {}
    for c in sorted(chars, key=sort_key):
        page_no = int(c.get("page") or 0)
        if page_no >= len(doc):
            continue
        page = doc[page_no]
        style = {**global_style, **(c.get("style") or {})}
        status = display_status(c, derive_limits(c, defaults))
        color = _rgb(STATUS_COLOR.get(status, style["color"]))
        r = float(style["size"]) / 2 * (0.9 if c.get("subNumber") else 1.0)
        bx, by = float(c["balloonPos"]["x"]), float(c["balloonPos"]["y"])
        # As on screen: a sub-row without a leader touches its balloon as a chain (24 · .1 · .2).
        head = heads.get((page_no, c.get("balloonNumber"))) if c.get("subNumber") and not c.get("leader", True) else None
        if head is not None:
            n = links[(page_no, c.get("balloonNumber"))] = links.get((page_no, c.get("balloonNumber")), 0) + 1
            head_r = float({**global_style, **(head.get("style") or {})}["size"]) / 2
            bx, by = float(head["balloonPos"]["x"]) + head_r + r * (2 * n - 1), float(head["balloonPos"]["y"])
        ax, ay = float(c["anchor"]["x"]), float(c["anchor"]["y"])
        ax, ay = _clip_to_box(bx, by, ax, ay, c.get("bbox"))
        shape = page.new_shape()

        if c.get("leader", True):
            shape.draw_line(fitz.Point(bx, by), fitz.Point(ax, ay))
            shape.finish(color=color, width=1.0)
            shape.draw_circle(fitz.Point(ax, ay), 2.0)
            shape.finish(color=color, fill=color, width=0.5)

        # Same marks as on screen: Draft dashed, Accepted ticked, Pass filled green, Fail filled red with a cross.
        filled = style["fill"] == "filled" or status in ("Pass", "Fail")
        fill = color if filled else (1, 1, 1)
        pts = _shape_points(style["shape"], bx, by, r)
        if style["shape"] == "square":
            shape.draw_rect(fitz.Rect(bx - r, by - r, bx + r, by + r))
        elif pts:
            shape.draw_polyline([fitz.Point(*p) for p in pts] + [fitz.Point(*pts[0])])
        else:
            shape.draw_circle(fitz.Point(bx, by), r)
        shape.finish(color=color, fill=fill, width=1.6, closePath=True, dashes="[3 2] 0" if status == "Draft" else None)
        if status in ("Accepted", "Fail"):
            k = max(3.2, r * 0.44)
            cx_, cy_ = bx + r * 0.78, by - r * 0.78
            if status == "Accepted":
                shape.draw_circle(fitz.Point(cx_, cy_), k)
                shape.finish(color=(1, 1, 1), fill=_rgb("#16a34a"), width=0.8)
                shape.draw_polyline([fitz.Point(cx_ - k * 0.48, cy_), fitz.Point(cx_ - k * 0.14, cy_ + k * 0.36), fitz.Point(cx_ + k * 0.48, cy_ - k * 0.34)])
                shape.finish(color=(1, 1, 1), width=max(0.8, k * 0.24), closePath=False, lineCap=1, lineJoin=1)
            else:
                shape.draw_circle(fitz.Point(cx_, cy_), k)
                shape.finish(color=_rgb("#dc2626"), fill=(1, 1, 1), width=0.8)
                shape.draw_line(fitz.Point(cx_ - k * 0.42, cy_ - k * 0.42), fitz.Point(cx_ + k * 0.42, cy_ + k * 0.42))
                shape.draw_line(fitz.Point(cx_ + k * 0.42, cy_ - k * 0.42), fitz.Point(cx_ - k * 0.42, cy_ + k * 0.42))
                shape.finish(color=_rgb("#dc2626"), width=max(0.8, k * 0.24), lineCap=1)
        shape.commit()

        label = f".{c.get('subNumber')}" if head is not None else f"{style.get('prefix', '')}{balloon_label(c)}"
        fontsize = max(6.0, r * (0.75 if len(label) > 2 else 1.0))
        rect = fitz.Rect(bx - r * 1.6, by - r, bx + r * 1.6, by + r)
        page.insert_textbox(
            rect,
            label,
            fontsize=fontsize,
            fontname="helv" if style.get("weight", 600) < 600 else "hebo",
            color=(1, 1, 1) if filled else color,
            align=fitz.TEXT_ALIGN_CENTER,
        )

    logo = logo_bytes()
    for page in doc:
        w, h = page.rect.width, page.rect.height
        # Top-right: navy logo chip plus the inspection stamp. Bottom-left: copyright.
        band = page.new_shape()
        band.draw_rect(fitz.Rect(w - 424, 2, w - 4, 22))
        band.finish(color=(0.75, 0.75, 0.75), fill=(1, 1, 1), width=0.4, fill_opacity=0.92)
        band.commit()
        page.insert_image(fitz.Rect(w - 78, 3, w - 6, 21), stream=logo, keep_proportion=True)
        page.insert_textbox(fitz.Rect(w - 420, 4, w - 82, 20), f"{stamp} · {date.today().isoformat()}", fontsize=7, fontname="helv", color=(0.3, 0.3, 0.3), align=fitz.TEXT_ALIGN_RIGHT)
        page.insert_textbox(fitz.Rect(6, h - 14, 400, h - 2), f"{COPYRIGHT} · {PRODUCT}", fontsize=6, fontname="helv", color=(0.45, 0.45, 0.45))

    if status_stamp is not None:
        _stamp_and_legend(doc, summarise(chars, defaults), str(status_stamp.get("fairNumber") or ""))

    out = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return out
