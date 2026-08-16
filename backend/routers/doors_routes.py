import uuid

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

from core import (db, require_office, get_current_user, now_iso, blank_stage,
                  DOWNSTREAM, DOOR_FIELDS, log_activity, notify, get_settings, get_door_or_404)

router = APIRouter()

STATUS_FILTERS = {
    "delivered": {"stages.despatch.status": "completed"},
    "in_production": {"stages.despatch.status": {"$ne": "completed"}},
    "qc_failed": {"stages.routing.qc": "fail"},
    "awaiting_despatch": {"stages.routing.qc": "pass", "stages.despatch.status": {"$ne": "completed"}},
}


@router.get("/doors")
async def list_doors(floor: Optional[str] = None, q: Optional[str] = None,
                     job_id: Optional[str] = None, status: Optional[str] = None,
                     user=Depends(get_current_user)):
    query = {}
    if floor:
        query["floor"] = floor
    if job_id:
        query["job_id"] = job_id
    if q:
        query["$or"] = [{"door_id": {"$regex": q.strip(), "$options": "i"}},
                        {"location": {"$regex": q.strip(), "$options": "i"}}]
    if status and status in STATUS_FILTERS:
        query.update(STATUS_FILTERS[status])
    doors = await db.doors.find(query, {"_id": 0}).sort([("floor", 1), ("door_id", 1)]).to_list(3000)
    counts = await db.files.aggregate([
        {"$match": {"is_deleted": False, "door_id": {"$ne": ""}}},
        {"$group": {"_id": {"$toLower": "$door_id"}, "n": {"$sum": 1}}},
    ]).to_list(2000)
    cmap = {c["_id"]: c["n"] for c in counts}
    for d in doors:
        d["attach_count"] = cmap.get(d["door_id"].lower(), 0)
    return doors


@router.get("/doors/floors")
async def list_floors(user=Depends(get_current_user)):
    rows = await db.doors.aggregate([
        {"$group": {"_id": "$floor", "total": {"$sum": 1},
                    "delivered": {"$sum": {"$cond": [{"$eq": ["$stages.despatch.status", "completed"]}, 1, 0]}}}},
        {"$sort": {"_id": 1}},
    ]).to_list(200)
    return [{"floor": r["_id"], "total": r["total"], "delivered": r["delivered"]} for r in rows]


async def find_door(door_id: str):
    door = await get_door_or_404(door_id)
    door.pop("_id", None)
    return door


@router.get("/doors/{door_id}")
async def get_door(door_id: str, user=Depends(get_current_user)):
    door = await find_door(door_id)
    door["attach_count"] = await db.files.count_documents(
        {"door_id": {"$regex": f"^{door['door_id']}$", "$options": "i"}, "is_deleted": False})
    job = await db.jobs.find_one({"id": door["job_id"]}, {"_id": 0, "name": 1, "released": 1})
    door["job_released"] = bool(job and job.get("released"))
    return door


class DoorPatch(BaseModel):
    floor: Optional[str] = None
    location: Optional[str] = None
    updates: Optional[dict] = None


@router.patch("/doors/{door_id}")
async def update_door(door_id: str, body: DoorPatch, user=Depends(require_office)):
    door = await find_door(door_id)
    sets = {}
    if body.floor is not None and body.floor.strip():
        sets["floor"] = body.floor.strip()
    if body.location is not None:
        sets["location"] = body.location.strip()
    for k, v in (body.updates or {}).items():
        if k in DOOR_FIELDS:
            sets[k] = str(v)
    if sets:
        await db.doors.update_one({"id": door["id"]}, {"$set": sets})
        await log_activity(user["name"], user["role"], "door_updated",
                           ", ".join(sets.keys()), door_id=door["door_id"])
    return await find_door(door_id)


@router.delete("/doors/{door_id}")
async def delete_door(door_id: str, user=Depends(require_office)):
    door = await find_door(door_id)
    await db.doors.delete_one({"id": door["id"]})
    await log_activity(user["name"], user["role"], "door_deleted", door["door_id"], door_id=door["door_id"])
    return {"ok": True}


@router.get("/doors/{door_id}/history")
async def door_history(door_id: str, user=Depends(get_current_user)):
    door = await find_door(door_id)
    return await db.activity.find({"door_id": door["door_id"]}, {"_id": 0}).sort("at", -1).to_list(200)


class NoteIn(BaseModel):
    text: str


@router.get("/doors/{door_id}/notes")
async def get_notes(door_id: str, user=Depends(get_current_user)):
    door = await find_door(door_id)
    return door.get("notes", [])


@router.post("/doors/{door_id}/notes")
async def add_note(door_id: str, body: NoteIn, user=Depends(get_current_user)):
    if not body.text.strip():
        raise HTTPException(400, "Note can't be empty")
    door = await find_door(door_id)
    note = {"id": str(uuid.uuid4()), "text": body.text.strip(), "by": user["name"], "at": now_iso()}
    await db.doors.update_one({"id": door["id"]}, {"$push": {"notes": note}})
    await log_activity(user["name"], user["role"], "note_added", body.text.strip()[:120], door_id=door["door_id"])
    return note


@router.delete("/doors/{door_id}/notes/{note_id}")
async def delete_note(door_id: str, note_id: str, user=Depends(get_current_user)):
    door = await find_door(door_id)
    note = next((n for n in door.get("notes", []) if n["id"] == note_id), None)
    if not note:
        raise HTTPException(404, "Note not found")
    if user["role"] != "office" and note["by"] != user["name"]:
        raise HTTPException(403, "You can only delete your own notes")
    await db.doors.update_one({"id": door["id"]}, {"$pull": {"notes": {"id": note_id}}})
    return {"ok": True}


class ReworkIn(BaseModel):
    stations: List[str]
    reason: str


def reset_stages(door, stations):
    reset = set()
    for st in stations:
        if st in DOWNSTREAM:
            reset.add(st)
            reset.update(DOWNSTREAM[st])
    for st in reset:
        stage = blank_stage()
        if st == "assembly":
            stage["photo"] = door["stages"]["assembly"].get("photo")
        if st == "routing":
            stage["qc"] = None
            stage["notes"] = ""
        door["stages"][st] = stage
    return sorted(reset)


@router.post("/doors/{door_id}/rework")
async def rework_door(door_id: str, body: ReworkIn, user=Depends(require_office)):
    if not body.reason.strip():
        raise HTTPException(400, "A reason is required for rework")
    valid = [s for s in body.stations if s in DOWNSTREAM]
    if not valid:
        raise HTTPException(400, "Pick at least one stage to redo")
    door = await find_door(door_id)
    reset = reset_stages(door, valid)
    entry = {"id": str(uuid.uuid4()), "stations": reset, "reason": body.reason.strip(),
             "by": user["name"], "at": now_iso()}
    await db.doors.update_one({"id": door["id"]},
                              {"$set": {"stages": door["stages"]}, "$push": {"rework_log": entry}})
    await log_activity(user["name"], user["role"], "door_rework",
                       f"Redo {', '.join(reset)} — {body.reason.strip()}", door_id=door["door_id"])
    await notify("rework", f"{door['door_id']} sent back for rework",
                 f"{', '.join(reset)} — {body.reason.strip()}", door_id=door["door_id"])
    return await find_door(door_id)


@router.get("/doors/{door_id}/label")
async def door_label(door_id: str, user=Depends(get_current_user)):
    door = await find_door(door_id)
    settings = await get_settings()
    return {"door": door, "footer": settings.get("sticker_footer", ""),
            "company": settings.get("company_name", "MAXX DOORS")}


class PhotoIn(BaseModel):
    photo: str


@router.post("/doors/{door_id}/photo")
async def upload_photo(door_id: str, body: PhotoIn, user=Depends(get_current_user)):
    if len(body.photo) > 6_000_000:
        raise HTTPException(400, "Photo too large")
    door = await find_door(door_id)
    await db.doors.update_one({"id": door["id"]}, {"$set": {"stages.assembly.photo": body.photo or None}})
    action = "photo_uploaded" if body.photo else "photo_cleared"
    await log_activity(user["name"], user["role"], action, "", door_id=door["door_id"], station="assembly")
    return {"ok": True}
