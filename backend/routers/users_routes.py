import uuid
import secrets

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from core import (db, hash_password, public_user, require_office, now_iso,
                  STATIONS, log_activity)

router = APIRouter()


@router.get("/users")
async def list_users(user=Depends(require_office)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(200)
    return users


class UserIn(BaseModel):
    email: str
    name: str
    role: str
    station: Optional[str] = None
    password: str


@router.post("/users")
async def create_user(body: UserIn, user=Depends(require_office)):
    if body.role not in ("office", "operator"):
        raise HTTPException(400, "Role must be office or operator")
    if body.role == "operator" and body.station not in STATIONS:
        raise HTTPException(400, "Operators need a valid station")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "That email is already in use")
    doc = {"id": str(uuid.uuid4()), "email": email, "password_hash": hash_password(body.password),
           "name": body.name.strip(), "role": body.role,
           "station": body.station if body.role == "operator" else None, "created_at": now_iso()}
    await db.users.insert_one(doc)
    await log_activity(user["name"], user["role"], "user_created", f"{body.name} ({email})")
    return public_user(doc)


@router.get("/users/{user_id}")
async def get_user(user_id: str, user=Depends(require_office)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "User not found")
    return u


class UserPatch(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    station: Optional[str] = None


@router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserPatch, user=Depends(require_office)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.role is not None:
        if body.role not in ("office", "operator"):
            raise HTTPException(400, "Role must be office or operator")
        updates["role"] = body.role
    if body.station is not None:
        if body.station and body.station not in STATIONS:
            raise HTTPException(400, "Invalid station")
        updates["station"] = body.station or None
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
        await log_activity(user["name"], user["role"], "user_updated", target["email"])
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return u


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, user=Depends(require_office)):
    if user_id == user["id"]:
        raise HTTPException(400, "You can't delete your own account")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.delete_one({"id": user_id})
    await log_activity(user["name"], user["role"], "user_deleted", target["email"])
    return {"ok": True}


class ResetPasswordIn(BaseModel):
    password: Optional[str] = None


@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: str, body: ResetPasswordIn, user=Depends(require_office)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    new_pw = body.password or ("Maxx" + secrets.token_urlsafe(6))
    if len(new_pw) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(new_pw)}})
    await log_activity(user["name"], user["role"], "password_reset", target["email"])
    return {"ok": True, "password": new_pw}
