"""A model's value counts as confirmed only when a second reader has the same characters."""
from __future__ import annotations

from assist.verify import check_numbers, check_text, standard_class, verify

OCR = "PARTNUMBER : 18 1120 001\nSCALE:NTS\n:SWINGARMSUPPBKTLH\nHR1\nIS1079\nPLEASEREFER THINOX STANDARD\nFORUNSPECIFIEDTOLERANCE"


def test_same_characters_agree_whatever_the_spacing():
    assert check_text("18_1120_001", {"ocr": OCR})["status"] == "agree"
    assert check_text("SWING_ARM_SUPP_BKT_LH", {"ocr": OCR})["status"] == "agree"
    assert check_text("IS 1079", {"ocr": OCR}) == {"status": "agree", "reader": "ocr", "seen": ""}


def test_one_wrong_digit_is_caught_and_both_readings_are_shown():
    out = check_text("18_1120_007", {"ocr": OCR})
    assert out["status"] == "differs" and out["seen"] == "181120001"


def test_o_and_zero_are_not_folded_together():
    assert check_text("PLEASE REFER THINQX STANDARD", {"ocr": OCR})["status"] == "differs"


def test_text_nobody_else_saw_stays_unconfirmed():
    assert check_text("TITANIUM GRADE 5", {"ocr": OCR})["status"] == "single"
    assert check_text("A3", {"ocr": "SHEET:A3"})["status"] == "single"  # too short to mean anything
    assert check_text("18_1120_001", {})["status"] == "single"


def test_cad_text_counts_as_a_reader():
    assert check_text("ISO 2768-m", {"cad": "General tolerance ISO 2768-m", "ocr": ""})["reader"] == "cad"


def test_numbers_must_all_be_printed():
    assert check_numbers([30, 120, 0.3], {"ocr": "OVER 30 UPTO 120 ±0.3"})["status"] == "agree"
    assert check_numbers([30, 120, 0.8], {"ocr": "OVER 30 UPTO 120 ±0.3"})["status"] == "single"


def test_rows_from_the_published_table_name_their_class():
    assert standard_class([[30, 120, 0.3], [120, 400, 0.5]]) == "m"
    assert standard_class([[30, 120, 0.31]]) == ""


def test_verify_checks_every_value_returned():
    fields = {"found": True, "partNumber": "18_1120_001", "material": "HR1", "revision": "", "units": "mm"}
    checks = verify("title_block", fields, {"ocr": OCR})
    assert set(checks) == {"partNumber", "material"} and all(c["status"] == "agree" for c in checks.values())
