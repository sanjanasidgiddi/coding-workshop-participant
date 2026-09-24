"""
Notes service tests: create/list and the incident-based authorization rules
(own incident / assigned incident / any incident for admins).
"""

import json

import pytest
import requests

from conftest import PROXY_BASE, make_event, make_token, register_and_login


# --- Unit: handler logic in isolation, postgres_service mocked out ---------

@pytest.mark.unit
@pytest.mark.error_handling
def test_create_rejects_blank_note(unit_service, monkeypatch):
    notes = unit_service("notes")
    monkeypatch.setattr(
        notes, "get_incident_summary",
        lambda conn, incident_id: {"employee_id": 1, "assigned_engineer_id": None, "status": "OPEN"},
    )
    event = make_event("POST", "/", body={"incident_id": 1, "note": "   "}, token=make_token(1, "EMPLOYEE"))
    resp = notes.handler(event)
    assert resp["statusCode"] == 400
    assert "note" in json.loads(resp["body"])["error"].lower()


@pytest.mark.unit
@pytest.mark.error_handling
def test_create_rejects_unrelated_employee(unit_service, monkeypatch):
    """An employee who doesn't own the incident gets 403, not a leak of
    whether the incident even exists."""
    notes = unit_service("notes")
    monkeypatch.setattr(
        notes, "get_incident_summary",
        lambda conn, incident_id: {"employee_id": 999, "assigned_engineer_id": None, "status": "OPEN"},
    )
    event = make_event("POST", "/", body={"incident_id": 1, "note": "hello"}, token=make_token(1, "EMPLOYEE"))
    resp = notes.handler(event)
    assert resp["statusCode"] == 403


@pytest.mark.unit
def test_create_rejects_employee_note_on_closed_incident(unit_service, monkeypatch):
    notes = unit_service("notes")
    monkeypatch.setattr(
        notes, "get_incident_summary",
        lambda conn, incident_id: {"employee_id": 1, "assigned_engineer_id": None, "status": "CLOSED"},
    )
    event = make_event("POST", "/", body={"incident_id": 1, "note": "hello"}, token=make_token(1, "EMPLOYEE"))
    resp = notes.handler(event)
    assert resp["statusCode"] == 403


@pytest.mark.unit
def test_list_missing_incident_returns_404(unit_service, monkeypatch):
    notes = unit_service("notes")
    monkeypatch.setattr(notes, "get_incident_summary", lambda conn, incident_id: None)
    event = make_event("GET", "/", token=make_token(1, "FACILITY_ADMIN"), query={"incident_id": "999999"})
    resp = notes.handler(event)
    assert resp["statusCode"] == 404


# --- Integration: real HTTP -> real LocalStack Lambda -> real Postgres ----

@pytest.mark.integration
def test_create_and_list_note(proxy_available, cleanup, run_id):
    if not proxy_available:
        pytest.skip("local dev stack (proxy/LocalStack/Postgres) is not running")

    admin_id, admin_token = register_and_login(cleanup, run_id, "FACILITY_ADMIN", "notesadmin")
    _, employee_token = register_and_login(cleanup, run_id, "EMPLOYEE", "notesemployee")
    building = f"Test{run_id}NotesBuilding"
    cleanup.register_building(building)

    bulk = requests.post(
        f"{PROXY_BASE}/facilities/bulk",
        json={"building": building, "floor_count": 1, "rooms_per_floor": 1},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    ).json()
    facility_id = bulk["created"][0]["id"]

    incident_id = requests.post(
        f"{PROXY_BASE}/incidents",
        json={"title": "Notes test incident", "priority": "LOW", "facility_id": facility_id},
        headers={"Authorization": f"Bearer {employee_token}"},
        timeout=15,
    ).json()["incident"]["id"]
    cleanup.register_incident(incident_id)

    created = requests.post(
        f"{PROXY_BASE}/notes",
        json={"incident_id": incident_id, "note": "Investigating now."},
        headers={"Authorization": f"Bearer {employee_token}"},
        timeout=15,
    )
    assert created.status_code == 201
    assert created.json()["note"]["note"] == "Investigating now."

    listed = requests.get(
        f"{PROXY_BASE}/notes?incident_id={incident_id}",
        headers={"Authorization": f"Bearer {employee_token}"},
        timeout=15,
    )
    assert listed.status_code == 200
    assert any(n["note"] == "Investigating now." for n in listed.json()["notes"])
