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

from .characteristics import balloon_label, derive_limits, display_status, sort_key

DEFAULT_STYLE = {"shape": "circle", "fill": "outline", "color": "#e11d48", "size": 22.0, "prefix": "", "weight": 600}
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


def build_ballooned_pdf(pdf_bytes: bytes, chars: list[dict[str, Any]], settings: dict[str, Any], stamp: str) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    global_style = {**DEFAULT_STYLE, **(settings.get("balloonStyle") or {})}
    defaults = settings.get("defaults") or {}

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
        ax, ay = float(c["anchor"]["x"]), float(c["anchor"]["y"])
        shape = page.new_shape()

        if c.get("leader", True):
            shape.draw_line(fitz.Point(bx, by), fitz.Point(ax, ay))
            shape.finish(color=color, width=1.0)
            shape.draw_circle(fitz.Point(ax, ay), 2.0)
            shape.finish(color=color, fill=color, width=0.5)

        filled = style["fill"] == "filled"
        fill = color if filled else (1, 1, 1)
        pts = _shape_points(style["shape"], bx, by, r)
        if style["shape"] == "square":
            shape.draw_rect(fitz.Rect(bx - r, by - r, bx + r, by + r))
        elif pts:
            shape.draw_polyline([fitz.Point(*p) for p in pts] + [fitz.Point(*pts[0])])
        else:
            shape.draw_circle(fitz.Point(bx, by), r)
        shape.finish(color=color, fill=fill, width=1.6, closePath=True)
        shape.commit()

        label = f"{style.get('prefix', '')}{balloon_label(c)}"
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

    for page in doc:
        w = page.rect.width
        page.insert_textbox(fitz.Rect(w - 300, 4, w - 6, 18), f"{stamp} · {date.today().isoformat()}", fontsize=7, fontname="helv", color=(0.3, 0.3, 0.3), align=fitz.TEXT_ALIGN_RIGHT)

    out = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return out
