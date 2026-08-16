from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from core import (db, get_current_user, require_office, now_iso, STAGE_KEYS,
                  get_settings, DEFAULT_SETTINGS, log_activity)

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "MAXX DOORS production API"}


@router.get("/health")
async def health():
    try:
        await db.command("ping")
        doors = await db.doors.count_documents({})
        return {"ok": True, "db": "up", "doors": doors, "at": now_iso()}
    except Exception as e:
        raise HTTPException(503, f"Database unavailable: {e}")


@router.get("/search")
async def global_search(q: str, user=Depends(get_current_user)):
    term = q.strip()
    if not term:
        return {"doors": [], "jobs": [], "files": []}
    rx = {"$regex": term, "$options": "i"}
    doors = await db.doors.find({"$or": [{"door_id": rx}, {"location": rx}]},
                                {"_id": 0, "door_id": 1, "floor": 1, "location": 1,
                                 "stages.despatch.status": 1}).sort("door_id", 1).to_list(8)
    jobs = await db.jobs.find({"name": rx}, {"_id": 0, "id": 1, "name": 1, "released": 1}).to_list(5)
    files = await db.files.find({"original_filename": rx, "is_deleted": False},
                                {"_id": 0, "id": 1, "original_filename": 1, "floor": 1, "door_id": 1}).to_list(5)
    return {"doors": [{"door_id": d["door_id"], "floor": d["floor"], "location": d["location"],
                       "delivered": d["stages"]["despatch"]["status"] == "completed"} for d in doors],
            "jobs": jobs, "files": files}


# ---------- activity ----------

@router.get("/activity")
async def list_activity(limit: int = 100, action: Optional[str] = None,
                        user=Depends(get_current_user)):
    q = {}
    if action:
        q["action"] = action
    return await db.activity.find(q, {"_id": 0}).sort("at", -1).to_list(min(limit, 300))


@router.get("/activity/door/{door_id}")
async def door_activity(door_id: str, user=Depends(get_current_user)):
    return await db.activity.find({"door_id": {"$regex": f"^{door_id.strip()}$", "$options": "i"}},
                                  {"_id": 0}).sort("at", -1).to_list(200)


# ---------- notifications ----------

@router.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    items = await db.notifications.find({}, {"_id": 0}).sort("at", -1).to_list(30)
    for n in items:
        n["read"] = user["id"] in n.pop("read_by", [])
    unread = sum(1 for n in items if not n["read"])
    return {"items": items, "unread": unread}


@router.post("/notifications/{notif_id}/read")
async def read_notification(notif_id: str, user=Depends(get_current_user)):
    res = await db.notifications.update_one({"id": notif_id}, {"$addToSet": {"read_by": user["id"]}})
    if not res.matched_count:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}


@router.post("/notifications/read-all")
async def read_all_notifications(user=Depends(get_current_user)):
    await db.notifications.update_many({}, {"$addToSet": {"read_by": user["id"]}})
    return {"ok": True}


# ---------- settings ----------

@router.get("/settings")
async def read_settings(user=Depends(get_current_user)):
    return await get_settings()


class SettingsIn(BaseModel):
    company_name: Optional[str] = None
    project_name: Optional[str] = None
    sticker_footer: Optional[str] = None
    qc_notes_required: Optional[bool] = None
    auto_release_imports: Optional[bool] = None
    dashboard_refresh_seconds: Optional[int] = None


@router.put("/settings")
async def update_settings(body: SettingsIn, user=Depends(require_office)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.app_settings.update_one({"id": "app"}, {"$set": updates}, upsert=True)
        await log_activity(user["name"], user["role"], "settings_updated", ", ".join(updates.keys()))
    return await get_settings()


# ---------- labels ----------

@router.get("/labels/floor/{floor}")
async def floor_labels(floor: str, user=Depends(get_current_user)):
    doors = await db.doors.find({"floor": {"$regex": f"^{floor.strip()}$", "$options": "i"}},
                                {"_id": 0}).sort("door_id", 1).to_list(1000)
    settings = await get_settings()
    return {"floor": floor, "count": len(doors), "doors": doors,
            "footer": settings.get("sticker_footer", ""), "company": settings.get("company_name", "MAXX DOORS")}


# ---------- reports ----------

@router.get("/reports/production")
async def production_report(floor: Optional[str] = None, user=Depends(get_current_user)):
    q = {"floor": floor} if floor else {}
    doors = await db.doors.find(q, {"_id": 0}).sort([("floor", 1), ("door_id", 1)]).to_list(3000)
    per_stage = {k: 0 for k in STAGE_KEYS}
    rows = []
    for d in doors:
        stages = {}
        for k in STAGE_KEYS:
            done = d["stages"][k]["status"] == "completed"
            if done:
                per_stage[k] += 1
            stages[k] = {"done": done, "by": d["stages"][k].get("by"), "at": d["stages"][k].get("at")}
        rows.append({"door_id": d["door_id"], "floor": d["floor"], "location": d["location"],
                     "fire_rating": d.get("fire_rating", ""), "stages": stages})
    return {"generated_at": now_iso(), "floor": floor or "ALL", "total": len(doors),
            "per_stage": per_stage, "doors": rows}


@router.get("/reports/job/{job_id}")
async def job_report(job_id: str, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    doors = await db.doors.find({"job_id": job_id}, {"_id": 0}).sort("door_id", 1).to_list(2000)
    per_stage = {k: sum(1 for d in doors if d["stages"][k]["status"] == "completed") for k in STAGE_KEYS}
    return {"generated_at": now_iso(), "job": job, "total": len(doors),
            "per_stage": per_stage, "doors": doors}


@router.get("/reports/despatch")
async def despatch_report(floor: Optional[str] = None, user=Depends(get_current_user)):
    q = {"stages.despatch.status": "completed"}
    if floor:
        q["floor"] = floor
    doors = await db.doors.find(q, {"_id": 0}).sort("stages.despatch.at", -1).to_list(2000)
    return {"generated_at": now_iso(), "floor": floor or "ALL", "total": len(doors),
            "doors": [{"door_id": d["door_id"], "floor": d["floor"], "location": d["location"],
                       "by": d["stages"]["despatch"]["by"], "at": d["stages"]["despatch"]["at"]} for d in doors]}
