import uuid

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

from core import (db, require_office, get_current_user, now_iso, make_door,
                  STAGE_KEYS, log_activity, notify)

router = APIRouter()


class DoorIn(BaseModel):
    floor: str
    location: str
    door_id: str
    door_type: str = ""
    qty: int = 1
    internal_door: str = ""
    leaf_height: str = ""
    leaf_width_1: str = ""
    leaf_width_2: str = ""
    panel_thickness: str = ""
    actual_thickness: str = ""
    leaf_type: str = "Single"
    panel_finish: str = ""
    fire_rating: str = ""
    core_qty: int = 1
    core_type: str = ""
    core_cutting: str = ""
    skin_qty: int = 2
    skin_type: str = ""
    skin_cutting: str = ""


class JobIn(BaseModel):
    name: str
    client: str = ""
    doors: List[DoorIn] = []


async def job_progress(job_id: str):
    doors = await db.doors.find({"job_id": job_id}, {"_id": 0, "stages": 1}).to_list(2000)
    total = len(doors)
    per_stage = {k: 0 for k in STAGE_KEYS}
    for d in doors:
        for k in STAGE_KEYS:
            if d["stages"][k]["status"] == "completed":
                per_stage[k] += 1
    done_units = sum(per_stage.values())
    percent = round(100 * done_units / (total * len(STAGE_KEYS))) if total else 0
    return {"total_doors": total, "per_stage": per_stage, "percent": percent,
            "delivered": per_stage["despatch"]}


@router.get("/jobs")
async def list_jobs(user=Depends(get_current_user)):
    jobs = await db.jobs.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    for j in jobs:
        prog = await job_progress(j["id"])
        j["door_count"] = prog["total_doors"]
        j["progress"] = prog
    return jobs


@router.post("/jobs")
async def create_job(body: JobIn, user=Depends(require_office)):
    job = {"id": str(uuid.uuid4()), "name": body.name, "client": body.client,
           "released": False, "created_at": now_iso()}
    ids = [d.door_id.strip() for d in body.doors]
    if len(ids) != len(set(ids)):
        raise HTTPException(400, "Duplicate Door IDs in this job")
    existing = await db.doors.find({"door_id": {"$in": ids}}, {"_id": 0, "door_id": 1}).to_list(1000)
    if existing:
        raise HTTPException(400, "Door IDs already exist: " + ", ".join(e["door_id"] for e in existing))
    await db.jobs.insert_one(job)
    for d in body.doors:
        data = d.model_dump()
        door = make_door(job["id"], job["name"], data.pop("floor"), data.pop("door_id"),
                         data.pop("location"), **data)
        await db.doors.insert_one(door)
    await log_activity(user["name"], user["role"], "job_created", f"{job['name']} — {len(ids)} doors", job_id=job["id"])
    job["door_count"] = len(body.doors)
    job.pop("_id", None)
    return job


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    prog = await job_progress(job_id)
    job["door_count"] = prog["total_doors"]
    job["progress"] = prog
    return job


class JobPatch(BaseModel):
    name: Optional[str] = None
    client: Optional[str] = None


@router.patch("/jobs/{job_id}")
async def update_job(job_id: str, body: JobPatch, user=Depends(require_office)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    updates = {}
    if body.name is not None and body.name.strip():
        updates["name"] = body.name.strip()
    if body.client is not None:
        updates["client"] = body.client.strip()
    if updates:
        await db.jobs.update_one({"id": job_id}, {"$set": updates})
        if "name" in updates:
            await db.doors.update_many({"job_id": job_id}, {"$set": {"job_name": updates["name"]}})
        await log_activity(user["name"], user["role"], "job_updated", updates.get("name", job["name"]), job_id=job_id)
    out = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    return out


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, user=Depends(require_office)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    n = await db.doors.count_documents({"job_id": job_id})
    await db.doors.delete_many({"job_id": job_id})
    await db.jobs.delete_one({"id": job_id})
    await log_activity(user["name"], user["role"], "job_deleted", f"{job['name']} — {n} doors removed", job_id=job_id)
    return {"ok": True, "doors_removed": n}


@router.post("/jobs/{job_id}/release")
async def release_job(job_id: str, user=Depends(require_office)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    await db.jobs.update_one({"id": job_id}, {"$set": {"released": True, "released_at": now_iso()}})
    await log_activity(user["name"], user["role"], "job_released", job["name"], job_id=job_id)
    await notify("release", f"{job['name']} released to the factory floor", "", job_id=job_id)
    return {"ok": True}


@router.post("/jobs/{job_id}/unrelease")
async def unrelease_job(job_id: str, user=Depends(require_office)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    await db.jobs.update_one({"id": job_id}, {"$set": {"released": False}})
    await log_activity(user["name"], user["role"], "job_unreleased", job["name"], job_id=job_id)
    return {"ok": True}


@router.get("/jobs/{job_id}/doors")
async def job_doors(job_id: str, user=Depends(get_current_user)):
    return await db.doors.find({"job_id": job_id}, {"_id": 0}).sort("door_id", 1).to_list(2000)


@router.get("/jobs/{job_id}/progress")
async def get_job_progress(job_id: str, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0, "name": 1})
    if not job:
        raise HTTPException(404, "Job not found")
    return {"job_id": job_id, "name": job["name"], **(await job_progress(job_id))}


@router.post("/floors/{floor}/release")
async def release_floor(floor: str, user=Depends(require_office)):
    job_ids = await db.doors.distinct("job_id", {"floor": {"$regex": f"^{floor.strip()}$", "$options": "i"}})
    if not job_ids:
        raise HTTPException(404, "No jobs found for that floor")
    await db.jobs.update_many({"id": {"$in": job_ids}}, {"$set": {"released": True, "released_at": now_iso()}})
    await log_activity(user["name"], user["role"], "floor_released", floor)
    return {"ok": True, "jobs_released": len(job_ids)}
