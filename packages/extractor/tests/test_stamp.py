"""The stamp says only what the results support, and sits only on clear paper."""
from __future__ import annotations

import numpy as np

from export.stamp import find_free_box, legend_rows, stamp_lines, summarise


def _dim(result=None, status="Accepted", tol_type="Bilateral"):
    return {"nominal": 10.0, "tolHigh": 0.1, "tolLow": -0.1, "toleranceType": tol_type, "result": result, "status": status,
            "source": "auto", "specification": "10", "places": 1, "descriptionType": "Linear", "measurementType": "Variable", "gdt": None}


def test_all_measured_and_passing_is_accepted():
    s = summarise([_dim(10.0), _dim(10.05)], {})
    assert (s.verdict, s.passed, s.measured, s.to_measure) == ("ACCEPTED", 2, 2, 2)


def test_any_fail_is_rejected():
    assert summarise([_dim(10.0), _dim(10.5)], {}).verdict == "REJECTED"


def test_unmeasured_rows_keep_it_in_progress():
    s = summarise([_dim(10.0), _dim(None)], {})
    assert s.verdict == "IN PROGRESS" and s.accepted == 1


def test_nothing_measured_is_never_accepted():
    assert summarise([], {}).verdict == "IN PROGRESS"


def test_reference_dimensions_do_not_need_a_result():
    assert summarise([_dim(10.0), _dim(None, tol_type="Reference")], {}).verdict == "ACCEPTED"


def test_stamp_and_legend_text():
    s = summarise([_dim(10.0), _dim(10.5), _dim(None, status="Draft")], {})
    assert stamp_lines(s, "FAIR-7", "02 OCT 2026") == ("FAI REJECTED", "FAIR-7 · 02 OCT 2026", "2 of 3 measured · 1 nonconforming")
    assert [r[0] for r in legend_rows(s)] == ["pass", "fail", "draft"]


def test_box_goes_to_clear_paper_nearest_the_preferred_corner():
    ink = np.zeros((40, 60), dtype=bool)
    ink[0:20, 40:60] = True  # the preferred top-right corner is drawn on
    x, y = find_free_box(ink, 10, 6, 2, (60, 0))
    assert not ink[y : y + 6, x : x + 10].any()
    assert x + 10 <= 40 or y >= 20


def test_no_clear_paper_means_no_box():
    assert find_free_box(np.ones((40, 60), dtype=bool), 10, 6, 2, (60, 0)) is None


def test_ballooning_only_makes_no_accept_or_reject_claim():
    # A stored result (even a failing one) is not reported while measuring is switched off.
    off = {"measuring": False}
    s = summarise([_dim(10.0), _dim(10.5)], off)
    assert (s.verdict, s.passed, s.failed, s.accepted, s.to_measure) == ("BALLOONED", 0, 0, 2, 0)
    assert stamp_lines(s, "FAIR-7", "02 OCT 2026") == ("BALLOONED", "FAIR-7 · 02 OCT 2026", "2 characteristics · all confirmed")
    assert legend_rows(s) == [("accepted", "Confirmed", 2)]
    draft = summarise([_dim(10.0), _dim(None, status="Draft")], off)
    assert stamp_lines(draft, "", "02 OCT 2026")[0] == "BALLOONING IN PROGRESS"
    assert stamp_lines(draft, "", "02 OCT 2026")[2] == "2 characteristics · 1 not reviewed"
