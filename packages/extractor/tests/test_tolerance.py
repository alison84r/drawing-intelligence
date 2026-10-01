"""General tolerance: standard tables, range lookup, limits with a scheme, and detection on real drawings."""
from __future__ import annotations

import pdfplumber
import pytest

from export.characteristics import derive_limits
from golden_tools import DRAWINGS, FILES
from recognize.tokens import build_tokens
from tolerance.detect import detect_scheme
from tolerance.standards import ISO_2768_LINEAR, ISO_2768_RADIUS, lookup


def test_lookup_boundaries() -> None:
    m = ISO_2768_LINEAR["m"]
    assert lookup(m, 0.5) == (0.5, 3, 0.1)      # the first range includes its lower bound
    assert lookup(m, 3) == (0.5, 3, 0.1)        # "up to and including"
    assert lookup(m, 3.01) == (3, 6, 0.1)
    assert lookup(m, 30) == (6, 30, 0.2)
    assert lookup(m, 113.4) == (30, 120, 0.3)
    assert lookup(m, 134.95) == (120, 400, 0.5)
    assert lookup(m, 0.2) is None               # below the table
    assert lookup(ISO_2768_LINEAR["v"], 2) is None  # very coarse has no value under 3


def _char(nominal: float, places: int, kind: str = "Linear") -> dict:
    return {"nominal": nominal, "places": places, "descriptionType": kind, "toleranceType": "Bilateral", "tolHigh": None, "tolLow": None, "units": "mm"}


SCHEME = {"kind": "size_range", "label": "ISO 2768-m", "linear": [list(r) for r in ISO_2768_LINEAR["m"]], "radius": [list(r) for r in ISO_2768_RADIUS["m"]]}


def test_limits_follow_size_range_not_decimals() -> None:
    defaults = {"places0": 0.5, "places1": 0.2, "places2": 0.1, "places3": 0.05, "angular": 0.5, "scheme": SCHEME}
    lim = derive_limits(_char(134.95, 2), defaults)
    assert (round(lim.min, 2), round(lim.max, 2)) == (134.45, 135.45)
    assert lim.auto and "120 to 400" in lim.origin
    assert derive_limits(_char(119, 0), defaults).high == 0.3
    assert derive_limits(_char(62.4, 1), defaults).high == 0.3
    assert derive_limits(_char(7.5, 1, "Radius"), defaults).high == 1.0     # radii use their own table
    assert derive_limits(_char(90, 0, "Angular") | {"units": "deg"}, defaults).high == 0.5  # angles stay on the settings value


def test_limits_without_scheme_use_decimal_places() -> None:
    lim = derive_limits(_char(134.95, 2), {"places2": 0.1})
    assert lim.high == 0.1 and "decimal" in lim.origin


def test_printed_tolerance_wins_over_any_default() -> None:
    c = _char(25.4, 2) | {"tolHigh": 0.13, "tolLow": -0.13}
    lim = derive_limits(c, {"scheme": SCHEME})
    assert (lim.high, lim.low, lim.auto) == (0.13, -0.13, False)


def _detect(key: str) -> dict:
    path = DRAWINGS / FILES[key]
    if not path.exists():
        pytest.skip("drawing not available on this machine")
    with pdfplumber.open(path) as pdf:
        return detect_scheme(build_tokens(pdf.pages[0].chars, 0))


def test_heat_sink_declares_iso_2768_medium_and_its_table_agrees() -> None:
    r = _detect("heatsink")
    s = r["scheme"]
    assert s and s["cls"] == "m" and s["source"] == "drawing" and s["verifiedAgainstSheet"] is True
    assert any("MEDIUM" in e for e in s["evidence"])


def test_bracket_refers_to_a_company_standard_that_is_not_on_the_sheet() -> None:
    r = _detect("b1100")
    assert r["scheme"] is None and r["companyStandard"] == "THINQX"


def test_no_statement_means_no_scheme() -> None:
    assert _detect("cmp1")["scheme"] is None
