"""
Assist API: ask a vision model to read one region of a sheet.

Rules this router enforces:
  - off unless configured; the status call says why
  - only a crop is sent, never the whole sheet, and only after the caller states consent for that crop
  - every send is recorded (who-less for the demo build: what, when, which model, the crop's fingerprint)
  - the answer comes back as a suggestion; nothing is written to the inspection here
"""
from __future__ import annotations

import hashlib
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from assist.config import settings
from assist.provider import AssistError, provider_for
from assist.regions import candidates, crop_png
from assist.tasks import PROMPTS, parse_answer
from assist.verify import cad_text, ocr_available, ocr_text, verify
from db import AssistLog, DrawingRevision, get_session

router = APIRouter(prefix="/api", tags=["assist"])

MAX_REGION_SHARE = 0.4  # of the sheet: a larger window is the drawing itself, not a table or a title block


class Region(BaseModel):
    x: float
    y: float
    w: float = Field(gt=0)
    h: float = Field(gt=0)


class ReadRequest(BaseModel):
    page: int = Field(ge=0)
    region: Region
    task: Literal["tolerance_table", "title_block"]
    consent: bool = False  # the person confirmed this crop may leave the machine


def _pdf(revision_id: str) -> tuple[bytes, list[dict[str, float]]]:
    with get_session() as s:
        rev = s.get(DrawingRevision, revision_id)
        if not rev:
            raise HTTPException(404, "Revision not found")
        return rev.pdf, rev.page_sizes or []


@router.get("/assist/status")
def assist_status() -> dict[str, Any]:
    return {**settings().public(), "ocr": ocr_available()}


@router.get("/revisions/{revision_id}/assist/candidates")
def assist_candidates(revision_id: str, page: int = Query(0, ge=0)) -> list[dict[str, Any]]:
    pdf_bytes, _ = _pdf(revision_id)
    return candidates(pdf_bytes, page)


@router.get("/revisions/{revision_id}/assist/crop")
def assist_crop(revision_id: str, page: int = Query(0, ge=0), x: float = 0, y: float = 0, w: float = Query(..., gt=0), h: float = Query(..., gt=0)) -> Response:
    """Exactly the picture that a read would send, for the person to look at first. Stays on this machine."""
    pdf_bytes, _ = _pdf(revision_id)
    try:
        png = crop_png(pdf_bytes, page, {"x": x, "y": y, "w": w, "h": h})
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "no-store"})


@router.post("/revisions/{revision_id}/assist/read")
def assist_read(revision_id: str, body: ReadRequest) -> dict[str, Any]:
    cfg = settings()
    if not cfg.enabled:
        raise HTTPException(503, f"Assist is off. {cfg.reason}")
    if not body.consent:
        raise HTTPException(403, "Confirm that this crop may be sent before it leaves this machine")
    pdf_bytes, sizes = _pdf(revision_id)
    if body.page >= len(sizes):
        raise HTTPException(400, "No such sheet")
    sheet = sizes[body.page]
    if body.region.w * body.region.h > MAX_REGION_SHARE * sheet["width"] * sheet["height"]:
        raise HTTPException(400, "The region is too large. Select only the table or the title block.")
    try:
        png = crop_png(pdf_bytes, body.page, body.region.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    digest = hashlib.sha256(png).hexdigest()

    outcome, fields, raw_error = "ok", {}, ""
    try:
        fields = parse_answer(body.task, provider_for(cfg).read(png, PROMPTS[body.task]))
    except AssistError as exc:
        outcome, raw_error = "failed", str(exc)
    with get_session() as s:
        s.add(AssistLog(revision_id=revision_id, page=body.page, region=body.region.model_dump(), task=body.task, provider=cfg.provider,
                        model=cfg.model, crop_sha256=digest, crop_bytes=len(png), outcome=outcome))
        s.commit()
    if outcome != "ok":
        raise HTTPException(502, raw_error)
    # Second readers, both local: the PDF's own text in the region, and OCR of the same crop.
    readers = {"cad": cad_text(pdf_bytes, body.page, body.region.model_dump())}
    seen = ocr_text(png)
    if seen is not None:
        readers["ocr"] = seen
    return {"task": body.task, "fields": fields, "checks": verify(body.task, fields, readers), "readers": {"cad": bool(readers["cad"].strip()), "ocr": seen is not None},
            "provider": cfg.provider, "model": cfg.model, "cropSha256": digest, "sentBytes": len(png)}
