import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = BASE_URL + "/api"


def _creds():
    path = Path("/app/memory/test_credentials.md")
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    office_pw = re.search(r"Password:\s*(\S+)", text)
    return {
        "office": ("office@maxxdoors.com", office_pw.group(1) if office_pw else "MaxxOffice!2026"),
        "station_pw": "MaxxStation!2026",
    }


CREDS = _creds()


def login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Login failed for {email}: {r.status_code} {r.text[:300]}")
    return s


@pytest.fixture(scope="session")
def office():
    return login(*CREDS["office"])


@pytest.fixture(scope="session")
def operators():
    out = {}
    for st in ["core", "skin", "assembly", "press", "routing"]:
        out[st] = login(f"{st}@maxxdoors.com", CREDS["station_pw"])
    return out
