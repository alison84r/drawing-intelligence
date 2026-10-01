"""
Server-side twin of the frontend tolerance rules (packages/frontend/src/lib/tolerance.ts).
Both must agree: the report shows what the inspector saw on screen.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

GDT_MODIFIERS = {"M": "Ⓜ", "L": "Ⓛ", "P": "Ⓟ", "F": "Ⓕ"}
PASS_WORDS = re.compile(r"^(pass|ok|go|good|accept(ed)?|yes)$", re.I)
FAIL_WORDS = re.compile(r"^(fail|nok|no-?go|reject(ed)?|no)$", re.I)

DEFAULT_TOLERANCES = {"places0": 0.5, "places1": 0.2, "places2": 0.1, "places3": 0.05, "angular": 0.5}


def num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).strip().replace(",", ".").lstrip("+"))
    except ValueError:
        return None


def fmt(v: float | None, places: int) -> str:
    return "" if v is None else f"{v:.{max(int(places), 0)}f}"


def _decimals(v: float | None) -> int:
    if v is None:
        return 0
    for p in range(4):
        if abs(v - round(v, p)) < 1e-9:
            return p
    return 4


def limit_places(places: int, limits: "Limits") -> int:
    """Places to print a limit with: a whole-number size with ±0.2 has limits at one decimal. Twin of limitPlaces in tolerance.ts."""
    return max(int(places), _decimals(limits.high), _decimals(limits.low))


def is_angular(c: dict[str, Any]) -> bool:
    return c.get("descriptionType") == "Angular" or c.get("units") == "deg"


def is_attribute(c: dict[str, Any]) -> bool:
    return c.get("measurementType") == "Attribute" or c.get("descriptionType") == "Note" or c.get("toleranceType") == "Attribute"


def has_numeric_tolerance(c: dict[str, Any]) -> bool:
    if is_attribute(c):
        return False
    return c.get("toleranceType") not in ("Basic", "Reference", "Attribute")


def default_tolerance_info(c: dict[str, Any], defaults: dict[str, Any]) -> tuple[float, str]:
    """Tolerance applied when none is printed, and where it comes from. Mirrors defaultToleranceInfo in tolerance.ts."""
    d = {**DEFAULT_TOLERANCES, **{k: v for k, v in (defaults or {}).items() if k != "scheme"}}
    scheme = (defaults or {}).get("scheme")
    if is_angular(c):
        return float(d["angular"]), "angle: settings value"
    nominal = num(c.get("nominal"))
    if scheme and scheme.get("kind") == "size_range" and nominal is not None:
        radius = c.get("descriptionType") in ("Radius", "Chamfer") and scheme.get("radius")
        rows = scheme["radius"] if radius else scheme.get("linear") or []
        v = abs(nominal)
        for i, (lo, hi, tol) in enumerate(rows):
            if (v > lo or (i == 0 and v >= lo)) and v <= hi:
                span = f"over {lo:g}" if hi >= 1e8 else f"{lo:g} to {hi:g}"
                return float(tol), f"{scheme.get('label', 'tolerance table')}, {'radius ' if radius else ''}{span}"
    places = min(int(c.get("places") or 0), 3)
    key = ["places0", "places1", "places2", "places3"][places]
    note = " (value is outside the table)" if scheme and scheme.get("kind") == "size_range" else ""
    return float(d[key]), f"by decimal places{note}"


def default_tolerance(c: dict[str, Any], defaults: dict[str, Any]) -> float:
    return default_tolerance_info(c, defaults)[0]


@dataclass
class Limits:
    min: float | None
    max: float | None
    high: float | None
    low: float | None
    auto: bool
    origin: str = ""


def derive_limits(c: dict[str, Any], defaults: dict[str, float]) -> Limits:
    none = Limits(None, None, None, None, False)
    if not has_numeric_tolerance(c):
        return none
    nominal = num(c.get("nominal"))
    if c.get("toleranceType") == "GD&T":
        g = c.get("gdt") or {}
        t = num(g.get("tolerance")) if g else num(c.get("tolHigh"))
        return none if t is None else Limits(0.0, abs(t), abs(t), 0.0, False)
    if nominal is None:
        return none
    hi, lo = num(c.get("tolHigh")), num(c.get("tolLow"))
    if c.get("toleranceType") == "Limits":
        if hi is None or lo is None:
            return none
        return Limits(min(hi, lo), max(hi, lo), hi, lo, False)
    auto = False
    origin = "printed on the drawing"
    if hi is None and lo is None:
        t, origin = default_tolerance_info(c, defaults)
        hi, lo, auto = t, -t, True
    else:
        hi = hi if hi is not None else 0.0
        lo = lo if lo is not None else 0.0
    return Limits(nominal + min(lo, hi), nominal + max(lo, hi), hi, lo, auto, origin)


def display_status(c: dict[str, Any], limits: Limits) -> str:
    r = c.get("result")
    if r is not None and r != "":
        if isinstance(r, str) and PASS_WORDS.match(r):
            return "Pass"
        if isinstance(r, str) and FAIL_WORDS.match(r):
            return "Fail"
        n = num(r)
        if n is not None and limits.min is not None and limits.max is not None:
            return "Pass" if limits.min - 1e-9 <= n <= limits.max + 1e-9 else "Fail"
    if c.get("source") == "auto" and c.get("status") == "Draft":
        return "Draft"
    return "Accepted" if (num(c.get("nominal")) is not None or c.get("specification") or c.get("gdt")) else "Draft"


def gdt_text(g: dict[str, Any]) -> str:
    mod = GDT_MODIFIERS.get(g.get("modifier") or "", "")
    datums = [d for d in (g.get("datums") or []) if d]
    return " ".join([g.get("symbol", ""), f"{g.get('zone', '')}{g.get('tolerance', '')}{mod}", *datums]).strip()


def requirement_text(c: dict[str, Any], limits: Limits) -> str:
    if c.get("toleranceType") == "GD&T" and c.get("gdt"):
        return gdt_text(c["gdt"])
    spec = c.get("specification") or ""
    nominal = num(c.get("nominal"))
    if spec and (nominal is None or is_attribute(c)):
        return spec
    if nominal is None:
        return spec
    p = int(c.get("places") or 0)
    count = int(c.get("count") or 1)
    prefix = f"{count}X " if count > 1 else ""
    sym = {"Diameter": "Ø", "Radius": "R"}.get(c.get("descriptionType"), "")
    unit = "°" if is_angular(c) else ""
    base = f"{prefix}{sym}{nominal:.{p}f}{unit}"
    tt = c.get("toleranceType")
    if tt == "Basic":
        return f"[{base}]"
    if tt == "Reference":
        return f"({base})"
    if limits.high is None or limits.low is None:
        return base
    if tt == "Limits":
        return f"{limits.max:.{p}f} / {limits.min:.{p}f}"
    tp = max(p, 1)
    if abs(limits.high + limits.low) < 1e-9:
        return f"{base} (±{abs(limits.high):.{tp}f})"

    def sign(v: float) -> str:
        return ("+" if v > 0 else "-" if v < 0 else "") + f"{abs(v):.{tp}f}"

    return f"{base} ({sign(limits.high)}/{sign(limits.low)})"


def balloon_label(c: dict[str, Any]) -> str:
    n, sub = c.get("balloonNumber"), c.get("subNumber")
    return f"{n}.{sub}" if sub else str(n)


def result_text(c: dict[str, Any]) -> str:
    """Numeric results printed with the characteristic's places; Pass/Fail words as typed."""
    r = c.get("result")
    if r is None or r == "":
        return ""
    if isinstance(r, (int, float)):
        return fmt(float(r), int(c.get("places") or 0))
    return str(r)


def sort_key(c: dict[str, Any]) -> tuple[int, int, int]:
    return (int(c.get("page") or 0), int(c.get("balloonNumber") or 0), int(c.get("subNumber") or 0))
