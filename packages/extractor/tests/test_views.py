"""Views: found from the thick outline, named from their labels, scaled from the print or from the geometry."""
from __future__ import annotations

import io
from pathlib import Path

import pdfplumber
import pytest

from recognize.pipeline import recognize
from recognize.views import View, _key, _thick_pen, recheck_with_view_scale, scale_text

DRAWINGS = Path(__file__).resolve().parents[4] / "Drawings"


@pytest.mark.parametrize("scale,text", [(1.0, "1:1"), (0.5, "1:2"), (2.0, "2:1"), (0.4, "1:2.5"), (1.3, "1.3x"), (None, "")])
def test_scale_text(scale, text):
    assert scale_text(scale) == text


def test_one_view_two_mentions_two_views_one_letter():
    assert _key("VIEW B") == _key("AUXILIARY VIEW -B")
    assert _key("SECTION A-A") != _key("DETAIL A")


def test_single_pen_sheet_has_no_thick_class():
    assert _thick_pen([(0.36, [(0, 0), (100, 0)]), (0.36, [(0, 0), (0, 50)])]) == 0.0
    assert _thick_pen([(0.36, [(0, 0), (100, 0)]), (1.44, [(0, 0), (0, 50)])]) == pytest.approx(0.45)


def test_lone_dimension_in_a_detail_is_checked_at_the_detail_scale():
    unit = 72.0 / 25.4
    callout = {"view": 0, "nominal": 5.0, "geometry": {"kind": "dimension", "ratioOk": False, "measured": 20.0, "span": 5.0 * 2.0 * unit}}
    wrong = {"view": 0, "nominal": 5.0, "geometry": {"kind": "dimension", "ratioOk": False, "measured": 7.0, "span": 7.0 * 2.0 * unit}}
    assert recheck_with_view_scale([callout, wrong], [View((0, 0, 10, 10), "DETAIL A", declared=2.0)], "mm") == 1
    assert callout["geometry"]["ratioOk"] is True and wrong["geometry"]["ratioOk"] is False


@pytest.mark.skipif(not (DRAWINGS / "01270007-01_heat-sink-plate (1) (1).pdf").exists(), reason="sample drawings not present")
def test_heat_sink_views():
    page = recognize((DRAWINGS / "01270007-01_heat-sink-plate (1) (1).pdf").read_bytes())["pages"][0]
    views = {v["name"]: v for v in page["views"]}
    assert views["DETAIL A"]["scaleText"] == "2:1" and views["DETAIL A"]["scaleSource"] == "declared"
    assert views["ISOMETRIC VIEW"]["scaleText"] == "1:2"
    assert views["SECTION A-A"]["scaleText"] == "1:2" and views["SECTION A-A"]["scaleSource"] == "measured"
    # The tolerance table is ruled and full of words: it is not a view.
    assert all(v["bbox"]["y"] < 0.8 * page["height"] for v in page["views"])
    assert all(c["view"] for c in page["characteristics"] if c["descriptionType"] != "Note")


@pytest.mark.skipif(not (DRAWINGS / "18_1100_011.pdf").exists(), reason="sample drawings not present")
def test_title_goes_to_the_view_above_it():
    page = recognize((DRAWINGS / "18_1100_011.pdf").read_bytes())["pages"][0]
    views = {v["name"]: v for v in page["views"]}
    # SECTION A-A is the short tube at the top, not the large view under its title.
    assert views["SECTION A-A"]["bbox"]["h"] < 80
    assert views["AUXILIARY VIEW -B"]["bbox"]["y"] < 0.2 * page["height"]
