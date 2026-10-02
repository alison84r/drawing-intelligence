"""
Export an inspection as a zip: AS9102 workbook, PPAP workbook, ballooned PDF.
"""
from __future__ import annotations

import io
import re
import zipfile
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import selectinload

from db import DrawingRevision, Inspection, get_session
from export.as9102 import build_as9102_workbook
from export.ballooned_pdf import build_ballooned_pdf
from export.characteristics import derive_limits, display_status
from export.stamp import is_measuring, without_results
from export.ppap import build_ppap_workbook

router = APIRouter(prefix="/api", tags=["export"])


class ExportRequest(BaseModel):
    as9102: bool = True
    ppap: bool = True
    pdf: bool = True
    includeReference: bool = False
    includeDraft: bool = True
    stamp: bool = True  # status stamp and legend on the ballooned drawing


def _safe(name: str) -> str:
    return re.sub(r"[^\w.-]+", "_", name).strip("_") or "inspection"


@router.post("/inspections/{inspection_id}/export")
def export_inspection(inspection_id: str, body: ExportRequest) -> Response:
    with get_session() as s:
        i = s.get(Inspection, inspection_id, options=[selectinload(Inspection.characteristics), selectinload(Inspection.revision).selectinload(DrawingRevision.part)])
        if not i:
            raise HTTPException(404, "Inspection not found")
        rev = i.revision
        # Part Info wins where filled in; the library record fills the gaps.
        info: dict[str, Any] = {"partNumber": rev.part.part_number, "partName": rev.part.part_name, "drawingRevision": rev.revision}
        info.update({k: v for k, v in (i.part_info or {}).items() if v not in (None, "")})
        if not info.get("fairNumber") and i.fair_number:
            info["fairNumber"] = i.fair_number
        settings = i.settings or {}
        defaults = settings.get("defaults") or {}
        chars = [c.record for c in i.characteristics]
        if not is_measuring(defaults):
            chars = without_results(chars)  # ballooning only: the forms go out with an empty Results column
        pdf_bytes = rev.pdf
        product_rows = i.product_accountability or []

    if not body.includeReference:
        chars = [c for c in chars if c.get("toleranceType") not in ("Reference", "Basic")]
    if not body.includeDraft:
        chars = [c for c in chars if display_status(c, derive_limits(c, defaults)) != "Draft"]

    base = _safe(f"{info.get('partNumber') or 'part'}_Rev{info.get('drawingRevision') or 'X'}_{i.title}")
    files: list[tuple[str, bytes]] = []
    if body.as9102:
        files.append((f"{base}_AS9102.xlsx", build_as9102_workbook(info, chars, product_rows, defaults)))
    if body.ppap:
        files.append((f"{base}_PPAP_Dimensional_Results.xlsx", build_ppap_workbook(info, chars, defaults)))
    if body.pdf:
        stamp = f"{info.get('partNumber', '')} Rev {info.get('drawingRevision', '')} · {len(chars)} characteristics · Drawing Intelligence by DataVers.AI"
        files.append((f"{base}_ballooned.pdf", build_ballooned_pdf(pdf_bytes, chars, settings, stamp, {"fairNumber": info.get("fairNumber", "")} if body.stamp else None)))
    if not files:
        raise HTTPException(400, "Nothing selected to export")

    if len(files) == 1:
        name, data = files[0]
        media = "application/pdf" if name.endswith(".pdf") else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        return Response(content=data, media_type=media, headers={"Content-Disposition": f'attachment; filename="{name}"'})

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files:
            z.writestr(name, data)
    return Response(content=buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{base}_FAI.zip"'})
