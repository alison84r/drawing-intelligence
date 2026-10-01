"""
Step 1 and 4 of the Recognize pass: characters from the PDF text layer become tokens.

Coordinates are pdfplumber page points (top-left origin, unrotated), the space the app stores.
A token is one word or one symbol glyph, with font, size and rotation at any angle (vertical
and diagonal dimensions included). Symbol-font glyphs are always their own token so the parser
can read "3X | Ø | 3 | +0.1 | 0" cell by cell.
"""
from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass, field
from typing import Any

# Symbol glyphs as CAD symbol fonts (Symbol_ISO, Symbol_ASME, GDT, AIGDT, SolidWorks) emit them.
SYMBOL_MAP: dict[str, tuple[str, str]] = {
    # glyph -> (canonical, kind)
    "⌀": ("Ø", "dia"), "Ø": ("Ø", "dia"), "ø": ("Ø", "dia"), "∅": ("Ø", "dia"), "⌽": ("Ø", "dia"),
    "±": ("±", "pm"), "°": ("°", "deg"), "º": ("°", "deg"),
    "⌖": ("⌖", "gdt"), "⏥": ("⏥", "gdt"), "⏤": ("⏤", "gdt"), "○": ("○", "gdt"), "⌭": ("⌭", "gdt"),
    "⌒": ("⌒", "gdt"), "⌓": ("⌓", "gdt"), "⟂": ("⟂", "gdt"), "⊥": ("⟂", "gdt"), "∥": ("∥", "gdt"),
    "⫽": ("∥", "gdt"), "∠": ("∠", "gdt"), "◎": ("◎", "gdt"), "⌯": ("⌯", "gdt"), "↗": ("↗", "gdt"),
    "⌰": ("⌰", "gdt"), "⌲": ("⌲", "gdt"), "⏊": ("⟂", "gdt"), "⊕": ("⌖", "gdt"), "⌾": ("◎", "gdt"),
    "Ⓜ": ("M", "mod"), "Ⓛ": ("L", "mod"), "Ⓟ": ("P", "mod"), "Ⓕ": ("F", "mod"), "Ⓢ": ("S", "mod"),
    "⌴": ("⌴", "feat"), "⌵": ("⌵", "feat"), "⌳": ("⌳", "feat"), "⌱": ("⌱", "feat"),
    "▱": ("▱", "feat"), "□": ("□", "square"), "◻": ("□", "square"), "⌂": ("⌂", "feat"),
}

GDT_NAME = {
    "⌖": "Position", "⏥": "Flatness", "⏤": "Straightness", "○": "Circularity", "⌭": "Cylindricity",
    "⌒": "Profile of a line", "⌓": "Profile of a surface", "⟂": "Perpendicularity", "∥": "Parallelism",
    "∠": "Angularity", "◎": "Concentricity", "⌯": "Symmetry", "↗": "Circular runout", "⌰": "Total runout",
}


@dataclass
class Token:
    id: str
    page: int
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    size: float
    font: str
    rot: int  # reading direction in degrees, counter-clockwise, 0 = left to right
    kind: str  # 'text' | 'dia' | 'pm' | 'deg' | 'gdt' | 'mod' | 'feat' | 'square' | 'sym'
    cls: str = "open"  # 'char' | 'ruled' | 'open'
    reason: str = ""
    char_id: str | None = None
    guess: dict[str, Any] | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def w(self) -> float:
        return self.x1 - self.x0

    @property
    def h(self) -> float:
        return self.y1 - self.y0

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    # Reading-direction unit vector in top-left page space, and the "down" vector perpendicular to it.
    @property
    def u(self) -> tuple[float, float]:
        a = math.radians(self.rot)
        return math.cos(a), -math.sin(a)

    @property
    def v(self) -> tuple[float, float]:
        ux, uy = self.u
        return -uy, ux

    def along(self) -> tuple[float, float]:
        """Extent of the box projected on the reading axis."""
        ux, uy = self.u
        ps = [x * ux + y * uy for x in (self.x0, self.x1) for y in (self.y0, self.y1)]
        return min(ps), max(ps)

    def across(self) -> float:
        """Centre projected on the perpendicular axis; smaller means higher on the glyph."""
        vx, vy = self.v
        return self.cx * vx + self.cy * vy

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "page": self.page,
            "text": self.text,
            "bbox": {"x": round(self.x0, 2), "y": round(self.y0, 2), "w": round(self.w, 2), "h": round(self.h, 2)},
            "size": round(self.size, 1),
            "font": self.font,
            "rot": self.rot,
            "kind": self.kind,
            "cls": self.cls,
            "reason": self.reason,
            "charId": self.char_id,
            "guess": self.guess,
            "obox": self.extra.get("obox"),
        }


def _rotation(matrix: tuple[float, ...]) -> int:
    a, b = float(matrix[0]), float(matrix[1])
    return int(round(math.degrees(math.atan2(b, a)))) % 360


def _font_scale(matrix: tuple[float, ...], c: dict[str, Any]) -> float:
    """
    The printed height of the text, in points.

    Most CAD exports set the font to size 1 and put the real size in the text matrix, so the matrix scale is
    the size (and it stays right for rotated text, where the reported glyph height is not). Autodesk Inventor
    does the opposite: a unit matrix and the real size on the font. Then the size is the glyph's extent across
    its reading direction: its height when upright, its width when it runs up the sheet.
    """
    a, b = float(matrix[0]), float(matrix[1])
    s = math.hypot(a, b)
    if s > 1.5:
        return s
    height, width = float(c.get("height") or 0), float(c.get("width") or 0)
    if abs(b) <= 0.1 * abs(a) and height > 0:
        return height
    if abs(a) <= 0.1 * abs(b) and width > 0:
        return width
    return float(c.get("size") or 0) or s


def _font_base(name: str) -> str:
    return name.split("+", 1)[1] if "+" in name else name


def _is_symbol_font(font: str) -> bool:
    f = font.lower()
    return any(k in f for k in ("symbol", "gdt", "aigdt", "swgdt"))


# The GDT fonts (Autodesk AIGDT, Y14.5 GDT) draw symbols on plain letter codes: the file says "n", the sheet shows Ø.
GDT_FONT_MAP: dict[str, tuple[str, str]] = {
    "a": ("∠", "gdt"), "b": ("⟂", "gdt"), "c": ("⏥", "gdt"), "d": ("⌓", "gdt"), "e": ("○", "gdt"), "f": ("∥", "gdt"),
    "g": ("⌭", "gdt"), "h": ("↗", "gdt"), "i": ("⌯", "gdt"), "j": ("⌖", "gdt"), "k": ("⌒", "gdt"), "r": ("◎", "gdt"),
    "t": ("⌰", "gdt"), "u": ("⏤", "gdt"),
    "l": ("L", "mod"), "m": ("M", "mod"), "p": ("P", "mod"), "s": ("S", "mod"),
    "n": ("Ø", "dia"), "o": ("□", "square"), "v": ("⌴", "feat"), "w": ("⌵", "feat"), "x": ("↧", "feat"),
    "`": ("±", "pm"), "~": ("°", "deg"),
}


def _is_gdt_font(font: str) -> bool:
    return "gdt" in font.lower()


def _canon(ch: str, font: str) -> tuple[str, str]:
    if ch in SYMBOL_MAP:
        return SYMBOL_MAP[ch]
    if _is_gdt_font(font) and ch in GDT_FONT_MAP:
        return GDT_FONT_MAP[ch]
    if _is_symbol_font(font) and not ch.isalnum():
        return ch, "sym"
    return ch, "text"


def content_id(page: int, text: str, x: float, y: float) -> str:
    h = hashlib.sha1(f"{page}|{text}|{round(x)}|{round(y)}".encode()).hexdigest()[:12]
    return f"t{h}"


def build_tokens(chars: list[dict[str, Any]], page: int) -> list[Token]:
    """Rebuild words from characters by gap along the reading axis; every symbol glyph is its own token."""
    items: list[Token] = []
    for c in chars:
        text = c.get("text") or ""
        if not text.strip():
            continue
        font = _font_base(c.get("fontname", ""))
        matrix = c.get("matrix", (1, 0, 0, 1, 0, 0))
        size = _font_scale(matrix, c)
        rot = _rotation(matrix)
        text, kind = _canon(text, font)
        items.append(Token("", page, text, float(c["x0"]), float(c["top"]), float(c["x1"]), float(c["bottom"]), size, font, rot, kind))

    tokens: list[Token] = []
    # Bucket by reading direction (5 degree bins), then merge neighbours along the axis.
    buckets: dict[int, list[Token]] = {}
    for t in items:
        buckets.setdefault(int(round(t.rot / 5.0)) * 5 % 360, []).append(t)

    for rot, group in buckets.items():
        for t in group:
            t.rot = rot
        group.sort(key=lambda t: (round(t.across() / 2), t.along()[0]))
        cur: list[Token] = []

        def flush() -> None:
            if not cur:
                return
            x0 = min(i.x0 for i in cur)
            x1 = max(i.x1 for i in cur)
            y0 = min(i.y0 for i in cur)
            y1 = max(i.y1 for i in cur)
            text = "".join(i.text for i in cur)
            size = max(i.size for i in cur)
            kind = cur[0].kind if len(cur) == 1 else "text"
            tokens.append(Token(content_id(page, text, x0, y0), page, text, x0, y0, x1, y1, size, cur[0].font, rot, kind))
            cur.clear()

        if rot % 90 != 0:
            # Diagonal text: glyph boxes are inflated, so chain each glyph to the word it continues.
            words: list[list[Token]] = []
            for t in sorted(group, key=lambda t: sum(t.along())):
                target = None
                for w in words:
                    prev = w[-1]
                    ref = max(t.size, prev.size, 1.0)
                    step = (sum(t.along()) - sum(prev.along())) / 2
                    if abs(t.across() - prev.across()) <= 0.5 * ref and 0 < step <= 1.05 * ref and t.kind == "text" and prev.kind == "text" and abs(t.size - prev.size) <= 0.3 * ref:
                        target = w
                        break
                if target is None:
                    words.append([t])
                else:
                    target.append(t)
            for w in words:
                cur.extend(w)
                flush()
            continue

        for t in group:
            if not cur:
                cur.append(t)
                continue
            prev = cur[-1]
            ref = max(t.size, prev.size, 1.0)
            same_line = abs(t.across() - prev.across()) <= (0.5 if rot % 90 else 0.35) * ref
            if rot % 90 == 0:
                gap = t.along()[0] - prev.along()[1]
            else:
                # Axis-aligned boxes of diagonal glyphs overlap; use centre spacing minus a typical advance.
                gap = (sum(t.along()) - sum(prev.along())) / 2 - 0.6 * ref
            punct = t.text in ".,'" or prev.text in ".,"
            close = -0.5 * ref < gap <= (0.55 if punct else 0.2) * ref
            symbol_break = t.kind != "text" or prev.kind != "text"
            size_break = abs(t.size - prev.size) > 0.25 * ref
            if same_line and close and not symbol_break and not size_break:
                cur.append(t)
            else:
                flush()
                cur.append(t)
        flush()
    # Some exporters draw a glyph twice (fill and stroke passes); keep one copy.
    seen: list[Token] = []
    for t in sorted(tokens, key=lambda t: (t.rot, round(t.y0), round(t.x0))):
        dup = any(o.text == t.text and o.rot == t.rot and abs(o.x0 - t.x0) < 0.8 and abs(o.y0 - t.y0) < 0.8 for o in seen[-12:])
        if not dup:
            seen.append(t)
    return [piece for t in seen for piece in _unglue(t)]


# Some exporters write a callout with no spaces: "15.0TYP", "40.5(2X)", "2.0X30", "=150=". Each part is its own token.
_GLUED = re.compile(
    r"^(?P<lead>=)?(?P<body>(?:S?R|M)?\d+(?:[.,]\d+)?|THRU)"
    r"(?:(?P<by>[Xx])(?P<second>\d+(?:[.,]\d+)?))?(?P<word>TYP\.?)?(?P<count>\(\d+[Xx]\)|\([Xx]\d+\))?(?P<trail>=)?$"
)


def _unglue(t: Token) -> list[Token]:
    if t.kind != "text" or t.rot % 90 != 0 or len(t.text) < 3:
        return [t]
    m = _GLUED.match(t.text)
    if not m:
        return [t]
    parts = [(name, m.group(name)) for name in ("lead", "body", "by", "second", "word", "count", "trail") if m.group(name)]
    if len(parts) < 2:
        return [t]
    if m.group("by") and not (m.group("word") or "." in m.group("body") or "," in m.group("body")):
        return [t]  # "2X30" stays whole: a count glued to its value is read by the parser
    out: list[Token] = []
    total = len(t.text)
    lo, hi = t.along()
    ux, uy = t.u
    at = 0
    for name, text in parts:
        a, b = lo + (hi - lo) * at / total, lo + (hi - lo) * (at + len(text)) / total
        at += len(text)
        if abs(ux) > 0.5:  # along x
            xa, xb = (a, b) if ux > 0 else (-b, -a)
            box = (xa, t.y0, xb, t.y1)
        else:  # along y: the reading axis runs up or down the sheet
            ya, yb = (a, b) if uy > 0 else (-b, -a)
            box = (t.x0, ya, t.x1, yb)
        kind = "sym" if name in ("lead", "trail") else "text"
        out.append(Token(content_id(t.page, text, box[0], box[1]), t.page, text, box[0], box[1], box[2], box[3], t.size, t.font, t.rot, kind))
    return out
