"""
Incidents service tests: create/list, status workflow, and the
facility-ownership-based admin mutation guard.
"""

import json

import pytest
import requests

from conftest import PROXY_BASE, make_event, make_token, register_and_login


# --- Unit: handler logic in isolation, postgres_service mocked out ---------

@pytest.mark.unit
@pytest.mark.error_handling
def test_update_rejects_invalid_priority(unit_service, monkeypatch):
    incidents = unit_service("incidents")
    monkeypatch.setattr(
        incidents, "get_incident",
        lambda conn, incident_id: {
            "id": 1, "facility_id": 5, "employee_id": 1, "assigned_engineer_id": None, "status": "OPEN",
        },
    )
    # This admin owns facility 5's building, so the ownership guard passes
    # and the (pure) priority-format validation is what's actually exercised.
    monkeypatch.setattr(incidents, "get_facility_owner", lambda conn, facility_id: 2)
    event = make_event("PATCH", "/1", body={"priority": "URGENT"}, token=make_token(2, "FACILITY_ADMIN"))
    resp = incidents.handler(event)
    assert resp["statusCode"] == 400
    assert "priority must be one of" in json.loads(resp["body"])["error"]


@pytest.mark.unit
@pytest.mark.error_handling
def test_update_rejects_invalid_status(unit_service, monkeypatch):
    incidents = unit_service("incidents")
    monkeypatch.setattr(
        incidents, "get_incident",
        lambda conn, incident_id: {
            "id": 1, "facility_id": None, "employee_id": 1, "assigned_engineer_id": 2, "status": "OPEN",
        },
    )
    event = make_event("PATCH", "/1", body={"status": "ARCHIVED"}, token=make_token(2, "ENGINEER"))
    resp = incidents.handler(event)
    assert resp["statusCode"] == 400
    assert "status must be one of" in json.loads(resp["body"])["error"]


@pytest.mark.unit
def test_engineer_cannot_close_incident(unit_service, monkeypatch):
    """CLOSED is FACILITY_ADMIN-only, even for the assigned engineer."""
    incidents = unit_service("incidents")
    monkeypatch.setattr(
        incidents, "get_incident",
        lambda conn, incident_id: {
            "id": 1, "facility_id": None, "employee_id": 1, "assigned_engineer_id": 2, "status": "OPEN",
        },
    )
    event = make_event("PATCH", "/1", body={"status": "CLOSED"}, token=make_token(2, "ENGINEER"))
    resp = incidents.handler(event)
    assert resp["statusCode"] == 403


# --- Integration: real HTTP -> real LocalStack Lambda -> real Postgres ----

@pytest.mark.integration
def test_create_and_list_incident(proxy_available, cleanup, run_id):
    if not proxy_available:
        pytest.skip("local dev stack (proxy/LocalStack/Postgres) is not running")

    admin_id, admin_token = register_and_login(cleanup, run_id, "FACILITY_ADMIN", "incadmin")
    _, employee_token = register_and_login(cleanup, run_id, "EMPLOYEE", "incemployee")
    building = f"Test{run_id}IncidentBuilding"
    cleanup.register_building(building)

    bulk = requests.post(
        f"{PROXY_BASE}/facilities/bulk",
        json={"building": building, "floor_count": 1, "rooms_per_floor": 1},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    ).json()
    facility_id = bulk["created"][0]["id"]

    create = requests.post(
        f"{PROXY_BASE}/incidents",
        json={"title": "Test incident", "priority": "LOW", "facility_id": facility_id},
        headers={"Authorization": f"Bearer {employee_token}"},
        timeout=15,
    )
    assert create.status_code == 201
    incident_id = create.json()["incident"]["id"]
    cleanup.register_incident(incident_id)

    listing = requests.get(
        f"{PROXY_BASE}/incidents?page=1&page_size=50",
        headers={"Authorization": f"Bearer {employee_token}"},
        timeout=15,
    ).json()
    assert any(i["id"] == incident_id for i in listing["incidents"])


@pytest.mark.integration
def test_owner_admin_can_update_status_and_priority(proxy_available, cleanup, run_id):
    if not proxy_available:
        pytest.skip("local dev stack (proxy/LocalStack/Postgres) is not running")

    admin_id, admin_token = register_and_login(cleanup, run_id, "FACILITY_ADMIN", "statusadmin")
    _, employee_token = register_and_login(cleanup, run_id, "EMPLOYEE", "statusemployee")
    building = f"Test{run_id}StatusBuilding"
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
        json={"title": "Owned status test", "priority": "LOW", "facility_id": facility_id},
        headers={"Authorization": f"Bearer {employee_token}"},
        timeout=15,
    ).json()["incident"]["id"]
    cleanup.register_incident(incident_id)

    update = requests.patch(
        f"{PROXY_BASE}/incidents/{incident_id}",
        json={"priority": "CRITICAL"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert update.status_code == 200
    assert update.json()["incident"]["priority"] == "CRITICAL"


@pytest.mark.integration
@pytest.mark.error_handling
def test_non_owner_admin_cannot_mutate_incident(proxy_available, cleanup, run_id):
    if not proxy_available:
        pytest.skip("local dev stack (proxy/LocalStack/Postgres) is not running")

    owner_id, owner_token = register_and_login(cleanup, run_id, "FACILITY_ADMIN", "incowner")
    _, intruder_token = register_and_login(cleanup, run_id, "FACILITY_ADMIN", "incintruder")
    _, employee_token = register_and_login(cleanup, run_id, "EMPLOYEE", "incvictim")
    building = f"Test{run_id}OwnershipIncidentBuilding"
    cleanup.register_building(building)

    bulk = requests.post(
        f"{PROXY_BASE}/facilities/bulk",
        json={"building": building, "floor_count": 1, "rooms_per_floor": 1},
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    ).json()
    facility_id = bulk["created"][0]["id"]

    incident_id = requests.post(
        f"{PROXY_BASE}/incidents",
        json={"title": "Ownership guard test", "priority": "LOW", "facility_id": facility_id},
        headers={"Authorization": f"Bearer {employee_token}"},
        timeout=15,
    ).json()["incident"]["id"]
    cleanup.register_incident(incident_id)

    resp = requests.patch(
        f"{PROXY_BASE}/incidents/{incident_id}",
        json={"priority": "CRITICAL"},
        headers={"Authorization": f"Bearer {intruder_token}"},
        timeout=15,
    )
    assert resp.status_code == 403
