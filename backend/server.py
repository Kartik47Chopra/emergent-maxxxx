from dotenv import load_dotenv
load_dotenv()

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware

from core import db, client, seed_users
from routers import (auth_routes, users_routes, jobs_routes, doors_routes,
                     stations_routes, despatch_routes, files_routes,
                     imports_routes, analytics_routes, misc_routes, chat_routes)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.doors.create_index("door_id", unique=True)
    await db.doors.create_index("job_id")
    await db.doors.create_index("floor")
    await db.activity.create_index("at")
    await db.activity.create_index("door_id")
    await db.notifications.create_index("at")
    await db.import_runs.create_index("started_at")
    await seed_users()
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

for r in (auth_routes, users_routes, jobs_routes, doors_routes, stations_routes,
          despatch_routes, files_routes, imports_routes, analytics_routes,
          misc_routes, chat_routes):
    api_router.include_router(r.router)

app.include_router(api_router)
