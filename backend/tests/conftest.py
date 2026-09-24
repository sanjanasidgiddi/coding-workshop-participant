"""
Shared fixtures/helpers for the backend test suite.

Two kinds of tests share this file:

- Unit tests import a service's `function.py` directly (via `load_service`)
  and call its `handler()`/`handle_*` functions in isolation, mocking out
  `postgres_service` calls where a real DB would otherwise be required.
- Integration tests go through the real local stack: real HTTP calls to the
  CORS proxy (http://localhost:3001), which forwards to the real LocalStack
  Lambda, which talks to the real local Postgres. These tests are skipped
  automatically if that stack isn't running (see `proxy_available`).

All integration test data is created with a unique per-session prefix and
torn down by exact email/building/id in a fixture finalizer - demo data
(anything not created by this test run) is never touched.
"""

import importlib
import os
import sys
import time
import uuid

import jwt
import psycopg
import pytest
import requests

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROXY_BASE = os.getenv("TEST_API_BASE", "http://localhost:3001/api")

# Matches auth.py's own fallback in every service - this is the checked-in
# local-dev default, not a real secret, so tests can mint tokens without
# needing the running services' actual (identical) value.
JWT_SECRET = os.getenv("JWT_SECRET", "local-dev-secret-change-me-please-32-bytes-min")

PG_DSN = "host=localhost port=5432 user=postgres password=postgres123 dbname=postgres"


def load_service(name: str):
    """
    Freshly imports {name}'s function.py (and, transitively, its own
    postgres_service.py/auth.py/security.py), isolated from another
    service's same-named modules already cached in sys.modules - all 4
    services have modules literally named `function`/`postgres_service`/
    `auth`, so the cache must be cleared before each load or a previously
    loaded service's module would be reused by mistake.
    """
    service_dir = os.path.join(BACKEND_DIR, name)
    deps_dir = os.path.join(service_dir, "dependencies")
    for mod in ("function", "postgres_service", "auth", "security"):
        sys.modules.pop(mod, None)
    sys.path.insert(0, deps_dir)
    sys.path.insert(0, service_dir)
    try:
        return importlib.import_module("function")
    finally:
        sys.path.remove(service_dir)
        sys.path.remove(deps_dir)


@pytest.fixture
def unit_service(monkeypatch):
    """Loads a service's function.py for a true unit test. Every handler()
    calls get_connection() unconditionally before routing/auth, so it's
    stubbed here to guarantee no real DB connection is ever attempted -
    individual postgres_service functions are then mocked per-test as
    needed via the same `monkeypatch` fixture."""

    def _load(name: str):
        module = load_service(name)
        monkeypatch.setattr(module, "get_connection", lambda config: None)
        return module

    return _load


def make_token(user_id: int, role: str) -> str:
    """Mints a JWT identical in shape to auth.issue_token, for unit tests
    that need a valid Authorization header without spinning up a service."""
    now = int(time.time())
    payload = {"sub": str(user_id), "role": role, "iat": now, "exp": now + 3600}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def make_event(method: str, path: str, body=None, token: str | None = None, query: dict | None = None) -> dict:
    """Builds a Lambda Function URL (payload v2.0) event, matching what
    _get_method_and_path/_parse_body/get_bearer_token expect."""
    import json as _json

    headers = {}
    if token:
        headers["authorization"] = f"Bearer {token}"
    return {
        "requestContext": {"http": {"method": method}},
        "rawPath": path,
        "headers": headers,
        "queryStringParameters": query,
        "body": _json.dumps(body) if body is not None else None,
    }


@pytest.fixture(scope="session")
def run_id() -> str:
    """Short unique id prefixing every throwaway record this test session
    creates, so cleanup can target exactly (and only) those records."""
    return uuid.uuid4().hex[:8]


@pytest.fixture(scope="session")
def proxy_available() -> bool:
    """Whether the local dev stack (CORS proxy -> LocalStack -> Postgres) is
    reachable. Integration tests skip themselves (rather than erroring) when
    it isn't, since they need the real running stack."""
    try:
        requests.get(f"{PROXY_BASE}/facilities/buildings", timeout=5)
        return True
    except requests.exceptions.RequestException:
        return False


@pytest.fixture(scope="session")
def pg_conn():
    """Direct Postgres connection, used only for test-data cleanup (there's
    no DELETE endpoint for users/incidents, and this is far more precise
    than trying to script cleanup through the API)."""
    conn = psycopg.connect(PG_DSN, autocommit=True)
    yield conn
    conn.close()


class Cleanup:
    """Collects exactly the rows a test run created, deleted in reverse
    order at session end. Never touches anything it didn't itself insert."""

    def __init__(self):
        self.user_emails = []
        self.incident_ids = []
        self.building_names = []

    def register_user(self, email):
        self.user_emails.append(email)

    def register_incident(self, incident_id):
        self.incident_ids.append(incident_id)

    def register_building(self, building):
        self.building_names.append(building)


@pytest.fixture(scope="session")
def cleanup():
    return Cleanup()


@pytest.fixture(scope="session", autouse=True)
def _cleanup_after_session(pg_conn, cleanup, proxy_available):
    yield
    if not proxy_available:
        return
    with pg_conn.cursor() as cur:
        if cleanup.incident_ids:
            cur.execute("DELETE FROM incident_notes WHERE incident_id = ANY(%s);", (cleanup.incident_ids,))
            cur.execute("DELETE FROM incidents WHERE id = ANY(%s);", (cleanup.incident_ids,))
        if cleanup.building_names:
            cur.execute("DELETE FROM facilities WHERE building = ANY(%s);", (cleanup.building_names,))
        if cleanup.user_emails:
            cur.execute("DELETE FROM users WHERE email = ANY(%s);", (cleanup.user_emails,))


def register_and_login(cleanup, run_id, role, suffix, password="TestPass123!"):
    """Registers a throwaway {role} user (tracked for cleanup) through the
    real API and returns (user_id, token)."""
    email = f"test.{run_id}.{suffix}@acme.inc"
    cleanup.register_user(email)
    resp = requests.post(
        f"{PROXY_BASE}/users/register",
        json={"name": f"Test {suffix}", "email": email, "password": password, "role": role},
        timeout=15,
    )
    assert resp.status_code == 201, resp.text
    user_id = resp.json()["user"]["id"]

    resp = requests.post(f"{PROXY_BASE}/users/login", json={"email": email, "password": password}, timeout=15)
    assert resp.status_code == 200, resp.text
    return user_id, resp.json()["access_token"]
