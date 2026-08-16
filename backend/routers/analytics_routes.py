from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from core import db, get_current_user, STATIONS, STAGE_KEYS

router = APIRouter()


@router.get("/stats")
async def stats(user=Depends(get_current_user)):
    total = await db.doors.count_documents({})
    delivered = await db.doors.count_documents({"stages.despatch.status": "completed"})
    failed = await db.doors.count_documents({"stages.routing.qc": "fail"})
    awaiting_despatch = await db.doors.count_documents(
        {"stages.routing.qc": "pass", "stages.despatch.status": {"$ne": "completed"}})
    return {"total": total, "delivered": delivered, "in_production": total - delivered,
            "qc_failed": failed, "awaiting_despatch": awaiting_despatch}


@router.get("/analytics/overview")
async def analytics_overview(user=Depends(get_current_user)):
    total = await db.doors.count_documents({})
    per_stage = {}
    for k in STAGE_KEYS:
        per_stage[k] = await db.doors.count_documents({f"stages.{k}.status": "completed"})
    jobs_total = await db.jobs.count_documents({})
    jobs_released = await db.jobs.count_documents({"released": True})
    files_total = await db.files.count_documents({"is_deleted": False})
    done_units = sum(per_stage.values())
    percent = round(100 * done_units / (total * len(STAGE_KEYS))) if total else 0
    return {"total_doors": total, "per_stage": per_stage, "overall_percent": percent,
            "jobs_total": jobs_total, "jobs_released": jobs_released, "files_total": files_total}


@router.get("/analytics/stations")
async def analytics_stations(user=Depends(get_current_user)):
    out = []
    for st in STATIONS:
        completed = await db.doors.count_documents({f"stages.{st}.status": "completed"})
        pending = await db.doors.count_documents({f"stages.{st}.status": {"$ne": "completed"}})
        last = await db.activity.find({"station": st, "action": "stage_completed"},
                                      {"_id": 0, "at": 1, "user": 1, "door_id": 1}).sort("at", -1).to_list(1)
        out.append({"station": st, "completed": completed, "pending": pending,
                    "last_activity": last[0] if last else None})
    return out


@router.get("/analytics/floors")
async def analytics_floors(user=Depends(get_current_user)):
    floors = await db.doors.distinct("floor")
    out = []
    for f in sorted(floors):
        total = await db.doors.count_documents({"floor": f})
        per_stage = {}
        for k in STAGE_KEYS:
            per_stage[k] = await db.doors.count_documents({"floor": f, f"stages.{k}.status": "completed"})
        done_units = sum(per_stage.values())
        percent = round(100 * done_units / (total * len(STAGE_KEYS))) if total else 0
        out.append({"floor": f, "total": total, "per_stage": per_stage, "percent": percent})
    return out


@router.get("/analytics/qc")
async def analytics_qc(user=Depends(get_current_user)):
    passed = await db.doors.count_documents({"stages.routing.qc": "pass"})
    failed = await db.doors.count_documents({"stages.routing.qc": "fail"})
    pending = await db.doors.count_documents({"stages.routing.qc": None})
    failures = await db.doors.find({"stages.routing.qc": "fail"},
                                   {"_id": 0, "door_id": 1, "floor": 1, "location": 1,
                                    "stages.routing.notes": 1, "stages.routing.by": 1,
                                    "stages.routing.at": 1}).to_list(200)
    return {"passed": passed, "failed": failed, "pending": pending,
            "failures": [{"door_id": d["door_id"], "floor": d["floor"], "location": d["location"],
                          "notes": d["stages"]["routing"].get("notes", ""),
                          "by": d["stages"]["routing"].get("by"),
                          "at": d["stages"]["routing"].get("at")} for d in failures]}


@router.get("/analytics/throughput")
async def analytics_throughput(days: int = 14, user=Depends(get_current_user)):
    since = (datetime.now(timezone.utc) - timedelta(days=min(days, 90))).isoformat()
    rows = await db.activity.aggregate([
        {"$match": {"action": "stage_completed", "at": {"$gte": since}}},
        {"$group": {"_id": {"day": {"$substr": ["$at", 0, 10]}, "station": "$station"}, "n": {"$sum": 1}}},
        {"$sort": {"_id.day": 1}},
    ]).to_list(1000)
    days_map = {}
    for r in rows:
        d = r["_id"]["day"]
        days_map.setdefault(d, {"day": d, **{s: 0 for s in STATIONS}})
        days_map[d][r["_id"]["station"]] = r["n"]
    return list(days_map.values())


@router.get("/analytics/leaderboard")
async def analytics_leaderboard(user=Depends(get_current_user)):
    rows = await db.activity.aggregate([
        {"$match": {"action": "stage_completed"}},
        {"$group": {"_id": "$user", "completed": {"$sum": 1},
                    "last_at": {"$max": "$at"}}},
        {"$sort": {"completed": -1}},
    ]).to_list(50)
    return [{"user": r["_id"], "completed": r["completed"], "last_at": r["last_at"]} for r in rows]
