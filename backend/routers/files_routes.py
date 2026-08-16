import uuid
import asyncio

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response
from pydantic import BaseModel
from typing import Optional

from core import (db, get_current_user, now_iso, put_object, get_object,
                  APP_NAME, log_activity)

router = APIRouter()


@router.post("/files")
async def upload_file(file: UploadFile = File(...), door_id: str = Form(""), job_id: str = Form(""),
                      floor: str = Form(""), user=Depends(get_current_user)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > 25_000_000:
        raise HTTPException(400, "File too large (25MB max)")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/drawings/{uuid.uuid4()}.{ext}"
    result = await asyncio.to_thread(put_object, path, data, file.content_type or "application/octet-stream")
    doc = {"id": str(uuid.uuid4()), "storage_path": result["path"], "original_filename": file.filename,
           "content_type": file.content_type or "application/octet-stream", "size": result["size"],
           "door_id": door_id.strip(), "job_id": job_id.strip(), "floor": floor.strip(),
           "uploaded_by": user["name"], "created_at": now_iso(), "is_deleted": False}
    await db.files.insert_one(doc)
    await log_activity(user["name"], user["role"], "file_uploaded", file.filename,
                       door_id=door_id.strip(), job_id=job_id.strip())
    doc.pop("_id", None)
    return doc


@router.get("/files")
async def list_files(door_id: Optional[str] = None, job_id: Optional[str] = None,
                     floor: Optional[str] = None, user=Depends(get_current_user)):
    q = {"is_deleted": False}
    if door_id:
        q["door_id"] = {"$regex": "^" + door_id.strip() + "$", "$options": "i"}
    if job_id:
        q["job_id"] = job_id
    if floor:
        q["floor"] = {"$regex": floor.strip(), "$options": "i"}
    return await db.files.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.get("/files/summary")
async def files_summary(user=Depends(get_current_user)):
    rows = await db.files.aggregate([
        {"$match": {"is_deleted": False}},
        {"$group": {"_id": "$content_type", "count": {"$sum": 1}, "bytes": {"$sum": "$size"}}},
    ]).to_list(100)
    total = sum(r["count"] for r in rows)
    return {"total": total, "total_bytes": sum(r["bytes"] for r in rows),
            "by_type": [{"content_type": r["_id"], "count": r["count"], "bytes": r["bytes"]} for r in rows]}


@router.get("/files/{file_id}")
async def file_meta(file_id: str, user=Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "File not found")
    return rec


@router.get("/files/{file_id}/download")
async def download_file(file_id: str, user=Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    data, ct = await asyncio.to_thread(get_object, rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type") or ct,
                    headers={"Content-Disposition": f'inline; filename="{rec["original_filename"]}"'})


class FilePatch(BaseModel):
    door_id: Optional[str] = None
    floor: Optional[str] = None
    job_id: Optional[str] = None


@router.patch("/files/{file_id}")
async def update_file(file_id: str, body: FilePatch, user=Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    updates = {}
    for k in ("door_id", "floor", "job_id"):
        v = getattr(body, k)
        if v is not None:
            updates[k] = v.strip()
    if updates:
        await db.files.update_one({"id": file_id}, {"$set": updates})
        await log_activity(user["name"], user["role"], "file_relinked", rec["original_filename"],
                           door_id=updates.get("door_id", ""))
    out = await db.files.find_one({"id": file_id}, {"_id": 0})
    return out


@router.delete("/files/{file_id}")
async def delete_file(file_id: str, user=Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id})
    if not rec:
        raise HTTPException(404, "File not found")
    await db.files.update_one({"id": file_id}, {"$set": {"is_deleted": True}})
    await log_activity(user["name"], user["role"], "file_deleted", rec["original_filename"])
    return {"ok": True}
