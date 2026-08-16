from dotenv import load_dotenv
load_dotenv()

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
import requests
from fastapi import HTTPException, Request, Response, Depends
from motor.motor_asyncio import AsyncIOMotorClient

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "maxx-doors"
storage_key = None

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
STATIONS = ["core", "skin", "assembly", "press", "routing"]
STAGE_KEYS = ["core", "skin", "assembly", "press", "routing", "despatch"]
PREV = {"core": None, "skin": None, "assembly": ["core", "skin"], "press": ["assembly"], "routing": ["press"]}
DOWNSTREAM = {
    "core": ["assembly", "press", "routing", "despatch"],
    "skin": ["assembly", "press", "routing", "despatch"],
    "assembly": ["press", "routing", "despatch"],
    "press": ["routing", "despatch"],
    "routing": ["despatch"],
    "despatch": [],
}

DOOR_FIELDS = [
    "door_type", "door_schedule_type", "qty", "internal_door", "leaf_height",
    "leaf_width_1", "leaf_width_2", "panel_thickness", "actual_thickness",
    "leaf_type", "leaf_type_code", "handing", "panel_finish", "fire_rating",
    "frame_type", "hinge_qty", "cladding", "vision_panel", "vision_panel_type",
    "vp_size", "conduit", "door_seal_prep", "grille_cutout", "grille_size",
    "strike_prep", "frame_strike_height", "stile_qty", "stiles",
    "rail_qty_1", "rail_1", "rail_qty_2", "rail_2",
    "core_type", "core_qty_1", "core_cutting_1", "core_qty_2", "core_cutting_2",
    "skin_type", "skin_qty_1", "skin_cutting_1", "skin_qty_2", "skin_cutting_2",
]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def to_int(v, default=0):
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return default


# ---------- storage ----------

def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": init_storage(), "Content-Type": content_type},
                        data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": init_storage()}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------- auth ----------

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
            "role": u["role"], "station": u.get("station"), "created_at": u.get("created_at")}


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


# ---------- doors ----------

def blank_stage():
    return {"status": "awaiting", "by": None, "at": None}


def fresh_stages(core_qty: int = 1, skin_qty: int = 2):
    stages = {k: blank_stage() for k in STAGE_KEYS}
    stages["assembly"]["photo"] = None
    stages["routing"]["qc"] = None
    stages["routing"]["notes"] = ""
    if not core_qty:
        stages["core"].update({"status": "completed", "by": "AUTO (no core required)", "at": now_iso()})
    if not skin_qty:
        stages["skin"].update({"status": "completed", "by": "AUTO (no skin required)", "at": now_iso()})
    return stages


def make_door(job_id, job_name, floor, door_id, location, **kw):
    extras = kw.pop("extras", {})
    fields = {f: str(kw.get(f, "") or "") for f in DOOR_FIELDS}
    core_qty = to_int(fields["core_qty_1"]) + to_int(fields["core_qty_2"])
    if not core_qty:
        core_qty = to_int(kw.get("core_qty"), 0)
    skin_qty = to_int(fields["skin_qty_1"]) + to_int(fields["skin_qty_2"])
    if not skin_qty:
        skin_qty = to_int(kw.get("skin_qty"), 0)
    core_cutting = " / ".join(x for x in [fields["core_cutting_1"], fields["core_cutting_2"]] if x) or str(kw.get("core_cutting", "") or "")
    skin_cutting = " / ".join(x for x in [fields["skin_cutting_1"], fields["skin_cutting_2"]] if x) or str(kw.get("skin_cutting", "") or "")
    return {
        "id": str(uuid.uuid4()), "job_id": job_id, "job_name": job_name,
        "floor": floor, "location": location, "door_id": door_id,
        **fields,
        "core_qty": core_qty, "core_cutting": core_cutting,
        "skin_qty": skin_qty, "skin_cutting": skin_cutting,
        "extras": extras, "notes": [], "rework_log": [],
        "stages": fresh_stages(core_qty, skin_qty), "created_at": now_iso(),
    }


# ---------- activity & notifications ----------

async def log_activity(user_name, role, action, detail="", door_id="", job_id="", station=""):
    await db.activity.insert_one({
        "id": str(uuid.uuid4()), "at": now_iso(), "user": user_name, "role": role,
        "action": action, "detail": detail, "door_id": door_id, "job_id": job_id, "station": station,
    })


async def notify(kind, title, body="", door_id="", job_id=""):
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "at": now_iso(), "kind": kind, "title": title,
        "body": body, "door_id": door_id, "job_id": job_id, "read_by": [],
    })


import re


async def get_door_or_404(door_id: str) -> dict:
    door = await db.doors.find_one(
        {"door_id": {"$regex": f"^{re.escape(door_id.strip())}$", "$options": "i"}})
    if not door:
        raise HTTPException(404, f"Door {door_id} not found")
    return door


DEFAULT_SETTINGS = {
    "id": "app", "company_name": "MAXX DOORS", "project_name": "LORIMER ST",
    "sticker_footer": "FIRE DOOR — DO NOT PAINT OVER TAG", "qc_notes_required": True,
    "auto_release_imports": False, "dashboard_refresh_seconds": 6,
}


async def get_settings():
    doc = await db.app_settings.find_one({"id": "app"}, {"_id": 0})
    if not doc:
        await db.app_settings.insert_one(dict(DEFAULT_SETTINGS))
        return dict(DEFAULT_SETTINGS)
    return {**DEFAULT_SETTINGS, **doc}
