"""
Render a feature control frame to a PNG so it can sit inside an Excel cell exactly as drawn.
"""
from __future__ import annotations

import io
from functools import lru_cache
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from .characteristics import GDT_MODIFIERS

# Symbol-capable fonts, first found wins. Segoe UI Symbol on Windows, DejaVu in the Linux container.
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\seguisym.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    r"C:\Windows\Fonts\arial.ttf",
]
TEXT_CANDIDATES = [r"C:\Windows\Fonts\segoeui.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", r"C:\Windows\Fonts\arial.ttf"]


@lru_cache(maxsize=8)
def _font(size: int, symbol: bool) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES if symbol else TEXT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def fcf_cells(gdt: dict[str, Any]) -> list[str]:
    mod = GDT_MODIFIERS.get(gdt.get("modifier") or "", "")
    cells = [gdt.get("symbol") or "", f"{gdt.get('zone', '')}{gdt.get('tolerance') or ''}{mod}"]
    cells += [str(d).strip().upper() for d in (gdt.get("datums") or []) if str(d).strip()]
    return cells


def render_fcf_png(gdt: dict[str, Any], height_px: int = 44, scale: int = 2) -> bytes:
    """PNG bytes of the frame. `height_px` is the intended display height; drawn at `scale` for crispness."""
    h = height_px * scale
    pad = int(h * 0.22)
    sym_font = _font(int(h * 0.55), symbol=True)
    txt_font = _font(int(h * 0.5), symbol=False)
    cells = fcf_cells(gdt)
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))

    widths = []
    for i, text in enumerate(cells):
        font = sym_font if i == 0 or any(ord(ch) > 0x2000 for ch in text) else txt_font
        box = probe.textbbox((0, 0), text, font=font)
        widths.append(box[2] - box[0] + 2 * pad)

    line = max(2, scale)
    w = sum(widths) + line
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline="black", width=line)
    x = 0
    for i, (text, cw) in enumerate(zip(cells, widths)):
        font = sym_font if i == 0 or any(ord(ch) > 0x2000 for ch in text) else txt_font
        box = d.textbbox((0, 0), text, font=font)
        tx = x + (cw - (box[2] - box[0])) / 2 - box[0]
        ty = (h - (box[3] - box[1])) / 2 - box[1]
        d.text((tx, ty), text, fill="black", font=font)
        x += cw
        if i < len(cells) - 1:
            d.line([(x, 0), (x, h)], fill="black", width=line)

    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()
