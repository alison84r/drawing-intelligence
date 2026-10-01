"""
Intake check: can this PDF be recognised, and what should the inspector watch for?

Runs when a drawing is opened, before Recognize. A customer file we have never seen gets an honest
verdict first: ready, review, or not readable (scan, text converted to outlines, picture of a drawing).
"""
from __future__ import annotations

import io
from collections import Counter
from typing import Any

import pdfplumber

from .scene import build_scene
from .tokens import SYMBOL_MAP, build_tokens
from .zones import detect_zones

RECOGNIZER_VERSION = "2026.10.2"


def _row(key: str, label: str, level: str, value: str) -> dict[str, str]:
    return {"key": key, "label": label, "level": level, "value": value}


def intake(pdf_bytes: bytes) -> dict[str, Any]:
    pages_out = []
    worst = "ok"
    order = {"ok": 0, "warn": 1, "bad": 2}
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for index, page in enumerate(pdf.pages):
            width, height = float(page.width), float(page.height)
            chars = page.chars
            rows: list[dict[str, str]] = []

            image_area = sum(float(im["width"]) * float(im["height"]) for im in page.images)
            image_frac = min(1.0, image_area / (width * height)) if width and height else 0.0
            vectors = len(page.lines) + len(page.curves) + len(page.rects)

            tokens = build_tokens(chars, index) if chars else []
            numeric = [t for t in tokens if any(ch.isdigit() for ch in t.text)]
            if len(chars) < 20:
                if image_frac > 0.5:
                    rows.append(_row("text", "Text layer", "bad", "none: this page is a scanned image"))
                elif vectors > 500:
                    rows.append(_row("text", "Text layer", "bad", "none: text was exported as outlines"))
                else:
                    rows.append(_row("text", "Text layer", "bad", "none"))
            else:
                rows.append(_row("text", "Text layer", "ok", f"vector text, {len(tokens)} words, {len(numeric)} with numbers"))

            if image_frac > 0.3 and len(chars) >= 20:
                rows.append(_row("image", "Picture content", "warn", f"{round(image_frac * 100)}% of the sheet is an image; dimensions inside it cannot be read"))

            fonts = Counter((c.get("fontname") or "").split("+")[-1] for c in chars)
            if fonts:
                top = ", ".join(name for name, _ in fonts.most_common(3))
                rows.append(_row("fonts", "Fonts", "ok", top))

            kinds = Counter(t.kind for t in tokens)
            gdt = kinds.get("gdt", 0)
            dia = kinds.get("dia", 0)
            if len(chars) >= 20:
                if dia or gdt:
                    rows.append(_row("symbols", "Symbols", "ok", f"read as text: {dia} diameter, {gdt} GD&T"))
                else:
                    rows.append(_row("symbols", "Symbols", "warn", "no symbol glyphs in the text; diameter and GD&T signs are read from shapes where possible"))

            if len(chars) >= 20 and len(numeric) >= 8:
                try:
                    scene = build_scene(page)
                    heads, dims = len(scene.arrows), len(scene.dimensions)
                except Exception:  # noqa: BLE001
                    heads, dims = 0, 0
                if heads >= 4:
                    rows.append(_row("geometry", "Dimension geometry", "ok", f"{heads} arrowheads, {dims} dimension lines"))
                else:
                    rows.append(_row("geometry", "Dimension geometry", "warn", "arrowheads not found; values will not be checked against dimension lines"))

            unknown = [t.text for t in tokens if t.kind == "sym"]
            private = [c["text"] for c in chars if c.get("text") and (0xE000 <= ord(c["text"][0]) <= 0xF8FF or c["text"].startswith("(cid:"))]
            if unknown or private:
                sample = " ".join(sorted(set(unknown))[:6])
                rows.append(_row("glyphs", "Unknown glyphs", "warn", f"{len(unknown) + len(private)} to review {sample}".strip()))

            rotated = Counter(t.rot for t in tokens if t.rot % 90 != 0)
            if rotated:
                rows.append(_row("rotation", "Diagonal text", "ok", f"{sum(rotated.values())} words, handled"))
            if getattr(page, "rotation", 0):
                rows.append(_row("pagerot", "Page rotation", "warn", f"{page.rotation}° stored in the file"))

            if len(chars) >= 20:
                grid = detect_zones(build_tokens(chars, index), width, height)
                rows.append(_row("zones", "Zones", "ok" if grid else "warn", "read from the border" if grid else "no border labels, nominal grid used"))

            level = max((r["level"] for r in rows), key=lambda v: order[v], default="ok")
            worst = max(worst, level, key=lambda v: order[v])
            pages_out.append({"page": index, "width": width, "height": height, "level": level, "rows": rows})

    verdict = {"ok": "Ready to recognize", "warn": "Readable, review the notes", "bad": "Not readable as vector text"}[worst]
    return {"level": worst, "verdict": verdict, "recognizerVersion": RECOGNIZER_VERSION, "pages": pages_out}
