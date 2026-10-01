"""
Steps 3, 6 and 7: rule out what is not a characteristic, group tokens into callouts, parse each
callout into a characteristic record and score it.

Confidence: 1.0 tolerance printed or frame complete · 0.8 default tolerance applies · 0.5 regex only.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from .geometry import Arrowhead, nearest_arrowhead
from .tokens import GDT_NAME, Token

NUMBER = re.compile(r"^[+\-]?\d+(?:[.,]\d+)?$")
COUNT = re.compile(r"^(\d+)[Xx]$")
RADIUS = re.compile(r"^S?R(\d+(?:[.,]\d+)?)?$")
THREAD = re.compile(r"^M(\d+(?:[.,]\d+)?)(?:[xX](\d+(?:[.,]\d+)?))?$")
PAREN = re.compile(r"^\((.+)\)$")
LETTER = re.compile(r"^[A-Z]$")
SECTION_LABEL = re.compile(r"^[A-Z]-[A-Z]$")
FRACTION_INCH = re.compile(r"^\d+/\d+$")

VIEW_WORDS = {"SECTION", "DETAIL", "VIEW", "SCALE", "ISOMETRIC", "ISO", "FRONT", "TOP", "SIDE", "REAR", "BOTTOM", "LEFT", "RIGHT"}
MODIFIER_WORDS = {
    "TYP", "THRU", "MIN", "MAX", "REF", "PL", "PLACES", "PLCS", "EQ", "SP", "CSK", "CBORE", "SF", "DEEP", "DP", "THK",
    "NPT", "UNC", "UNF", "DIA", "RAD", "BSC", "BASIC", "X", "THREAD", "TAP", "DRILL", "REAM", "CHAMFER", "CHAM", "R", "SR", "S",
    "MM", "IN", "TOL", "SPHERE", "SQ", "HEX", "STOCK", "BOTH", "SIDES", "EACH", "SIDE", "END", "ENDS", "ALL", "AROUND", "OVER",
    "HOLE", "HOLES", "SLOT", "SLOTS", "EQUALLY", "SPACED", "CSINK", "CENTER", "CENTRE", "LINE", "ON", "PCD", "BCD", "BC", "TAPPED",
    "FULL", "THRD", "THD", "DEPTH", "CHAM", "WIDE", "LONG", "DIA", "DEG", "THICK", "THICKNESS", "THRU", "THROUGH", "NOS", "OFF", "POSN",
    "EQUI", "EQUISPACED", "APART", "ACROSS", "FLATS", "CRS", "PITCH", "DRILLED", "TAPPED", "REF", "NOM", "APPROX", "TYPICAL", "SYM", "SYMM",
}
GDT_TYPE = {
    "Position": "Position", "Flatness": "Flatness", "Perpendicularity": "Perpendicularity", "Parallelism": "Parallelism",
    "Profile of a line": "Profile", "Profile of a surface": "Profile", "Circular runout": "Runout", "Total runout": "Runout",
    "Concentricity": "Concentricity",
}


def _num(text: str) -> float | None:
    m = NUMBER.match(text.replace(",", "."))
    return float(text.replace(",", ".")) if m else None


def _places(text: str) -> int:
    m = re.search(r"[.,](\d+)$", text)
    return len(m.group(1)) if m else 0


@dataclass
class Line:
    rot: int
    tokens: list[Token]
    size: float

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        xs0 = min(t.x0 for t in self.all_tokens)
        ys0 = min(t.y0 for t in self.all_tokens)
        xs1 = max(t.x1 for t in self.all_tokens)
        ys1 = max(t.y1 for t in self.all_tokens)
        return xs0, ys0, xs1, ys1

    @property
    def all_tokens(self) -> list[Token]:
        out = []
        for t in self.tokens:
            out.append(t)
            out.extend(t.extra.get("stack", []))
        return out

    @property
    def text(self) -> str:
        parts = []
        for t in self.tokens:
            parts.append(t.text)
            stack = t.extra.get("stack")
            if stack:
                parts.append("/".join(s.text for s in stack))
        return " ".join(parts)


def _along(t: Token) -> tuple[float, float]:
    return t.along()


def _across(t: Token) -> float:
    return t.across()


def dimension_font_size(tokens: list[Token]) -> float:
    sizes = Counter(round(t.size * 2) / 2 for t in tokens if t.size >= 6 and (NUMBER.match(t.text) or t.kind != "text"))
    if not sizes:
        sizes = Counter(round(t.size * 2) / 2 for t in tokens if t.size >= 6)
    return sizes.most_common(1)[0][0] if sizes else 10.0


def attach_stacks(tokens: list[Token], dim_size: float) -> None:
    """Small tokens right after a main token, one above and one below its centre line, are a deviation stack."""
    mains = [t for t in tokens if t.cls != "ruled" and t.size >= 0.8 * dim_size and NUMBER.match(t.text) and not t.text.startswith(("+", "-"))]
    smalls = [t for t in tokens if t.cls != "ruled" and 0.35 * dim_size <= t.size <= 1.05 * dim_size and t.text and (NUMBER.match(t.text) or t.kind == "pm")]
    used: set[str] = set()
    for m in mains:
        a0, a1 = _along(m)
        candidates = []
        for s in smalls:
            if s.id in used or s.rot != m.rot or s is m:
                continue
            s0, _ = _along(s)
            if not (a1 - 2.5 <= s0 <= a1 + 1.0 * m.size):
                continue
            if abs(_across(s) - _across(m)) > 1.1 * m.size:
                continue
            candidates.append(s)
        if not candidates:
            continue
        candidates.sort(key=_across)
        if len(candidates) > 2:
            candidates = candidates[:2]
        small = [s for s in candidates if s.size <= 0.75 * m.size]
        if not small:
            # Full-size deviations: need one above the centre line and one at or below it, with a sign somewhere.
            signed = any(s.text[0] in "+-" for s in candidates)
            above = [s for s in candidates if _across(s) < _across(m) - 0.35 * m.size]
            below = [s for s in candidates if _across(s) >= _across(m) - 0.35 * m.size]
            if not (signed and above and below):
                continue
        for s in candidates:
            used.add(s.id)
            s.extra["stack_of"] = m.id
        m.extra["stack"] = candidates


def build_lines(tokens: list[Token], dim_size: float) -> list[Line]:
    lines: list[Line] = []
    pool = [t for t in tokens if t.cls != "ruled" and "stack_of" not in t.extra]
    for rot in sorted({t.rot for t in pool}):
        group = sorted((t for t in pool if t.rot == rot), key=lambda t: _along(t)[0])
        open_lines: list[Line] = []
        for t in group:
            best: Line | None = None
            best_gap = 1e9
            for ln in open_lines:
                last = ln.tokens[-1]
                ref = max(ln.size, t.size)
                gap = _along(t)[0] - max(_along(x)[1] for x in ln.tokens)
                size_ok = min(ln.size, t.size) >= 0.7 * ref
                starts_new = bool(COUNT.match(t.text)) and any(NUMBER.match(x.text) for x in ln.tokens)
                # Symbol glyphs sit on a lower baseline than digits; compare centres, generously.
                symbolic = t.kind != "text" or last.kind != "text"
                across_ok = abs(_across(t) - _across(last)) <= (0.8 if symbolic else 0.6) * ref
                gap_ok = -0.35 * ref <= gap <= (1.6 if symbolic else 1.2) * ref
                plain = lambda x: x.kind == "text" and NUMBER.match(x.text) and x.text[0] not in "+-" and not x.extra.get("stack")  # noqa: E731
                if plain(t) and plain(last) and gap > 0.45 * ref:
                    starts_new = True
                if t.text.upper() in ("TYP", "TYP.") and gap > 0.9 * ref:
                    starts_new = True
                if t.extra.get("datum_box") or last.extra.get("datum_box"):
                    starts_new = True
                if size_ok and not starts_new and across_ok and gap_ok and gap < best_gap:
                    best, best_gap = ln, gap
            if best is None:
                best = Line(rot, [], t.size)
                open_lines.append(best)
            best.tokens.append(t)
            best.size = max(best.size, t.size)
            # Lines that fell far behind on the reading axis are finished.
            far = [ln for ln in open_lines if _along(t)[0] - max(_along(x)[1] for x in ln.tokens) > 3 * ln.size]
            for ln in far:
                open_lines.remove(ln)
                lines.append(ln)
        lines.extend(open_lines)
    return lines


def rule_out(line: Line, dim_size: float, width: float, height: float, relaxed: bool, tables: list[tuple[float, float, float, float]] = ()) -> str | None:
    x0, y0, x1, y1 = line.bbox
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if not relaxed and any(tx0 <= cx <= tx1 and ty0 <= cy <= ty1 for tx0, ty0, tx1, ty1 in tables):
        return "table cell"
    
    words = [t.text for t in line.tokens]
    upper = [w.upper() for w in words]
    if any(w in VIEW_WORDS for w in upper):
        return "view label"
    if re.match(r"^\d{1,2}\.(\D|$)", words[0]) and len(words) >= 3 and sum(1 for w in upper if re.search(r"[A-Z]{3,}", w)) >= 2:
        return "note"
    if line.tokens[0].kind == "pm":
        return "general tolerance note"
    if all(t.extra.get("datum_box") for t in line.tokens):
        return "datum feature symbol"
    if len(words) == 1 and (LETTER.match(words[0]) or SECTION_LABEL.match(words[0])) and line.tokens[0].kind == "text":
        return "datum or view letter"
    if relaxed:
        return None
    if line.size < 0.6 * dim_size:
        return "small text: notes or title block"
    alpha = [run for w in upper for run in re.findall(r"[A-Z]{3,}", w) if run not in MODIFIER_WORDS]
    has_value = any(NUMBER.match(t.text) or RADIUS.match(t.text) or t.kind == "dia" for t in line.tokens if t.size >= 0.8 * dim_size)
    # A sentence is a note. One or two unknown words next to a value must not hide the value: it goes to review.
    if alpha and (len(alpha) > 2 or not has_value or re.match(r"^\d+\.$", words[0])):
        return "text"
    if all(t.kind == "text" and not NUMBER.match(t.text) and not COUNT.match(t.text) and not RADIUS.match(t.text) and not THREAD.match(t.text) and not PAREN.match(t.text) for t in line.tokens):
        return "no value"
    return None


@dataclass
class Group:
    line: Line
    kind: str  # 'dimension' | 'fcf'
    record: dict[str, Any]
    confidence: float
    reason: str
    tokens: list[Token] = field(default_factory=list)


def _tolerance_from_stack(stack: list[Token]) -> tuple[float | None, float | None, str] | None:
    vals = [_num(s.text) for s in stack]
    if len(vals) == 2 and all(v is not None for v in vals):
        hi, lo = vals[0], vals[1]
        assert hi is not None and lo is not None
        if lo > hi:
            hi, lo = lo, hi
        tol_type = "Unilateral" if (hi == 0 or lo == 0) else "Bilateral"
        return hi, lo, tol_type
    if len(vals) == 1 and vals[0] is not None:
        v = vals[0]
        return (v, -v, "Bilateral") if v > 0 else (0.0, v, "Unilateral")
    return None


def parse_fcf(line: Line) -> Group | None:
    toks = line.tokens
    first = toks[0]
    symbol = first.text
    name = GDT_NAME.get(symbol, "")
    zone, tolerance, modifier, datums = "", "", "", []
    i = 1
    if i < len(toks) and toks[i].kind == "dia":
        zone = "Ø"
        i += 1
    elif i < len(toks) and toks[i].text == "S" and i + 1 < len(toks) and toks[i + 1].kind == "dia":
        zone = "SØ"
        i += 2
    if i < len(toks) and _num(toks[i].text) is not None:
        tolerance = toks[i].text.replace(",", ".")
        i += 1
    if i < len(toks) and toks[i].kind == "mod":
        modifier = toks[i].text
        i += 1
    while i < len(toks):
        t = toks[i]
        if LETTER.match(t.text):
            datums.append(t.text)
        elif t.kind == "mod" and datums:
            datums[-1] = f"{datums[-1]}{t.text}"
        elif SECTION_LABEL.match(t.text):
            datums.append(t.text.replace("-", ""))
        i += 1
    while len(datums) < 3:
        datums.append("")
    desc = GDT_TYPE.get(name, "Other")
    record = {
        "descriptionType": desc,
        "specification": f"{symbol}{zone}{tolerance}{('Ⓜ' if modifier == 'M' else ('Ⓛ' if modifier == 'L' else ''))} {' '.join(d for d in datums if d)}".strip(),
        "nominal": _num(tolerance) if tolerance else None,
        "tolHigh": None,
        "tolLow": None,
        "toleranceType": "GD&T",
        "gdt": {"symbol": symbol, "zone": zone, "tolerance": tolerance, "modifier": modifier, "datums": datums[:3]},
        "places": _places(tolerance),
        "count": 1,
        "measurementType": "Variable",
        "units": "mm",
    }
    conf = 1.0 if tolerance else 0.5
    reason = f"{name or 'geometric'} frame" + ("" if tolerance else ", tolerance not read")
    return Group(line, "fcf", record, conf, reason, list(line.all_tokens))


def parse_dimension(line: Line, units: str) -> Group | None:
    toks = line.tokens
    count = 1
    desc = "Linear"
    nominal: float | None = None
    nominal_text = ""
    tol_high: float | None = None
    tol_low: float | None = None
    tol_type = "Bilateral"
    explicit = False
    notes: list[str] = []
    prefix = ""
    reference = False
    feats: list[str] = []
    dim_units = units
    i = 0
    while i < len(toks):
        t = toks[i]
        txt = t.text
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        m_count = COUNT.match(txt)
        if m_count and nominal is None:
            count = int(m_count.group(1))
            i += 1
            continue
        if txt.upper() == "X" and nominal is not None and nxt is not None and _num(nxt.text) is not None:
            # "5 X 45°": chamfer, leg by angle.
            after = toks[i + 2] if i + 2 < len(toks) else None
            # "Ø5 X 3 HOLES": the count follows the value.
            if after is not None and after.text.upper() in ("HOLES", "HOLE", "PLACES", "PLCS", "PL", "NOS", "OFF", "SLOTS", "POSN") and nxt.text.isdigit():
                count = int(nxt.text)
                i += 2
                continue
            if after is not None and after.kind == "deg":
                desc = "Chamfer"
                notes.append(f"x {nxt.text}°")
                i += 3
                continue
            # "2 X 70.5": count written with a space.
            if nominal is not None and float(nominal).is_integer() and not prefix and "." not in nominal_text:
                count = int(nominal)
                nominal = None
                nominal_text = ""
                i += 1
                continue
        if t.kind == "feat":
            feats.append(txt)
            i += 1
            continue
        if t.kind == "dia":
            desc = "Diameter"
            prefix = "Ø"
            i += 1
            continue
        if txt == "S" and nxt is not None and nxt.kind == "dia":
            desc = "Diameter"
            prefix = "SØ"
            i += 2
            continue
        m_r = RADIUS.match(txt)
        if m_r and nominal is None:
            desc = "Radius"
            prefix = "SR" if txt.startswith("S") else "R"
            if m_r.group(1):
                nominal = _num(m_r.group(1))
                nominal_text = m_r.group(1)
            i += 1
            continue
        m_th = THREAD.match(txt)
        if m_th and nominal is None:
            desc = "Thread"
            prefix = "M"
            nominal = _num(m_th.group(1))
            nominal_text = m_th.group(1)
            if m_th.group(2):
                notes.append(f"x{m_th.group(2)}")
            i += 1
            continue
        if txt in ("(", ")"):
            reference = True
            i += 1
            continue
        if (txt.startswith("(") or txt.endswith(")")) and _num(txt.strip("()")) is not None:
            txt = f"({txt.strip('()')})"
        m_p = PAREN.match(txt)
        if m_p:
            inner = m_p.group(1)
            if _num(inner) is not None and nominal is None:
                nominal = _num(inner)
                nominal_text = inner
                reference = True
            i += 1
            continue
        if t.kind == "pm":
            if nxt is not None and _num(nxt.text) is not None:
                v = abs(_num(nxt.text) or 0)
                tol_high, tol_low, tol_type, explicit = v, -v, "Bilateral", True
                i += 2
                continue
            i += 1
            continue
        if t.kind == "deg":
            desc = "Angular"
            dim_units = "deg"
            i += 1
            continue
        n = _num(txt)
        if n is not None:
            if nominal is None:
                nominal = n
                nominal_text = txt
                stack = t.extra.get("stack")
                if stack:
                    parsed = _tolerance_from_stack(stack)
                    if parsed:
                        tol_high, tol_low, tol_type = parsed
                        explicit = True
            else:
                # Two numbers in a row: "12.5 12.4" limits, or a second value we cannot place.
                notes.append(txt)
            i += 1
            continue
        if txt.upper() in MODIFIER_WORDS:
            notes.append(txt.upper())
            if txt.upper() in ("MIN", "MAX") and nominal is not None and not explicit:
                explicit = True
                tol_type = "Unilateral"
                if txt.upper() == "MAX":
                    tol_high, tol_low = 0.0, -abs(nominal)
                else:
                    tol_high, tol_low = abs(nominal), 0.0
            i += 1
            continue
        if FRACTION_INCH.match(txt) and nominal is None:
            a, b = txt.split("/")
            nominal = float(a) / float(b)
            nominal_text = txt
            dim_units = "in"
            i += 1
            continue
        notes.append(txt)
        i += 1

    if nominal is None:
        return None
    places = _places(nominal_text) if not (nominal_text and "/" in nominal_text) else 3
    # A printed tolerance finer than the nominal (25.4 ±0.13) sets the precision, or limits would round away.
    for tol in (tol_high, tol_low):
        if explicit and tol is not None:
            places = max(places, _places(f"{abs(tol):.6f}".rstrip("0").rstrip(".")))
    unknown = [n for n in notes if re.fullmatch(r"[A-Za-z]{3,}", n) and n.upper() not in MODIFIER_WORDS]
    if reference:
        tol_type, conf, reason = "Reference", 0.8, "reference dimension"
    elif explicit:
        conf, reason = 1.0, "tolerance printed"
    elif prefix or places >= 1 or desc in ("Angular", "Chamfer") or count > 1 or len(nominal_text) >= 2 or (notes and not unknown):
        conf, reason = 0.8, "default tolerance applies"
    else:
        conf, reason = 0.5, "single digit, could be a label"
    if unknown:
        conf, reason = 0.5, "unrecognised word: " + " ".join(unknown)
    spec_parts = []
    if count > 1:
        spec_parts.append(f"{count}X")
    spec_parts.append(f"{''.join(feats)}{prefix}{nominal_text}{'°' if dim_units == 'deg' else ''}")
    if explicit and tol_high is not None and tol_low is not None:
        if tol_type == "Bilateral" and abs(tol_high) == abs(tol_low):
            spec_parts.append(f"±{abs(tol_high):g}")
        else:
            spec_parts.append(f"{tol_high:+g}/{tol_low:g}" if tol_low == 0 else f"{tol_high:+g}/{tol_low:+g}")
    spec_parts.extend(notes)
    record = {
        "descriptionType": desc,
        "specification": " ".join(spec_parts),
        "nominal": nominal,
        "tolHigh": tol_high,
        "tolLow": tol_low,
        "toleranceType": tol_type,
        "gdt": None,
        "places": places,
        "count": count,
        "measurementType": "Variable",
        "units": dim_units,
        "_feats": feats,
    }
    return Group(line, "dimension", record, conf, reason, list(line.all_tokens))


def parse_line(line: Line, units: str) -> Group | None:
    if line.tokens[0].kind == "gdt":
        return parse_fcf(line)
    return parse_dimension(line, units)


def score_with_geometry(group: Group, heads: list[Arrowhead]) -> None:
    x0, y0, x1, y1 = group.line.bbox
    reach = 6.0 * group.line.size
    d = nearest_arrowhead(heads, x0, y0, x1, y1, reach)
    if d is not None:
        group.record["_geometry"] = True
        if group.confidence == 0.5 and group.kind == "dimension":
            group.confidence = 0.8
            group.reason = "single digit, arrowhead nearby"
    else:
        group.record["_geometry"] = False
