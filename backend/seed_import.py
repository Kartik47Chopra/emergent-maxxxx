import asyncio
import os
import sys

sys.path.insert(0, "/app/backend")

from core import db
from importer import run_import

ROOT = "/app/imports/drive/L16-L23 - DOOR PRODUCTION - 13.08.2026"


async def main():
    for col in ["doors", "jobs", "files", "activity", "notifications", "import_runs"]:
        r = await db[col].delete_many({})
        print(f"wiped {col}: {r.deleted_count}")
    named = []
    for root, _, files in os.walk(ROOT):
        for f in sorted(files):
            with open(os.path.join(root, f), "rb") as fh:
                named.append((f, fh.read()))
    print("files to import:", len(named))
    user = {"name": "Office Control", "role": "office"}
    run = await run_import(named, user, "seed")
    print("jobs created:", len(run["jobs_created"]))
    for j in run["jobs_created"]:
        print(" ", j["name"], "|", j["floor"], "|", j["door_count"], "doors")
    print("doors imported:", run["doors_imported"])
    print("attachments:", run["attachments"])
    print("skipped:", run["skipped_door_ids"])
    print("errors:", run["errors"])
    res = await db.jobs.update_many({}, {"$set": {"released": True}})
    print("released jobs:", res.modified_count)

asyncio.run(main())
