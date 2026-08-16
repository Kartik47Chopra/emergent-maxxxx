from dotenv import load_dotenv
load_dotenv()

import os
import uuid
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
STATIONS = ["core", "skin", "assembly", "press", "routing"]
PREV = {"core": None, "skin": None, "assembly": ["core", "skin"], "press": ["assembly"], "routing": ["press"]}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, user_id: str, email: str):
    response.set_cookie("access_token", create_access_token(user_id, email),
                        httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", create_refresh_token(user_id),
                        httponly=True, secure=True, samesite="none", max_age=604800, path="/")


def public_user(u: dict) -> dict:
    return {"id": u["id"], "email": u["email"], "name": u["name"],
            "role": u["role"], "station": u.get("station")}


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


def require_office(user=Depends(get_current_user)):
    if user["role"] != "office":
        raise HTTPException(403, "Office staff only")
    return user


async def seed_users():
    office_email = os.environ.get("ADMIN_EMAIL", "office@maxxdoors.com").lower()
    office_pw = os.environ.get("ADMIN_PASSWORD", "MaxxOffice!2026")
    existing = await db.users.find_one({"email": office_email})
    if not existing:
        await db.users.insert_one({"id": str(uuid.uuid4()), "email": office_email,
                                   "password_hash": hash_password(office_pw), "name": "Office Control",
                                   "role": "office", "station": None, "created_at": now_iso()})
    elif not verify_password(office_pw, existing["password_hash"]):
        await db.users.update_one({"email": office_email},
                                  {"$set": {"password_hash": hash_password(office_pw)}})
    for st in STATIONS:
        email = f"{st}@maxxdoors.com"
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({"id": str(uuid.uuid4()), "email": email,
                                       "password_hash": hash_password("MaxxStation!2026"),
                                       "name": f"{st.title()} Operator", "role": "operator",
                                       "station": st, "created_at": now_iso()})


def fresh_stages(core_qty: int = 1):
    def s():
        return {"status": "awaiting", "by": None, "at": None}
    stages = {k: s() for k in ["core", "skin", "assembly", "press", "routing", "despatch"]}
    stages["assembly"]["photo"] = None
    stages["routing"]["qc"] = None
    stages["routing"]["notes"] = ""
    if not core_qty:
        stages["core"].update({"status": "completed", "by": "AUTO (no core required)", "at": now_iso()})
    return stages


def make_door(job_id, job_name, floor, door_id, location, door_type="DSC-03d", **kw):
    core_qty = kw.get("core_qty", 1)
    return {
        "id": str(uuid.uuid4()), "job_id": job_id, "job_name": job_name,
        "floor": floor, "location": location, "door_type": door_type,
        "qty": kw.get("qty", 1), "internal_door": kw.get("internal_door", "Yes"),
        "door_id": door_id, "leaf_height": kw.get("leaf_height", "2400"),
        "leaf_width_1": kw.get("leaf_width_1", "826"), "leaf_width_2": kw.get("leaf_width_2", ""),
        "panel_thickness": kw.get("panel_thickness", "54"),
        "actual_thickness": kw.get("actual_thickness", "56"),
        "leaf_type": kw.get("leaf_type", "Single"), "panel_finish": kw.get("panel_finish", "Sapele Veneer"),
        "fire_rating": kw.get("fire_rating", "FD60"),
        "core_qty": core_qty, "core_type": kw.get("core_type", "FR Particleboard 44mm"),
        "core_cutting": kw.get("core_cutting", "2400 x 826"),
        "skin_qty": kw.get("skin_qty", 2), "skin_type": kw.get("skin_type", "Sapele Veneer 6mm"),
        "skin_cutting": kw.get("skin_cutting", "2440 x 840"),
        "stages": fresh_stages(core_qty), "created_at": now_iso(),
    }


def set_stage(door, station, by="Seeder"):
    door["stages"][station].update({"status": "completed", "by": by, "at": now_iso()})


async def seed_demo():
    if await db.jobs.count_documents({}) > 0:
        return
    job = {"id": str(uuid.uuid4()), "name": "Riverside Gate - Tower A", "client": "Meridian Construction",
           "released": True, "created_at": now_iso()}
    await db.jobs.insert_one(job)
    locs = ["CORRIDOR ENTRY", "BOH AREA", "FIRE CONTROL ROOM", "STAIR CORE", "RISER CUPBOARD"]
    doors = []
    for i in range(2, 10):
        doors.append(make_door(job["id"], job["name"], "Ground Floor", f"RG01.D{i}", locs[i % len(locs)]))
    for i in range(1, 5):
        doors.append(make_door(job["id"], job["name"], "Level 1", f"RG02.D{i}", locs[i % len(locs)],
                               core_cutting="2100 x 926", skin_cutting="2140 x 940"))
    for d in doors:
        n = int(d["door_id"].split(".D")[1])
        if d["floor"] == "Ground Floor":
            if n <= 4:
                for st in ["core", "skin", "assembly", "press", "routing"]:
                    set_stage(d, st)
                d["stages"]["routing"]["qc"] = "pass"
                if n == 2:
                    set_stage(d, "despatch")
            elif n == 5:
                for st in ["core", "skin", "assembly", "press"]:
                    set_stage(d, st)
            elif n == 6:
                for st in ["core", "skin"]:
                    set_stage(d, st)
            elif n == 7:
                set_stage(d, "core")
        await db.doors.insert_one(d)
    logger.info("Seeded demo job with %d doors", len(doors))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.doors.create_index("door_id", unique=True)
    await db.doors.create_index("job_id")
    await db.doors.create_index("floor")
    await seed_users()
    await seed_demo()
    yield
    client.close()


app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Auth ----------

class LoginIn(BaseModel):
    email: str
    password: str


@api_router.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower().strip()
    ident = f"{request.client.host}:{email}"
    attempts = await db.login_attempts.find_one({"identifier": ident})
    if attempts and attempts.get("count", 0) >= 5:
        locked_at = datetime.fromisoformat(attempts["locked_at"])
        if datetime.now(timezone.utc) - locked_at < timedelta(minutes=15):
            raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": ident},
            {"$inc": {"count": 1}, "$set": {"locked_at": now_iso()}}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"identifier": ident})
    set_auth_cookies(response, user["id"], user["email"])
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    set_auth_cookies(response, user["id"], user["email"])
    return public_user(user)


# ---------- Jobs & Doors ----------

class DoorIn(BaseModel):
    floor: str
    location: str
    door_type: str = "DSC-03d"
    qty: int = 1
    internal_door: str = "Yes"
    door_id: str
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


@api_router.get("/jobs")
async def list_jobs(user=Depends(get_current_user)):
    jobs = await db.jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for j in jobs:
        j["door_count"] = await db.doors.count_documents({"job_id": j["id"]})
    return jobs


@api_router.post("/jobs")
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
                         data.pop("location"), data.pop("door_type"), **data)
        await db.doors.insert_one(door)
    job["door_count"] = len(body.doors)
    job.pop("_id", None)
    return job


@api_router.post("/jobs/{job_id}/release")
async def release_job(job_id: str, user=Depends(require_office)):
    res = await db.jobs.update_one({"id": job_id}, {"$set": {"released": True}})
    if not res.matched_count:
        raise HTTPException(404, "Job not found")
    return {"ok": True}


@api_router.get("/doors")
async def list_doors(floor: Optional[str] = None, q: Optional[str] = None,
                     job_id: Optional[str] = None, user=Depends(get_current_user)):
    query = {}
    if floor:
        query["floor"] = floor
    if job_id:
        query["job_id"] = job_id
    if q:
        query["door_id"] = {"$regex": q.strip(), "$options": "i"}
    return await db.doors.find(query, {"_id": 0}).sort([("floor", 1), ("door_id", 1)]).to_list(2000)


# ---------- Stations ----------

def queue_filter(station: str):
    f = {"stages." + station + ".status": {"$ne": "completed"}}
    if station == "routing":
        f["stages.routing.qc"] = {"$ne": "pass"}
    return f


@api_router.get("/stations/{station}/queue")
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
    doors = await db.doors.find(query, {"_id": 0}).sort([("floor", 1), ("door_id", 1)]).to_list(2000)
    out = []
    for d in doors:
        ready = all(d["stages"][p]["status"] == "completed" for p in (PREV[station] or []))
        out.append({**d, "station_ready": ready})
    return out


async def complete_one(door_id: str, station: str, by: str):
    door = await db.doors.find_one({"door_id": door_id})
    if not door:
        raise HTTPException(404, f"Door {door_id} not found")
    job = await db.jobs.find_one({"id": door["job_id"]})
    if not job or not job.get("released"):
        raise HTTPException(400, "Job not released to factory yet")
    if door["stages"][station]["status"] == "completed":
        return door
    for p in PREV[station] or []:
        if door["stages"][p]["status"] != "completed":
            raise HTTPException(400, f"{door_id}: {p.title()} must be completed first")
    if station == "assembly" and not door["stages"]["assembly"].get("photo"):
        raise HTTPException(400, f"{door_id}: photo must be uploaded before completing assembly")
    door["stages"][station].update({"status": "completed", "by": by, "at": now_iso()})
    await db.doors.update_one({"door_id": door_id}, {"$set": {f"stages.{station}": door["stages"][station]}})
    door.pop("_id", None)
    return door


@api_router.post("/doors/{door_id}/stations/{station}/complete")
async def complete_station(door_id: str, station: str, user=Depends(get_current_user)):
    if station not in ["core", "skin", "assembly", "press"]:
        raise HTTPException(400, "Use the QC endpoint for routing")
    if user["role"] == "operator" and user.get("station") != station:
        raise HTTPException(403, "Wrong station")
    return await complete_one(door_id, station, user["name"])


class BatchIn(BaseModel):
    station: str
    door_ids: List[str]


@api_router.post("/doors/batch-complete")
async def batch_complete(body: BatchIn, user=Depends(get_current_user)):
    if body.station not in ["core", "skin", "press"]:
        raise HTTPException(400, "Batch complete not supported for this station")
    if user["role"] == "operator" and user.get("station") != body.station:
        raise HTTPException(403, "Wrong station")
    done, errors = [], []
    for did in body.door_ids:
        try:
            await complete_one(did, body.station, user["name"])
            done.append(did)
        except HTTPException as e:
            errors.append(e.detail)
    return {"completed": done, "errors": errors}


class PhotoIn(BaseModel):
    photo: str


@api_router.post("/doors/{door_id}/photo")
async def upload_photo(door_id: str, body: PhotoIn, user=Depends(get_current_user)):
    if len(body.photo) > 6_000_000:
        raise HTTPException(400, "Photo too large")
    res = await db.doors.update_one({"door_id": door_id},
                                    {"$set": {"stages.assembly.photo": body.photo}})
    if not res.matched_count:
        raise HTTPException(404, "Door not found")
    return {"ok": True}


class QCIn(BaseModel):
    result: str
    notes: str = ""


@api_router.post("/doors/{door_id}/routing/qc")
async def routing_qc(door_id: str, body: QCIn, user=Depends(get_current_user)):
    if user["role"] == "operator" and user.get("station") != "routing":
        raise HTTPException(403, "Wrong station")
    if body.result not in ["pass", "fail"]:
        raise HTTPException(400, "Result must be pass or fail")
    if body.result == "fail" and not body.notes.strip():
        raise HTTPException(400, "Notes are required when a door fails QC")
    door = await db.doors.find_one({"door_id": door_id})
    if not door:
        raise HTTPException(404, "Door not found")
    if door["stages"]["press"]["status"] != "completed":
        raise HTTPException(400, "Press must be completed first")
    st = door["stages"]["routing"]
    st.update({"status": "completed" if body.result == "pass" else "failed",
               "qc": body.result, "notes": body.notes, "by": user["name"], "at": now_iso()})
    await db.doors.update_one({"door_id": door_id}, {"$set": {"stages.routing": st}})
    door["stages"]["routing"] = st
    door.pop("_id", None)
    return door


@api_router.post("/doors/{door_id}/despatch")
async def despatch_door(door_id: str, user=Depends(get_current_user)):
    door = await db.doors.find_one({"door_id": door_id})
    if not door:
        raise HTTPException(404, "Door not found")
    if not (door["stages"]["routing"]["status"] == "completed" and door["stages"]["routing"].get("qc") == "pass"):
        raise HTTPException(400, "Door must pass QC before despatch")
    door["stages"]["despatch"].update({"status": "completed", "by": user["name"], "at": now_iso()})
    await db.doors.update_one({"door_id": door_id}, {"$set": {"stages.despatch": door["stages"]["despatch"]}})
    door.pop("_id", None)
    return door


@api_router.get("/despatch-note")
async def despatch_note(floor: str, user=Depends(get_current_user)):
    doors = await db.doors.find(
        {"floor": floor, "stages.routing.qc": "pass", "stages.despatch.status": {"$ne": "completed"}},
        {"_id": 0}).sort("door_id", 1).to_list(1000)
    return {"floor": floor, "generated_at": now_iso(), "doors": doors}


@api_router.get("/stats")
async def stats(user=Depends(get_current_user)):
    total = await db.doors.count_documents({})
    delivered = await db.doors.count_documents({"stages.despatch.status": "completed"})
    failed = await db.doors.count_documents({"stages.routing.qc": "fail"})
    awaiting_despatch = await db.doors.count_documents(
        {"stages.routing.qc": "pass", "stages.despatch.status": {"$ne": "completed"}})
    return {"total": total, "delivered": delivered, "in_production": total - delivered,
            "qc_failed": failed, "awaiting_despatch": awaiting_despatch}


@api_router.get("/")
async def root():
    return {"message": "MAXX DOORS production API"}


app.include_router(api_router)
