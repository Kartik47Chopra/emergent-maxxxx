"""MAXX DOORS backend regression suite."""
import io
import os
import time

import pytest

from conftest import API, CREDS, login


# ---------- health / analytics ----------
class TestHealthAnalytics:
    def test_health(self, office):
        r = office.get(f"{API}/health", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True and d["db"] == "up"
        assert d["doors"] >= 80

    def test_auth_me(self, office):
        r = office.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["role"] == "office"

    def test_unauthenticated_blocked(self):
        import requests
        r = requests.get(f"{API}/stats", timeout=30)
        assert r.status_code == 401

    @pytest.mark.parametrize("path", [
        "/stats", "/analytics/overview", "/analytics/floors", "/analytics/stations",
        "/analytics/qc", "/analytics/throughput", "/analytics/leaderboard",
    ])
    def test_analytics_endpoints(self, office, path):
        r = office.get(f"{API}{path}", timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data is not None
        if path in ("/analytics/throughput", "/analytics/leaderboard"):
            assert isinstance(data, list)  # may be empty before any stage completions
        else:
            assert data not in ({}, [])
        if path == "/stats":
            assert data.get("total", 0) >= 80
        if path == "/analytics/floors":
            assert isinstance(data, (list, dict))


# ---------- doors read ----------
class TestDoorsRead:
    def test_floors_list(self, office):
        r = office.get(f"{API}/doors/floors", timeout=30)
        assert r.status_code == 200
        floors = r.json()
        assert len(floors) == 8, f"expected 8 floors got {len(floors)}: {floors}"

    def test_floor_filter(self, office):
        r = office.get(f"{API}/doors", params={"floor": "LEVEL 17"}, timeout=60)
        assert r.status_code == 200
        doors = r.json()
        assert len(doors) == 10, f"expected 10 doors on LEVEL 17, got {len(doors)}"
        assert all(d["floor"] == "LEVEL 17" for d in doors)

    def test_door_spec_fields(self, office):
        r = office.get(f"{API}/doors/R1701.D3", timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["door_id"] == "R1701.D3"
        assert d["frame_type"] == "NR", d.get("frame_type")
        assert str(d["hinge_qty"]).startswith("4"), d.get("hinge_qty")
        for f in ["stiles", "rail_1", "core_cutting_1", "skin_cutting_1", "leaf_height"]:
            assert d.get(f), f"missing {f}"
        assert "_id" not in d

    def test_status_filter_and_search(self, office):
        r = office.get(f"{API}/doors", params={"status": "in_production"}, timeout=60)
        assert r.status_code == 200 and len(r.json()) > 0
        r2 = office.get(f"{API}/doors", params={"q": "R1701"}, timeout=60)
        assert r2.status_code == 200 and len(r2.json()) > 0

    def test_missing_door_404(self, office):
        r = office.get(f"{API}/doors/NOPE.D9", timeout=30)
        assert r.status_code == 404

    def test_label(self, office):
        r = office.get(f"{API}/doors/R1701.D3/label", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["door"]["door_id"] == "R1701.D3" and "company" in d


# ---------- lifecycle (uses a LEVEL 23 door) ----------
class TestDoorLifecycle:
    DOOR = "R2301.D3"

    def test_00_door_exists_and_reset(self, office):
        r = office.get(f"{API}/doors/{self.DOOR}", timeout=30)
        assert r.status_code == 200, f"lifecycle door missing: {r.text[:200]}"
        # reset to fresh state so the flow is deterministic
        office.post(f"{API}/doors/{self.DOOR}/stations/core/undo", timeout=30)
        office.post(f"{API}/doors/{self.DOOR}/stations/skin/undo", timeout=30)

    def test_01_wrong_station_403(self, operators):
        r = operators["skin"].post(f"{API}/doors/{self.DOOR}/stations/core/complete", timeout=30)
        assert r.status_code == 403, r.text[:200]

    def test_02_core_complete(self, operators):
        r = operators["core"].post(f"{API}/doors/{self.DOOR}/stations/core/complete", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["stages"]["core"]["status"] == "completed"

    def test_03_assembly_before_prereq_400(self, operators):
        r = operators["assembly"].post(f"{API}/doors/{self.DOOR}/stations/assembly/complete", timeout=30)
        assert r.status_code == 400, r.text[:200]

    def test_04_skin_complete(self, operators):
        r = operators["skin"].post(f"{API}/doors/{self.DOOR}/stations/skin/complete", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["stages"]["skin"]["status"] == "completed"

    def test_05_assembly_without_photo_400(self, operators, office):
        door = office.get(f"{API}/doors/{self.DOOR}", timeout=30).json()
        if door["stages"]["assembly"].get("photo"):
            pytest.skip("photo already attached from a previous run; no API exists to clear it")
        r = operators["assembly"].post(f"{API}/doors/{self.DOOR}/stations/assembly/complete", timeout=30)
        assert r.status_code == 400 and "photo" in r.text.lower(), r.text[:200]

    def test_06_photo_then_assembly(self, operators):
        tiny = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
                "AAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==")
        rp = operators["assembly"].post(f"{API}/doors/{self.DOOR}/photo", json={"photo": tiny}, timeout=30)
        assert rp.status_code == 200, rp.text[:200]
        r = operators["assembly"].post(f"{API}/doors/{self.DOOR}/stations/assembly/complete", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["stages"]["assembly"]["status"] == "completed"

    def test_07_qc_before_press_400(self, operators):
        r = operators["routing"].post(f"{API}/doors/{self.DOOR}/routing/qc",
                                      json={"result": "pass"}, timeout=30)
        assert r.status_code == 400, r.text[:200]

    def test_08_press_complete(self, operators):
        r = operators["press"].post(f"{API}/doors/{self.DOOR}/stations/press/complete", timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_09_qc_fail_requires_notes(self, operators):
        r = operators["routing"].post(f"{API}/doors/{self.DOOR}/routing/qc",
                                      json={"result": "fail", "notes": "  "}, timeout=30)
        assert r.status_code == 400, r.text[:200]

    def test_10_despatch_before_qc_400(self, office):
        r = office.post(f"{API}/doors/{self.DOOR}/despatch", timeout=30)
        assert r.status_code == 400, r.text[:200]

    def test_11_qc_pass(self, operators):
        r = operators["routing"].post(f"{API}/doors/{self.DOOR}/routing/qc",
                                      json={"result": "pass", "notes": "TEST_ok"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["stages"]["routing"]["qc"] == "pass"

    def test_12_manifest_and_note_include_door(self, office):
        r = office.get(f"{API}/despatch/manifest", timeout=60)
        assert r.status_code == 200
        ids = [d["door_id"] for f in r.json()["floors"] for d in f["doors"]]
        assert self.DOOR in ids
        r2 = office.get(f"{API}/despatch-note", params={"floor": "LEVEL 23"}, timeout=30)
        assert r2.status_code == 200
        assert self.DOOR in [d["door_id"] for d in r2.json()["doors"]]

    def test_13_despatch_batch(self, office):
        r = office.post(f"{API}/despatch/batch", json={"door_ids": [self.DOOR]}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert self.DOOR in body["completed"], body
        g = office.get(f"{API}/doors/{self.DOOR}", timeout=30)
        assert g.json()["stages"]["despatch"]["status"] == "completed"

    def test_14_despatch_history(self, office):
        r = office.get(f"{API}/despatch/history", timeout=60)
        assert r.status_code == 200
        assert self.DOOR in [d["door_id"] for d in r.json()]

    def test_15_history_and_notes(self, office):
        h = office.get(f"{API}/doors/{self.DOOR}/history", timeout=30)
        assert h.status_code == 200 and len(h.json()) > 0
        n = office.post(f"{API}/doors/{self.DOOR}/notes", json={"text": "TEST_note from QA"}, timeout=30)
        assert n.status_code == 200, n.text[:200]
        gn = office.get(f"{API}/doors/{self.DOOR}/notes", timeout=30)
        assert any(x["text"] == "TEST_note from QA" for x in gn.json())
        empty = office.post(f"{API}/doors/{self.DOOR}/notes", json={"text": "  "}, timeout=30)
        assert empty.status_code == 400

    def test_16_rework_resets_downstream(self, office):
        r = office.post(f"{API}/doors/{self.DOOR}/rework",
                        json={"stations": ["press"], "reason": "TEST_rework"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        st = r.json()["stages"]
        assert st["press"]["status"] == "awaiting"
        assert st["routing"]["status"] == "awaiting" and st["routing"]["qc"] is None
        assert st["despatch"]["status"] == "awaiting"
        assert st["assembly"]["status"] == "completed"
        bad = office.post(f"{API}/doors/{self.DOOR}/rework",
                          json={"stations": ["press"], "reason": " "}, timeout=30)
        assert bad.status_code == 400

    def test_17_undo_resets(self, office):
        r = office.post(f"{API}/doors/{self.DOOR}/stations/core/undo", timeout=30)
        assert r.status_code == 200, r.text[:300]
        st = r.json()["stages"]
        assert st["core"]["status"] == "awaiting" and st["assembly"]["status"] == "awaiting"
        office.post(f"{API}/doors/{self.DOOR}/stations/skin/undo", timeout=30)


# ---------- jobs ----------
class TestJobs:
    def test_list_jobs_progress(self, office):
        r = office.get(f"{API}/jobs", timeout=60)
        assert r.status_code == 200
        jobs = r.json()
        assert len(jobs) >= 8, len(jobs)
        j = jobs[0]
        assert "progress" in j and "percent" in j["progress"] and "per_stage" in j["progress"]
        assert j["door_count"] > 0

    def test_job_detail_patch_release_cycle(self, office):
        jobs = office.get(f"{API}/jobs", timeout=60).json()
        job = [j for j in jobs if "LORIMER" in j["name"]][-1]
        jid = job["id"]
        r = office.get(f"{API}/jobs/{jid}", timeout=30)
        assert r.status_code == 200 and r.json()["id"] == jid
        # patch name back and forth
        orig = job["name"]
        p = office.patch(f"{API}/jobs/{jid}", json={"name": orig + " "}, timeout=30)
        assert p.status_code == 200 and p.json()["name"] == orig
        # unrelease then release
        assert office.post(f"{API}/jobs/{jid}/unrelease", timeout=30).status_code == 200
        assert office.get(f"{API}/jobs/{jid}", timeout=30).json()["released"] is False
        assert office.post(f"{API}/jobs/{jid}/release", timeout=30).status_code == 200
        assert office.get(f"{API}/jobs/{jid}", timeout=30).json()["released"] is True
        d = office.get(f"{API}/jobs/{jid}/doors", timeout=30)
        assert d.status_code == 200 and len(d.json()) > 0
        pr = office.get(f"{API}/jobs/{jid}/progress", timeout=30)
        assert pr.status_code == 200 and "per_stage" in pr.json()

    def test_job_404(self, office):
        assert office.get(f"{API}/jobs/does-not-exist", timeout=30).status_code == 404


# ---------- team ----------
class TestTeam:
    created_id = None

    def test_operator_cannot_list_users(self, operators):
        r = operators["core"].get(f"{API}/users", timeout=30)
        assert r.status_code == 403

    def test_user_crud(self, office):
        users = office.get(f"{API}/users", timeout=30)
        assert users.status_code == 200 and len(users.json()) >= 6
        assert all("password_hash" not in u for u in users.json())

        # short password rejected
        bad = office.post(f"{API}/users", json={"email": "test_qa1@maxxdoors.com", "name": "TEST QA",
                                               "role": "operator", "station": "core", "password": "abc"}, timeout=30)
        assert bad.status_code == 400
        # bad station rejected
        bad2 = office.post(f"{API}/users", json={"email": "test_qa1@maxxdoors.com", "name": "TEST QA",
                                                "role": "operator", "station": "nope", "password": "abcd12345"}, timeout=30)
        assert bad2.status_code == 400

        c = office.post(f"{API}/users", json={"email": "test_qa1@maxxdoors.com", "name": "TEST QA",
                                              "role": "operator", "station": "core",
                                              "password": "TestQa!2026"}, timeout=30)
        assert c.status_code == 200, c.text[:300]
        uid = c.json()["id"]
        assert c.json()["station"] == "core"
        # duplicate email
        dup = office.post(f"{API}/users", json={"email": "test_qa1@maxxdoors.com", "name": "TEST QA",
                                                "role": "operator", "station": "core",
                                                "password": "TestQa!2026"}, timeout=30)
        assert dup.status_code == 400

        # login with new user works
        s = login("test_qa1@maxxdoors.com", "TestQa!2026")
        assert s.get(f"{API}/auth/me", timeout=30).json()["station"] == "core"

        # patch
        pa = office.patch(f"{API}/users/{uid}", json={"name": "TEST QA2", "station": "press"}, timeout=30)
        assert pa.status_code == 200 and pa.json()["name"] == "TEST QA2" and pa.json()["station"] == "press"

        # reset password
        rp = office.post(f"{API}/users/{uid}/reset-password", json={}, timeout=30)
        assert rp.status_code == 200 and len(rp.json()["password"]) >= 8
        newpw = rp.json()["password"]
        s2 = login("test_qa1@maxxdoors.com", newpw)
        assert s2.get(f"{API}/auth/me", timeout=30).status_code == 200

        # self delete blocked
        me = office.get(f"{API}/auth/me", timeout=30).json()
        sd = office.delete(f"{API}/users/{me['id']}", timeout=30)
        assert sd.status_code == 400, sd.text[:200]

        # delete test user
        dl = office.delete(f"{API}/users/{uid}", timeout=30)
        assert dl.status_code == 200
        assert office.get(f"{API}/users/{uid}", timeout=30).status_code == 404


# ---------- search / notifications / settings / activity ----------
class TestMisc:
    def test_search(self, office):
        r = office.get(f"{API}/search", params={"q": "R1701"}, timeout=30)
        assert r.status_code == 200 and len(r.json()["doors"]) > 0
        r2 = office.get(f"{API}/search", params={"q": "LORIMER"}, timeout=30)
        assert len(r2.json()["jobs"]) > 0, r2.text[:300]
        r3 = office.get(f"{API}/search", params={"q": "SHOP"}, timeout=30)
        assert len(r3.json()["files"]) > 0, r3.text[:300]

    def test_notifications(self, office):
        r = office.get(f"{API}/notifications", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "unread" in d
        assert office.post(f"{API}/notifications/read-all", timeout=30).status_code == 200
        assert office.get(f"{API}/notifications", timeout=30).json()["unread"] == 0

    def test_settings(self, office, operators):
        r = office.get(f"{API}/settings", timeout=30)
        assert r.status_code == 200 and r.json()["company_name"]
        original = r.json()["sticker_footer"]
        p = office.put(f"{API}/settings", json={"sticker_footer": "TEST_FOOTER"}, timeout=30)
        assert p.status_code == 200 and p.json()["sticker_footer"] == "TEST_FOOTER"
        assert office.get(f"{API}/settings", timeout=30).json()["sticker_footer"] == "TEST_FOOTER"
        office.put(f"{API}/settings", json={"sticker_footer": original}, timeout=30)
        assert operators["core"].put(f"{API}/settings", json={"company_name": "X"}, timeout=30).status_code == 403

    def test_activity(self, office):
        r = office.get(f"{API}/activity", timeout=30)
        assert r.status_code == 200 and len(r.json()) > 0
        r2 = office.get(f"{API}/activity", params={"action": "stage_completed"}, timeout=30)
        assert r2.status_code == 200
        assert all(a["action"] == "stage_completed" for a in r2.json())

    def test_reports(self, office):
        r = office.get(f"{API}/reports/production", params={"floor": "LEVEL 17"}, timeout=60)
        assert r.status_code == 200 and r.json()["total"] == 10
        assert office.get(f"{API}/reports/despatch", timeout=60).status_code == 200

    def test_station_endpoints(self, office, operators):
        r = office.get(f"{API}/stations", timeout=60)
        assert r.status_code == 200 and len(r.json()) == 5
        q = operators["core"].get(f"{API}/stations/core/queue", timeout=60)
        assert q.status_code == 200 and len(q.json()) > 0
        assert "station_ready" in q.json()[0]
        wrong = operators["core"].get(f"{API}/stations/press/queue", timeout=30)
        assert wrong.status_code == 403
        assert office.get(f"{API}/stations/core/stats", timeout=30).status_code == 200
        assert office.get(f"{API}/stations/bogus/queue", timeout=30).status_code == 404


# ---------- files ----------
class TestFiles:
    def test_file_lifecycle(self, office):
        files = {"file": ("TEST_qa.txt", io.BytesIO(b"qa test file"), "text/plain")}
        r = office.post(f"{API}/files", files=files, data={"door_id": "R1701.D3"}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        rec = r.json()
        fid = rec["id"]
        assert rec["door_id"] == "R1701.D3" and rec["size"] > 0

        lst = office.get(f"{API}/files", params={"door_id": "R1701.D3"}, timeout=30)
        assert lst.status_code == 200 and any(f["id"] == fid for f in lst.json())

        meta = office.get(f"{API}/files/{fid}", timeout=30)
        assert meta.status_code == 200 and meta.json()["original_filename"] == "TEST_qa.txt"

        dl = office.get(f"{API}/files/{fid}/download", timeout=60)
        assert dl.status_code == 200 and dl.content == b"qa test file"

        pa = office.patch(f"{API}/files/{fid}", json={"floor": "LEVEL 17"}, timeout=30)
        assert pa.status_code == 200 and pa.json()["floor"] == "LEVEL 17"

        summ = office.get(f"{API}/files/summary", timeout=30)
        assert summ.status_code == 200 and summ.json()["total"] > 0

        assert office.delete(f"{API}/files/{fid}", timeout=30).status_code == 200
        assert office.get(f"{API}/files/{fid}", timeout=30).status_code == 404

    def test_existing_pdfs_present(self, office):
        r = office.get(f"{API}/files", timeout=30)
        assert r.status_code == 200
        pdfs = [f for f in r.json() if f["original_filename"].lower().endswith(".pdf")]
        assert len(pdfs) >= 11, f"expected >=11 PDFs, got {len(pdfs)}"


# ---------- import ----------
class TestImport:
    def test_drive_bad_url_400(self, office):
        r = office.post(f"{API}/import/drive", json={"url": "https://example.com/foo"}, timeout=30)
        assert r.status_code == 400, r.text[:200]

    def test_xlsx_import_and_dedupe(self, office, tmp_path):
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.append(["DOOR ID", "Building", "LOCATION ", "LEAF HEIGHT"])
        ws.append(["TEST01.D1", "LEVEL 99", "TEST ROOM 1", "2100"])
        ws.append(["TEST01.D2", "LEVEL 99", "TEST ROOM 2", "2100"])
        p = tmp_path / "TEST_import.xlsx"
        wb.save(p)
        data = p.read_bytes()

        r = office.post(f"{API}/import/run",
                        files={"files": ("TEST_import.xlsx", data,
                                         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                        timeout=180)
        assert r.status_code == 200, r.text[:500]
        run = r.json()
        assert run["doors_imported"] == 2, run
        assert len(run["jobs_created"]) == 1, run
        job_id = run["jobs_created"][0]["id"]

        try:
            # doors exist and job is draft
            job = office.get(f"{API}/jobs/{job_id}", timeout=30).json()
            assert job["released"] is False
            doors = office.get(f"{API}/jobs/{job_id}/doors", timeout=30).json()
            assert sorted(d["door_id"] for d in doors) == ["TEST01.D1", "TEST01.D2"]

            # re-run -> duplicates skipped
            r2 = office.post(f"{API}/import/run",
                             files={"files": ("TEST_import.xlsx", data,
                                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                             timeout=180)
            assert r2.status_code == 200, r2.text[:500]
            run2 = r2.json()
            assert run2["doors_imported"] == 0, run2
            assert set(run2["skipped_door_ids"]) == {"TEST01.D1", "TEST01.D2"}, run2

            runs = office.get(f"{API}/import/runs", timeout=30)
            assert runs.status_code == 200 and len(runs.json()) >= 2
            assert office.get(f"{API}/import/runs/{run['id']}", timeout=30).status_code == 200
        finally:
            dl = office.delete(f"{API}/jobs/{job_id}", timeout=60)
            assert dl.status_code == 200
            for extra in office.get(f"{API}/jobs", timeout=60).json():
                if extra["name"].startswith("TEST_import") or extra["door_count"] == 0 and "TEST" in extra["name"].upper():
                    office.delete(f"{API}/jobs/{extra['id']}", timeout=60)
            assert office.get(f"{API}/doors/TEST01.D1", timeout=30).status_code == 404


# ---------- auth security ----------
class TestAuthSecurity:
    def test_bcrypt_hash_format(self):
        import asyncio
        import sys
        sys.path.insert(0, "/app/backend")
        from core import db

        async def check():
            u = await db.users.find_one({"email": "office@maxxdoors.com"})
            return u["password_hash"]
        h = asyncio.get_event_loop().run_until_complete(check()) if False else asyncio.run(check())
        assert h.startswith("$2b$"), h[:10]

    def test_httponly_cookies(self):
        import requests
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": CREDS["office"][0], "password": CREDS["office"][1]}, timeout=30)
        assert r.status_code == 200
        raw = "; ".join(r.headers.get_all("Set-Cookie")) if hasattr(r.headers, "get_all") else str(r.headers)
        assert "access_token" in raw and "HttpOnly" in raw and "Secure" in raw, raw[:300]
        assert "refresh_token" in raw

    def test_refresh_and_logout(self, ):
        s = login(*CREDS["office"])
        assert s.post(f"{API}/auth/refresh", timeout=30).status_code == 200
        assert s.post(f"{API}/auth/logout", timeout=30).status_code == 200
        assert s.get(f"{API}/auth/me", timeout=30).status_code == 401

    def test_bad_login_401_then_lockout(self):
        import requests
        s = requests.Session()
        email = "qa_lockout_probe@maxxdoors.com"
        codes = []
        for _ in range(6):
            r = s.post(f"{API}/auth/login", json={"email": email, "password": "wrongpass"}, timeout=30)
            codes.append(r.status_code)
            time.sleep(0.2)
        assert codes[0] == 401, codes
        assert 429 in codes, (
            "no brute-force lockout via public URL: lockout key uses request.client.host "
            f"which rotates behind the ingress. codes={codes}")

    def test_change_password_validation(self, office):
        r = office.post(f"{API}/auth/change-password",
                        json={"current_password": "definitely-wrong", "new_password": "Whatever!2026"}, timeout=30)
        assert r.status_code == 400
        r2 = office.post(f"{API}/auth/change-password",
                         json={"current_password": CREDS["office"][1], "new_password": "short"}, timeout=30)
        assert r2.status_code == 400

    def test_cors_credentials(self):
        import requests
        origin = os.environ.get("FRONTEND_URL", "https://website-pro-35.preview.emergentagent.com")
        # app-level CORS (edge proxy rewrites headers on the public URL, so assert on the app itself)
        r = requests.post("http://localhost:8001/api/auth/login", headers={"Origin": origin},
                          json={"email": CREDS["office"][0], "password": CREDS["office"][1]}, timeout=30)
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-credentials") == "true", dict(r.headers)
        assert r.headers.get("access-control-allow-origin") == origin, r.headers.get("access-control-allow-origin")


# ---------- chat smoke ----------
class TestChat:
    def test_chat_stream(self, office):
        r = office.post(f"{API}/chat", json={"message": "In one word, say hi"},
                        timeout=120, stream=True)
        assert r.status_code == 200, r.text[:300]
        chunks = []
        for line in r.iter_lines(decode_unicode=True):
            if line:
                chunks.append(line)
            if len(chunks) > 5:
                break
        assert chunks, "no SSE data received from /api/chat"
