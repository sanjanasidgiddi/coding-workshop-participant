"""
Users service tests: register/login/me, mapped to docs/full-stack.md's
three backend categories (unit / integration / error-handling).
"""

import json

import pytest
import requests

from conftest import PROXY_BASE, make_event, make_token, register_and_login


# --- Unit: handler logic in isolation, postgres_service mocked out ---------

@pytest.mark.unit
def test_register_rejects_non_acme_email(unit_service):
    users = unit_service("users")
    event = make_event(
        "POST", "/register",
        body={"name": "X", "email": "x@gmail.com", "password": "verifypass123", "role": "EMPLOYEE"},
    )
    resp = users.handler(event)
    assert resp["statusCode"] == 400
    assert "acme.inc" in json.loads(resp["body"])["error"]


@pytest.mark.unit
def test_register_rejects_short_password(unit_service):
    users = unit_service("users")
    event = make_event(
        "POST", "/register",
        body={"name": "X", "email": "x@acme.inc", "password": "short", "role": "EMPLOYEE"},
    )
    resp = users.handler(event)
    assert resp["statusCode"] == 400
    assert "8 characters" in json.loads(resp["body"])["error"]


@pytest.mark.unit
def test_register_rejects_invalid_role(unit_service):
    users = unit_service("users")
    event = make_event(
        "POST", "/register",
        body={"name": "X", "email": "x@acme.inc", "password": "verifypass123", "role": "SUPERUSER"},
    )
    resp = users.handler(event)
    assert resp["statusCode"] == 400
    assert "Role must be one of" in json.loads(resp["body"])["error"]


@pytest.mark.unit
def test_register_success_is_mocked_end_to_end(unit_service, monkeypatch):
    """Handler validation + response shaping, with the DB layer mocked out
    entirely - no Postgres needed for this test."""
    users = unit_service("users")
    monkeypatch.setattr(users, "get_user_by_email", lambda conn, email: None)
    monkeypatch.setattr(
        users, "create_user",
        lambda conn, name, email, password_hash, role: {
            "id": 99, "name": name, "email": email, "role": role, "created_at": "2026-01-01T00:00:00+00:00",
        },
    )
    event = make_event(
        "POST", "/register",
        body={"name": "Fake User", "email": "fake.user@acme.inc", "password": "verifypass123", "role": "EMPLOYEE"},
    )
    resp = users.handler(event)
    assert resp["statusCode"] == 201
    assert json.loads(resp["body"])["user"]["email"] == "fake.user@acme.inc"


@pytest.mark.unit
def test_me_rejects_missing_token(unit_service):
    users = unit_service("users")
    event = make_event("GET", "/me")
    resp = users.handler(event)
    assert resp["statusCode"] == 401


@pytest.mark.unit
def test_me_rejects_invalid_token(unit_service):
    users = unit_service("users")
    event = make_event("GET", "/me", token="not-a-real-jwt")
    resp = users.handler(event)
    assert resp["statusCode"] == 401


@pytest.mark.unit
def test_me_rejects_expired_token(unit_service):
    import time as _time
    import jwt as _jwt
    from conftest import JWT_SECRET

    users = unit_service("users")
    expired = _jwt.encode(
        {"sub": "1", "role": "EMPLOYEE", "iat": int(_time.time()) - 7200, "exp": int(_time.time()) - 3600},
        JWT_SECRET, algorithm="HS256",
    )
    event = make_event("GET", "/me", token=expired)
    resp = users.handler(event)
    assert resp["statusCode"] == 401
    assert "expired" in json.loads(resp["body"])["error"].lower()


@pytest.mark.unit
def test_engineers_endpoint_rejects_non_admin(unit_service):
    users = unit_service("users")
    event = make_event("GET", "/engineers", token=make_token(1, "EMPLOYEE"))
    resp = users.handler(event)
    assert resp["statusCode"] == 403


@pytest.mark.unit
def test_engineers_endpoint_rejects_invalid_roles_param(unit_service):
    users = unit_service("users")
    event = make_event("GET", "/engineers", token=make_token(1, "FACILITY_ADMIN"), query={"roles": "BOGUS"})
    resp = users.handler(event)
    assert resp["statusCode"] == 400


# --- Integration: real HTTP -> real LocalStack Lambda -> real Postgres ----

@pytest.mark.integration
def test_register_login_me_round_trip(proxy_available, cleanup, run_id):
    if not proxy_available:
        pytest.skip("local dev stack (proxy/LocalStack/Postgres) is not running")

    user_id, token = register_and_login(cleanup, run_id, "EMPLOYEE", "roundtrip")

    resp = requests.get(f"{PROXY_BASE}/users/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert resp.status_code == 200
    body = resp.json()["user"]
    assert body["id"] == user_id
    assert body["role"] == "EMPLOYEE"
    assert "password" not in body
    assert "password_hash" not in body


@pytest.mark.integration
@pytest.mark.error_handling
def test_duplicate_registration_returns_409(proxy_available, cleanup, run_id):
    if not proxy_available:
        pytest.skip("local dev stack (proxy/LocalStack/Postgres) is not running")

    email = f"test.{run_id}.dup@acme.inc"
    cleanup.register_user(email)
    payload = {"name": "Dup", "email": email, "password": "verifypass123", "role": "EMPLOYEE"}

    first = requests.post(f"{PROXY_BASE}/users/register", json=payload, timeout=15)
    assert first.status_code == 201

    second = requests.post(f"{PROXY_BASE}/users/register", json=payload, timeout=15)
    assert second.status_code == 409


@pytest.mark.integration
@pytest.mark.error_handling
def test_invalid_login_credentials_return_401(proxy_available, cleanup, run_id):
    if not proxy_available:
        pytest.skip("local dev stack (proxy/LocalStack/Postgres) is not running")

    email = f"test.{run_id}.badlogin@acme.inc"
    cleanup.register_user(email)
    requests.post(
        f"{PROXY_BASE}/users/register",
        json={"name": "Bad Login", "email": email, "password": "verifypass123", "role": "EMPLOYEE"},
        timeout=15,
    )

    resp = requests.post(f"{PROXY_BASE}/users/login", json={"email": email, "password": "wrong-password"}, timeout=15)
    assert resp.status_code == 401
    assert "error" in resp.json()
