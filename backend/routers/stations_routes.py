from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

from core import (db, get_current_user, require_office, now_iso, blank_stage,
                  STATIONS, PREV, DOWNSTREAM, log_activity, notify, get_door_or_404)

router = APIRouter()


def queue_filter(station: str):
    f = {"stages." + station + ".status": {"$ne": "completed"}}
    if station == "routing":
        f["stages.routing.qc"] = {"$ne": "pass"}
    return f


@router.get("/stations")
async def list_stations(user=Depends(get_current_user)):
    jobs = await db.jobs.find({"released": True}, {"_id": 0, "id": 1}).to_list(500)
    job_ids = [j["id"] for j in jobs]
    out = []
    for st in STATIONS:
        pending = await db.doors.count_documents({"job_id": {"$in": job_ids}, **queue_filter(st)})
        done = await db.doors.count_documents({f"stages.{st}.status": "completed"})
        out.append({"station": st, "pending": pending, "completed": done})
    return out


@router.get("/stations/{station}/queue")
async def station_queue(station: str, floor: Optional[str] = None, user=Depends(get_current_user)):
    if station not in STATIONS:
        raise HTTPException(404, "Unknown station")
    if user["role"] == "operator" and user.get("station") != station:
        raise HTTPException(403, "Wrong station")
    jobs = await db.jobs.find({"released": True}, {"_id": 0, "id": 1}).to_list(500)
    job_ids = [j["id"] for j in jobs]
    query = {"job_id": {"$in": job_ids}, **queue_filter(station)}
    if floor:
        query["floor"] = floor
    doors = await db.doors.find(query, {"_id": 0}).sort([("floor", 1), ("door_id", 1)]).to_list(3000)
    out = []
    for d in doors:
        ready = all(d["stages"][p]["status"] == "completed" for p in (PREV[station] or []))
        out.append({**d, "station_ready": ready})
    return out


@router.get("/stations/{station}/stats")
async def station_stats(station: str, user=Depends(get_current_user)):
    if station not in STATIONS:
        raise HTTPException(404, "Unknown station")
    completed = await db.doors.count_documents({f"stages.{station}.status": "completed"})
    total = await db.doors.count_documents({})
    last = await db.activity.find({"station": station, "action": "stage_completed"},
                                  {"_id": 0}).sort("at", -1).to_list(1)
    return {"station": station, "completed": completed, "total": total,
            "last_activity": last[0] if last else None}


async def complete_one(door_id: str, station: str, user: dict):
    door = await get_door_or_404(door_id)
    door_id = door["door_id"]
    job = await db.jobs.find_one({"id": door["job_id"]})
    if not job or not job.get("released"):
        raise HTTPException(400, "Job not released to factory yet")
    if door["stages"][station]["status"] == "completed":
        door.pop("_id", None)
        return door
    for p in PREV[station] or []:
        if door["stages"][p]["status"] != "completed":
            raise HTTPException(400, f"{door_id}: {p.title()} must be completed first")
    if station == "assembly" and not door["stages"]["assembly"].get("photo"):
        raise HTTPException(400, f"{door_id}: photo must be uploaded before completing assembly")
    door["stages"][station].update({"status": "completed", "by": user["name"], "at": now_iso()})
    await db.doors.update_one({"door_id": door_id}, {"$set": {f"stages.{station}": door["stages"][station]}})
    await log_activity(user["name"], user["role"], "stage_completed", station,
                       door_id=door["door_id"], station=station)
    door.pop("_id", None)
    return door


@router.post("/doors/{door_id}/stations/{station}/complete")
async def complete_station(door_id: str, station: str, user=Depends(get_current_user)):
    if station not in ["core", "skin", "assembly", "press"]:
        raise HTTPException(400, "Use the QC endpoint for routing")
    if user["role"] == "operator" and user.get("station") != station:
        raise HTTPException(403, "Wrong station")
    return await complete_one(door_id, station, user)


@router.post("/doors/{door_id}/stations/{station}/undo")
async def undo_station(door_id: str, station: str, user=Depends(get_current_user)):
    if station not in DOWNSTREAM:
        raise HTTPException(400, "Unknown stage")
    if user["role"] == "operator" and user.get("station") != station:
        raise HTTPException(403, "Wrong station")
    door = await get_door_or_404(door_id)
    for st in [station] + DOWNSTREAM[station]:
        stage = blank_stage()
        if st == "assembly":
            stage["photo"] = door["stages"]["assembly"].get("photo")
        if st == "routing":
            stage["qc"] = None
            stage["notes"] = ""
        door["stages"][st] = stage
    await db.doors.update_one({"id": door["id"]}, {"$set": {"stages": door["stages"]}})
    await log_activity(user["name"], user["role"], "stage_undone", station,
                       door_id=door["door_id"], station=station)
    door.pop("_id", None)
    return door


class BatchIn(BaseModel):
    station: str
    door_ids: List[str]


@router.post("/doors/batch-complete")
async def batch_complete(body: BatchIn, user=Depends(get_current_user)):
    if body.station not in ["core", "skin", "press"]:
        raise HTTPException(400, "Batch complete not supported for this station")
    if user["role"] == "operator" and user.get("station") != body.station:
        raise HTTPException(403, "Wrong station")
    done, errors = [], []
    for did in body.door_ids:
        try:
            await complete_one(did, body.station, user)
            done.append(did)
        except HTTPException as e:
            errors.append(e.detail)
    return {"completed": done, "errors": errors}


class QCIn(BaseModel):
    result: str
    notes: str = ""


@router.post("/doors/{door_id}/routing/qc")
async def routing_qc(door_id: str, body: QCIn, user=Depends(get_current_user)):
    if user["role"] == "operator" and user.get("station") != "routing":
        raise HTTPException(403, "Wrong station")
    if body.result not in ["pass", "fail"]:
        raise HTTPException(400, "Result must be pass or fail")
    if body.result == "fail" and not body.notes.strip():
        raise HTTPException(400, "Notes are required when a door fails QC")
    door = await get_door_or_404(door_id)
    door_id = door["door_id"]
    if door["stages"]["press"]["status"] != "completed":
        raise HTTPException(400, "Press must be completed first")
    st = door["stages"]["routing"]
    st.update({"status": "completed" if body.result == "pass" else "failed",
               "qc": body.result, "notes": body.notes, "by": user["name"], "at": now_iso()})
    await db.doors.update_one({"door_id": door_id}, {"$set": {"stages.routing": st}})
    await log_activity(user["name"], user["role"], "qc_" + body.result, body.notes,
                       door_id=door["door_id"], station="routing")
    if body.result == "fail":
        await notify("qc_fail", f"{door['door_id']} FAILED QC", body.notes, door_id=door["door_id"])
    door["stages"]["routing"] = st
    door.pop("_id", None)
    return door
