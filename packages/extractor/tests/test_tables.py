"""A table is read cell by cell, and a tolerance table is understood from its cells."""
from __future__ import annotations

from pathlib import Path

import pytest

from recognize.pipeline import recognize
from recognize.tables import tidy
from tolerance.detect import detect_scheme
from tolerance.grid import read_tolerance_grid

HEAT_SINK = Path(__file__).resolve().parents[4] / "Drawings" / "01270007-01_heat-sink-plate (1) (1).pdf"

GRID = [
    ["TOLERANCE CLASS", None, "LINEAR TOLERANCE", None, None, "ANGULAR TOLERANCE", None],
    ["DESIGNATION", "DESCRIPTION", "UPTO 3", "OVER 3 UPTO 6", "OVER 6 UPTO 30", "UPTO 10", "OVER 10 UPTO 50"],
    ["f", "Fine", "±0.05", "±0.05", "±0.1", "±1°", "±0°30'"],
    ["m", "Medium", "±0.1", "±0.1", "±0.2", None, None],
    ["v", "Very Coarse", "-", "±0.5", "±1", "±3°", "±2°"],
]


def test_symbols_go_back_where_they_are_printed():
    assert tidy("0.05 ±") == "±0.05"
    assert tidy("0 30' ± °") == "±0°30'"
    assert tidy("1 ± °") == "±1°"
    assert tidy("OVER 3\nUPTO 6") == "OVER 3 UPTO 6"
    assert tidy(None) is None


def test_columns_are_ranges_and_rows_are_classes():
    t = read_tolerance_grid(GRID)
    assert t["linear"]["m"] == [[0.0, 3.0, 0.1], [3.0, 6.0, 0.1], [6.0, 30.0, 0.2]]
    assert t["linear"]["v"] == [[3.0, 6.0, 0.5], [6.0, 30.0, 1.0]]  # the dash is "no tolerance", not zero
    assert t["angular"]["f"] == [[0.0, 10.0, 1.0], [10.0, 50.0, 0.5]]


def test_a_merged_cell_is_shared_with_the_row_above():
    assert read_tolerance_grid(GRID)["angular"]["m"] == [[0.0, 10.0, 1.0], [10.0, 50.0, 0.5]]


def test_a_title_block_is_not_a_tolerance_table():
    assert read_tolerance_grid([["DRAWN", "RV", "05-09-2025"], ["CHECKED", "RS", "05-09-2025"]]) is None


def test_a_company_table_with_its_own_ranges_is_used_as_printed():
    table = {"linear": {"m": [[0.0, 10.0, 0.15], [10.0, 100.0, 0.25]]}, "angular": {}}
    out = detect_scheme([], "m", table)
    assert out["scheme"]["linear"] == [[0.0, 10.0, 0.15], [10.0, 100.0, 0.25]]
    assert out["scheme"]["verifiedAgainstSheet"] is False and out["scheme"]["source"] == "drawing"


@pytest.mark.skipif(not HEAT_SINK.exists(), reason="sample drawings not present")
def test_heat_sink_table_end_to_end():
    page = recognize(HEAT_SINK.read_bytes())["pages"][0]
    grid = next(g for g in page["grids"] if g["kind"] == "tolerance")
    assert (len(grid["rows"]), grid["cols"]) == (7, 13)
    assert grid["rows"][4][:7] == ["m", "Medium", "±0.1", "±0.1", "±0.2", "±0.3", "±0.5"]
    scheme = page["tolerance"]["scheme"]
    assert scheme["label"] == "ISO 2768-m" and scheme["verifiedAgainstSheet"] is True
    assert scheme["linear"] == [[0.5, 3.0, 0.1], [3.0, 6.0, 0.1], [6.0, 30.0, 0.2], [30.0, 120.0, 0.3], [120.0, 400.0, 0.5]]
    assert scheme["angular"][0] == [0.0, 10.0, 1.0] and scheme["angular"][-1][2] == pytest.approx(0.0833)
