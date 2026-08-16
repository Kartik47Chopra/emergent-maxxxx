from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List

from core import db, get_current_user, require_office, now_iso, log_activity, notify, get_door_or_404

router = APIRouter()


async def despatch_one(door_id: str, user: dict):
    door = await get_door_or_404(door_id)
    door_id = door["door_id"]
    if not (door["stages"]["routing"]["status"] == "completed" and door["stages"]["routing"].get("qc") == "pass"):
        raise HTTPException(400, f"{door_id} must pass QC before despatch")
    door["stages"]["despatch"].update({"status": "completed", "by": user["name"], "at": now_iso()})
    await db.doors.update_one({"door_id": door_id}, {"$set": {"stages.despatch": door["stages"]["despatch"]}})
    await log_activity(user["name"], user["role"], "despatched", "", door_id=door["door_id"], station="despatch")
    door.pop("_id", None)
    return door


@router.post("/doors/{door_id}/despatch")
async def despatch_door(door_id: str, user=Depends(require_office)):
    return await despatch_one(door_id, user)


class DespatchBatchIn(BaseModel):
    door_ids: List[str]


@router.post("/despatch/batch")
async def despatch_batch(body: DespatchBatchIn, user=Depends(require_office)):
    done, errors = [], []
    for did in body.door_ids:
        try:
            await despatch_one(did, user)
            done.append(did)
        except HTTPException as e:
            errors.append(e.detail)
    if done:
        await notify("despatch", f"{len(done)} door(s) despatched", ", ".join(done[:10]))
    return {"completed": done, "errors": errors}


@router.get("/despatch-note")
async def despatch_note(floor: str, user=Depends(get_current_user)):
    doors = await db.doors.find(
        {"floor": floor, "stages.routing.qc": "pass", "stages.despatch.status": {"$ne": "completed"}},
        {"_id": 0}).sort("door_id", 1).to_list(1000)
    return {"floor": floor, "generated_at": now_iso(), "doors": doors}


@router.get("/despatch/manifest")
async def despatch_manifest(user=Depends(get_current_user)):
    doors = await db.doors.find(
        {"stages.routing.qc": "pass", "stages.despatch.status": {"$ne": "completed"}},
        {"_id": 0, "door_id": 1, "floor": 1, "location": 1, "leaf_height": 1,
         "leaf_width_1": 1, "fire_rating": 1, "job_name": 1}).sort([("floor", 1), ("door_id", 1)]).to_list(2000)
    by_floor = {}
    for d in doors:
        by_floor.setdefault(d["floor"], []).append(d)
    return {"generated_at": now_iso(), "total_ready": len(doors),
            "floors": [{"floor": f, "doors": ds} for f, ds in sorted(by_floor.items())]}


@router.get("/despatch/history")
async def despatch_history(user=Depends(get_current_user)):
    doors = await db.doors.find(
        {"stages.despatch.status": "completed"},
        {"_id": 0, "door_id": 1, "floor": 1, "location": 1, "job_name": 1,
         "stages.despatch": 1}).sort("stages.despatch.at", -1).to_list(2000)
    return [{"door_id": d["door_id"], "floor": d["floor"], "location": d["location"],
             "job_name": d.get("job_name", ""), "by": d["stages"]["despatch"]["by"],
             "at": d["stages"]["despatch"]["at"]} for d in doors]
