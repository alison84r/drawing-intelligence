"""
Find the general tolerance a drawing declares, from its own text.

Reads, in this order of trust:
  1. a named standard and class ("ISO 2768-mK", "TOLERANCE CLASS :- MEDIUM"),
  2. a size-range table printed on the sheet, checked against the reference copy,
  3. a decimal-place block (".X ±0.1  .XX ±0.05  ANGLES ±0.5°"),
  4. a reference to a company standard that is not on the sheet (reported, cannot be read).

Deterministic. Returns the scheme plus the exact text it relied on, so a person can confirm it.
"""
from __future__ import annotations

import re
from typing import Any

from .standards import CLASS_LABEL, CLASS_NAMES, ISO_2768_LINEAR, ISO_2768_RADIUS

ISO_NAME = re.compile(r"(?:DIN\s*)?(?:EN\s*)?ISO\s*2768\s*[-–/ ]?\s*(?:1\s*[-–/ ]\s*)?([fmcv])\s*([HKL])?(?![a-z])", re.I)
CLASS_NOTE = re.compile(r"TOLERANCE\s+CLASS\s*[:\-–=\s]*\s*(VERY\s+COARSE|FINE|MEDIUM|COARSE)\b", re.I)
TABLE_ROW = re.compile(r"\b(Very\s+Coarse|Fine|Medium|Coarse)\b((?:\s*[-–]?\s*±\s*\d+(?:[.,]\d+)?){3,})", re.I)
COMPANY_REF = re.compile(r"REFER\s+([A-Z0-9][A-Z0-9 &._-]{1,30}?)\s+STANDARD\b.{0,400}?UNSPECIFIED\s+TOLERANCE", re.I)
DECIMAL_ROW = re.compile(r"(?<![A-Z0-9])(?:X\s*)?[.,]\s*(X{1,4})\s*[:=]?\s*±\s*(\d*[.,]?\d+)", re.I)
WHOLE_ROW = re.compile(r"(?<![A-Z0-9.,])X\s*[:=]?\s*±\s*(\d*[.,]?\d+)", re.I)
ANGLE_ROW = re.compile(r"ANG(?:LE|ULAR)S?\s*[:=]?\s*±\s*(\d*[.,]?\d+)\s*°?", re.I)


def text_lines(tokens: list[Any]) -> list[str]:
    """Upright tokens joined into reading lines, top to bottom."""
    rows: dict[int, list[Any]] = {}
    for t in tokens:
        if t.rot != 0 or not t.text.strip():
            continue
        rows.setdefault(int(round(t.cy / max(3.0, 0.55 * t.size))), []).append(t)
    out = []
    for key in sorted(rows):
        out.append(" ".join(t.text for t in sorted(rows[key], key=lambda t: t.x0)))
    return out


PLAIN = re.compile(r"^\d+(?:[.,]\d+)?$")
ROW_LABEL = re.compile(r"^(very\s+coarse|fine|medium|coarse)$", re.I)


def printed_rows(tokens: list[Any]) -> dict[str, list[float]]:
    """
    Rows of a printed tolerance table: the class name, then the values to its right on the same row.
    Table cells mix font sizes and symbol glyphs, so rows are matched by vertical overlap, not by baseline.
    The linear values end where the angular ones (with degree or minute marks) begin.
    """
    upright = [t for t in tokens if t.rot == 0]
    out: dict[str, list[float]] = {}
    for label in upright:
        if not ROW_LABEL.match(label.text.strip()):
            continue
        band = 0.75 * max(label.size, 9.0)
        row = sorted((t for t in upright if t.x0 > label.x1 and abs(t.cy - label.cy) <= band), key=lambda t: t.x0)
        stop = next((t.x0 for t in row if "°" in t.text or "'" in t.text), None)
        values = []
        for t in row:
            if stop is not None and t.x0 >= stop - 4 * label.size:
                break
            if PLAIN.match(t.text):
                values.append(float(t.text.replace(",", ".")))
        if len(values) >= 3:
            out[CLASS_NAMES[re.sub(r"\s+", " ", label.text.strip().lower())]] = values
    return out


def _num(s: str) -> float:
    return float(s.replace(",", "."))


def detect_scheme(tokens: list[Any], marked_class: str | None = None, table: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    marked_class: the class letter (f, m, c, v) that the sheet singles out graphically, typically a circle
    drawn round it in the designation column of the printed table. Used only when no note names the class.
    table: the general tolerance table read cell by cell (tolerance/grid.py): {'linear': {cls: rows}, 'angular': {cls: rows}}.
        When present, the size ranges and values are the sheet's own, not assumed from the standard.
    """
    lines = text_lines(tokens)
    findings: list[dict[str, str]] = []
    cls: str | None = None
    grade: str | None = None
    evidence: list[str] = []

    for ln in lines:
        m = ISO_NAME.search(ln)
        if m:
            cls, grade = m.group(1).lower(), (m.group(2) or "").upper() or None
            evidence.append(ln.strip()[:140])
            break
    if cls is None:
        for ln in lines:
            m = CLASS_NOTE.search(ln)
            if m:
                cls = CLASS_NAMES[re.sub(r"\s+", " ", m.group(1).lower())]
                evidence.append(ln.strip()[:140])
                break

    printed = printed_rows(tokens)
    printed_line = {k: f"{CLASS_LABEL[k].capitalize()} " + " ".join(f"±{v:g}" for v in vals) for k, vals in printed.items()}
    for ln in lines:
        m = TABLE_ROW.search(ln)
        if m:
            key = CLASS_NAMES[re.sub(r"\s+", " ", m.group(1).lower())]
            printed.setdefault(key, [_num(v) for v in re.findall(r"±\s*(\d+(?:[.,]\d+)?)", m.group(2))])
            printed_line.setdefault(key, ln.strip()[:140])

    for key, cell_rows in ((table or {}).get("linear") or {}).items():
        printed.setdefault(key, [r[2] for r in cell_rows])
        printed_line.setdefault(key, f"{CLASS_LABEL[key].capitalize()} " + " ".join(f"±{r[2]:g}" for r in cell_rows))

    if cls is None and marked_class in printed:
        cls = marked_class
        evidence.append(f"Class {marked_class} ({CLASS_LABEL[marked_class]}) is circled in the table on the sheet")

    if cls is not None:
        reference = ISO_2768_LINEAR[cls]
        rows = [list(r) for r in reference]
        verified: bool | None = None
        source = "library"
        if cls in printed:
            values = printed[cls]
            evidence.append("Table on the sheet: " + printed_line[cls])
            source = "drawing"
            expected = [r[2] for r in reference[: len(values)]]
            if values == expected:
                verified = True
            else:
                # The sheet's own table wins. Its range boundaries are taken as the standard ones.
                verified = False
                rows = [[lo, hi, values[i]] if i < len(values) else [lo, hi, tol] for i, (lo, hi, tol) in enumerate(reference)]
                findings.append({"level": "warn", "text": f"The printed table differs from ISO 2768-1 {CLASS_LABEL[cls]}. The printed values are used; check the size ranges."})
        label = f"ISO 2768-{cls}{grade or ''}" if any("2768" in e for e in evidence) or verified else f"Tolerance class {CLASS_LABEL[cls]}"
        if verified:
            label = f"ISO 2768-{cls}{grade or ''}"
        scheme = {
            "kind": "size_range",
            "label": label,
            "standard": "ISO 2768-1",
            "cls": cls,
            "linear": rows,
            "radius": [list(r) for r in ISO_2768_RADIUS[cls]],
            "source": source,
            "verifiedAgainstSheet": verified,
            "evidence": evidence,
        }
        # Cell by cell, the sheet's own ranges and values replace the assumed standard ones.
        cells = ((table or {}).get("linear") or {}).get(cls)
        if cells:
            standard = {float(hi): (float(lo), float(tol)) for lo, hi, tol in reference}
            verified = all(float(hi) in standard and standard[float(hi)][1] == float(tol) for _, hi, tol in cells)
            # "UPTO 3" has no printed lower bound; the standard's (0.5) is used when the row is the standard's.
            scheme["linear"] = [[standard[float(hi)][0] if lo == 0 and float(hi) in standard else lo, hi, tol] for lo, hi, tol in cells]
            scheme["source"], scheme["verifiedAgainstSheet"] = "drawing", verified
            evidence.append("Read cell by cell: " + ", ".join(f"{lo:g} to {hi:g} ±{tol:g}" for lo, hi, tol in scheme["linear"]))
            if verified:
                scheme["label"] = label = f"ISO 2768-{cls}{grade or ''}"
            elif not any(f["text"].startswith("The printed table differs") for f in findings):
                findings.append({"level": "warn", "text": f"The printed table differs from ISO 2768-1 {CLASS_LABEL[cls]}. The printed values and ranges are used."})
        angles = ((table or {}).get("angular") or {}).get(cls)
        if angles:
            scheme["angular"] = angles
        findings.insert(0, {"level": "ok", "text": f"{label} ({CLASS_LABEL[cls]})" + (", printed table agrees with the standard" if verified else "")})
        findings.append({"level": "warn", "text": "Angular general tolerance depends on the length of the shorter leg" + (", read from the table" if angles else "") + "; the settings value is used for angles."})
        return {"scheme": scheme, "findings": findings}

    if printed:
        findings.append({"level": "warn", "text": "A tolerance table is printed but no class is stated. Choose the class in settings."})

    joined = "  ".join(lines)
    decimals: dict[int, float] = {}
    hits: list[str] = []
    for m in DECIMAL_ROW.finditer(joined):
        decimals[len(m.group(1))] = _num(m.group(2))
        hits.append(m.group(0).strip())
    if decimals:
        m0 = WHOLE_ROW.search(joined)
        if m0:
            decimals.setdefault(0, _num(m0.group(1)))
        ma = ANGLE_ROW.search(joined)
        scheme = {
            "kind": "decimal_places",
            "label": "Tolerance block on the drawing",
            "places": {str(k): v for k, v in sorted(decimals.items())},
            "angular": _num(ma.group(1)) if ma else None,
            "source": "drawing",
            "evidence": hits[:6],
        }
        findings.insert(0, {"level": "ok", "text": "Decimal-place tolerance block read from the drawing"})
        return {"scheme": scheme, "findings": findings}

    for i in range(len(lines)):
        m = COMPANY_REF.search(" ".join(lines[i : i + 12]))
        if m:
            name = re.sub(r"\s+", " ", m.group(1)).strip()
            findings.append({"level": "warn", "text": f"The drawing refers to the {name} standard for unspecified tolerances. It is not on the sheet: settings values are used until a customer profile is set."})
            return {"scheme": None, "findings": findings, "companyStandard": name}

    findings.append({"level": "warn", "text": "No general tolerance statement found on the sheet. Settings values are used."})
    return {"scheme": None, "findings": findings}
