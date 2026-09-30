"""
Library API: parts, drawing revisions, inspections and their characteristics.
"""
from __future__ import annotations

import hashlib
import io
import re
from typing import Any

import pdfplumber
from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db import Characteristic, DrawingRevision, Inspection, Part, get_session

router = APIRouter(prefix="/api", tags=["library"])


# ── Serialisers ──────────────────────────────────────────────────────────────

def _inspection_summary(i: Inspection) -> dict[str, Any]:
    chars = i.characteristics
    measured = sum(1 for c in chars if (c.record or {}).get("result") not in (None, ""))
    return {
        "id": i.id,
        "revisionId": i.revision_id,
        "title": i.title,
        "fairNumber": i.fair_number,
        "status": i.status,
        "characteristics": len(chars),
        "measured": measured,
        "createdAt": i.created_at.isoformat(),
        "updatedAt": i.updated_at.isoformat(),
    }


def _revision_summary(r: DrawingRevision) -> dict[str, Any]:
    return {
        "id": r.id,
        "partId": r.part_id,
        "revision": r.revision,
        "fileName": r.file_name,
        "sha256": r.sha256,
        "pageSizes": r.page_sizes,
        "sheets": len(r.page_sizes or []),
        "importedAt": r.imported_at.isoformat(),
        "inspections": [_inspection_summary(i) for i in r.inspections],
    }


def _part_summary(p: Part) -> dict[str, Any]:
    return {
        "id": p.id,
        "partNumber": p.part_number,
        "partName": p.part_name,
        "createdAt": p.created_at.isoformat(),
        "revisions": [_revision_summary(r) for r in p.revisions],
    }


def _page_sizes(pdf_bytes: bytes) -> list[dict[str, float]]:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return [{"width": float(p.width), "height": float(p.height)} for p in pdf.pages]


def _guess_part_number(file_name: str) -> str:
    """'01270007-01_heat-sink-plate.pdf' -> '01270007-01'. Falls back to the whole stem."""
    stem = re.sub(r"\.pdf$", "", file_name, flags=re.I).strip()
    head = re.split(r"[\s_]+", stem, maxsplit=1)[0]
    if re.search(r"\d", head) and len(head) >= 3:
        return head[:120]
    return stem[:120]


# ── Parts ────────────────────────────────────────────────────────────────────

@router.get("/parts")
def list_parts() -> list[dict[str, Any]]:
    with get_session() as s:
        parts = s.scalars(
            select(Part).options(selectinload(Part.revisions).selectinload(DrawingRevision.inspections).selectinload(Inspection.characteristics)).order_by(Part.created_at.desc())
        ).all()
        return [_part_summary(p) for p in parts]


class PartIn(BaseModel):
    partNumber: str
    partName: str = ""


@router.post("/parts", status_code=201)
def create_part(body: PartIn) -> dict[str, Any]:
    with get_session() as s:
        existing = s.scalar(select(Part).where(Part.part_number == body.partNumber.strip()))
        if existing:
            raise HTTPException(409, f"Part {body.partNumber} already exists")
        p = Part(part_number=body.partNumber.strip(), part_name=body.partName.strip())
        s.add(p)
        s.commit()
        s.refresh(p)
        return {"id": p.id, "partNumber": p.part_number, "partName": p.part_name, "createdAt": p.created_at.isoformat(), "revisions": []}


@router.delete("/parts/{part_id}", status_code=204)
def delete_part(part_id: str) -> Response:
    with get_session() as s:
        p = s.get(Part, part_id)
        if not p:
            raise HTTPException(404, "Part not found")
        s.delete(p)
        s.commit()
    return Response(status_code=204)


# ── Revisions ────────────────────────────────────────────────────────────────

@router.post("/revisions", status_code=201)
async def import_revision(
    file: UploadFile = File(...),
    partId: str | None = Form(None),
    partNumber: str | None = Form(None),
    partName: str | None = Form(None),
    revision: str = Form(""),
) -> dict[str, Any]:
    """Upload a PDF as a new revision. Creates the part when only a part number is given."""
    pdf_bytes = await file.read()
    if not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(400, "File does not appear to be a valid PDF")
    file_name = file.filename or "drawing.pdf"
    try:
        sizes = _page_sizes(pdf_bytes)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Could not read PDF: {exc}") from exc

    with get_session() as s:
        part: Part | None = None
        if partId:
            part = s.get(Part, partId)
            if not part:
                raise HTTPException(404, "Part not found")
        else:
            number = (partNumber or _guess_part_number(file_name)).strip()
            part = s.scalar(select(Part).where(Part.part_number == number))
            if not part:
                part = Part(part_number=number, part_name=(partName or "").strip())
                s.add(part)
                s.flush()
            elif partName and not part.part_name:
                part.part_name = partName.strip()

        rev = DrawingRevision(
            part_id=part.id,
            revision=revision.strip() or f"{len(part.revisions) + 1:02d}",
            file_name=file_name,
            sha256=hashlib.sha256(pdf_bytes).hexdigest(),
            pdf=pdf_bytes,
            page_sizes=sizes,
        )
        s.add(rev)
        s.commit()
        s.refresh(rev)
        return {**_revision_summary(rev), "partNumber": part.part_number, "partName": part.part_name}


@router.get("/revisions/{revision_id}/pdf")
def revision_pdf(revision_id: str) -> Response:
    with get_session() as s:
        r = s.get(DrawingRevision, revision_id)
        if not r:
            raise HTTPException(404, "Revision not found")
        return Response(content=r.pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{r.file_name}"'})


@router.delete("/revisions/{revision_id}", status_code=204)
def delete_revision(revision_id: str) -> Response:
    with get_session() as s:
        r = s.get(DrawingRevision, revision_id)
        if not r:
            raise HTTPException(404, "Revision not found")
        s.delete(r)
        s.commit()
    return Response(status_code=204)


# ── Inspections ──────────────────────────────────────────────────────────────

class InspectionIn(BaseModel):
    title: str = "Full FAI"
    fairNumber: str = ""


class InspectionSave(BaseModel):
    title: str | None = None
    fairNumber: str | None = None
    status: str | None = None
    partInfo: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    productAccountability: list[dict[str, Any]] | None = None
    characteristics: list[dict[str, Any]] | None = None


@router.post("/revisions/{revision_id}/inspections", status_code=201)
def create_inspection(revision_id: str, body: InspectionIn) -> dict[str, Any]:
    with get_session() as s:
        r = s.get(DrawingRevision, revision_id)
        if not r:
            raise HTTPException(404, "Revision not found")
        i = Inspection(revision_id=revision_id, title=body.title, fair_number=body.fairNumber)
        s.add(i)
        s.commit()
        s.refresh(i)
        return _inspection_summary(i)


@router.get("/inspections/{inspection_id}")
def get_inspection(inspection_id: str) -> dict[str, Any]:
    with get_session() as s:
        i = s.get(Inspection, inspection_id, options=[selectinload(Inspection.characteristics), selectinload(Inspection.revision).selectinload(DrawingRevision.part)])
        if not i:
            raise HTTPException(404, "Inspection not found")
        r = i.revision
        return {
            **_inspection_summary(i),
            "partInfo": i.part_info,
            "settings": i.settings,
            "productAccountability": i.product_accountability or [],
            "characteristics": [c.record for c in i.characteristics],
            "revision": {**_revision_summary(r), "inspections": []},
            "part": {"id": r.part.id, "partNumber": r.part.part_number, "partName": r.part.part_name},
        }


@router.put("/inspections/{inspection_id}")
def save_inspection(inspection_id: str, body: InspectionSave) -> dict[str, Any]:
    """Autosave. Characteristics are replaced as a set so deletes and renumbering are honoured."""
    with get_session() as s:
        i = s.get(Inspection, inspection_id, options=[selectinload(Inspection.characteristics)])
        if not i:
            raise HTTPException(404, "Inspection not found")
        if body.title is not None:
            i.title = body.title
        if body.fairNumber is not None:
            i.fair_number = body.fairNumber
        if body.status is not None:
            i.status = body.status
        if body.partInfo is not None:
            i.part_info = body.partInfo
            if not body.fairNumber and body.partInfo.get("fairNumber"):
                i.fair_number = str(body.partInfo["fairNumber"])
        if body.settings is not None:
            i.settings = body.settings
        if body.productAccountability is not None:
            i.product_accountability = body.productAccountability
        if body.characteristics is not None:
            i.characteristics.clear()
            s.flush()
            for rec in body.characteristics:
                s.add(
                    Characteristic(
                        id=str(rec.get("id")),
                        inspection_id=i.id,
                        balloon_number=int(rec.get("balloonNumber") or 0),
                        sub_number=rec.get("subNumber"),
                        status=str(rec.get("status") or "Draft"),
                        record=rec,
                    )
                )
        s.commit()
        s.refresh(i)
        return _inspection_summary(i)


@router.delete("/inspections/{inspection_id}", status_code=204)
def delete_inspection(inspection_id: str) -> Response:
    with get_session() as s:
        i = s.get(Inspection, inspection_id)
        if not i:
            raise HTTPException(404, "Inspection not found")
        s.delete(i)
        s.commit()
    return Response(status_code=204)
