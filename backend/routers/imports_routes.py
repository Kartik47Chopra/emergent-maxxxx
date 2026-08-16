import uuid
import asyncio
import re

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import List, Dict

from core import db, require_office, now_iso, log_activity
from importer import parse_workbook, merge_doors, run_import, run_drive_import, create_jobs_from_records

router = APIRouter()


@router.post("/import/preview")
async def import_preview(files: List[UploadFile] = File(...), user=Depends(require_office)):
    parsed_list, sources, errors = [], [], []
    for f in files:
        if not (f.filename or "").lower().endswith((".xlsx", ".xlsm", ".xls")):
            continue
        data = await f.read()
        try:
            parsed_list.append(await asyncio.to_thread(parse_workbook, data, f.filename or "import.xlsx"))
            sources.append(f.filename)
        except Exception as e:
            errors.append(f"{f.filename}: {e}")
    records = merge_doors(parsed_list)
    if not records:
        raise HTTPException(400, "No door rows found. " + "; ".join(errors))
    job_name = parsed_list[0]["job_name"] if parsed_list else "Imported Job"
    doors = []
    for r in records:
        d = {k: v for k, v in r.items() if not k.startswith("_")}
        d["extras"] = r.get("_extras", {})
        doors.append(d)
    return {"job_name": job_name, "sources": sources, "count": len(doors),
            "doors": doors, "warnings": errors}


class ImportConfirm(BaseModel):
    name: str
    client: str = ""
    doors: List[Dict]


@router.post("/import/confirm")
async def import_confirm(body: ImportConfirm, user=Depends(require_office)):
    if not body.doors:
        raise HTTPException(400, "No doors to import")
    records = []
    for d in body.doors:
        if not d.get("door_id"):
            continue
        rec = {k: str(v) for k, v in d.items() if k not in ("extras",) and v is not None and not isinstance(v, (dict, list))}
        rec["_extras"] = d.get("extras", {}) or {}
        rec["_job_name"] = body.name.strip()
        records.append(rec)
    created, skipped = await create_jobs_from_records(records, user, released=False)
    if not created:
        raise HTTPException(400, "All of those Door IDs already exist: " + ", ".join(skipped[:20]))
    return {"jobs": created, "skipped_door_ids": skipped,
            "door_count": sum(j["door_count"] for j in created)}


@router.post("/import/run")
async def import_run_upload(files: List[UploadFile] = File(...), user=Depends(require_office)):
    named = []
    for f in files:
        data = await f.read()
        if data:
            named.append((f.filename or "file", data))
    if not named:
        raise HTTPException(400, "No files received")
    run = await run_import(named, user, "upload")
    await log_activity(user["name"], user["role"], "import_run",
                       f"{run['doors_imported']} doors, {len(run['jobs_created'])} jobs")
    return run


class DriveImportIn(BaseModel):
    url: str


@router.post("/import/drive")
async def import_drive(body: DriveImportIn, user=Depends(require_office)):
    url = body.url.strip()
    if not re.search(r"drive\.google\.com", url):
        raise HTTPException(400, "That doesn't look like a Google Drive link")
    run_id = str(uuid.uuid4())
    await db.import_runs.insert_one({
        "id": run_id, "source": "google_drive", "status": "queued", "by": user["name"],
        "url": url, "files": [], "jobs_created": [], "doors_imported": 0,
        "skipped_door_ids": [], "attachments": [], "errors": [],
        "started_at": now_iso(), "finished_at": None})
    asyncio.create_task(run_drive_import(run_id, url, dict(user)))
    await log_activity(user["name"], user["role"], "drive_import_started", url)
    return {"run_id": run_id, "status": "queued"}


@router.get("/import/runs")
async def list_runs(user=Depends(require_office)):
    return await db.import_runs.find({}, {"_id": 0}).sort("started_at", -1).to_list(50)


@router.get("/import/runs/{run_id}")
async def get_run(run_id: str, user=Depends(require_office)):
    run = await db.import_runs.find_one({"id": run_id}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Import run not found")
    return run


@router.delete("/import/runs/{run_id}")
async def delete_run(run_id: str, user=Depends(require_office)):
    res = await db.import_runs.delete_one({"id": run_id})
    if not res.deleted_count:
        raise HTTPException(404, "Import run not found")
    return {"ok": True}
