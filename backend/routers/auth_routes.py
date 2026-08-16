from datetime import datetime, timezone, timedelta

import os
import jwt
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel

from core import (db, verify_password, hash_password, set_auth_cookies, public_user,
                  get_current_user, now_iso, JWT_ALGORITHM, log_activity)

router = APIRouter()


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower().strip()
    fwd = request.headers.get("x-forwarded-for", "")
    client_ip = fwd.split(",")[0].strip() if fwd else request.client.host
    ident = f"{client_ip}:{email}"
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
    await log_activity(user["name"], user["role"], "login", user["email"])
    return public_user(user)


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)


@router.post("/auth/refresh")
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


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user=Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await log_activity(user["name"], user["role"], "password_changed")
    return {"ok": True}
