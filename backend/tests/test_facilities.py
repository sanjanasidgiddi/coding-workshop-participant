"""
Facilities service tests: create/summary, ownership enforcement, and the
20-floor/100-room bulk limits.
"""

import json

import pytest
import requests

from conftest import PROXY_BASE, make_event, make_token, register_and_login


# --- Unit: handler logic in isolation, postgres_service mocked out ---------

@pytest.mark.unit
def test_create_facility_requires_admin_role(unit_service):
    facilities = unit_service("facilities")
    event = make_event("POST", "/", body={"building": "X"}, token=make_token(1, "EMPLOYEE"))
    resp = facilities.handler(event)
    assert resp["statusCode"] == 403


@pytest.mark.unit
def test_create_facility_success_is_mocked(unit_service, monkeypatch):
    """Handler validation + response shaping, DB layer mocked - proves the
    admin's JWT sub (not the request body) is what gets used as owner."""
    facilities = unit_service("facilities")
    captured = {}

    def fake_create_facility(conn, building, floor, room, created_by_user_id):
        captured["created_by_user_id"] = created_by_user_id
        return {"id": 1, "building": building, "floor": floor, "room": room, "created_at": "2026-01-01T00:00:00+00:00"}

    monkeypatch.setattr(facilities, "create_facility", fake_create_facility)
    event = make_event("POST", "/", body={"building": "Unit Test Bldg"}, token=make_token(42, "FACILITY_ADMIN"))
    resp = facilities.handler(event)

    assert resp["statusCode"] == 201
    assert json.loads(resp["body"])["facility"]["building"] == "Unit Test Bldg"
    assert captured["created_by_user_id"] == 42


@pytest.mark.unit
@pytest.mark.error_handling
def test_bulk_rejects_floor_count_over_limit(unit_service):
    facilities = unit_service("facilities")
    event = make_event(
        "POST", "/bulk",
        body={"building": "Any Bldg", "floor_count": 21},
        token=make_token(1, "FACILITY_ADMIN"),
    )
    resp = facilities.handler(event)
    assert resp["statusCode"] == 400
    assert "20" in json.loads(resp["body"])["error"]


@pytest.mark.unit
@pytest.mark.error_handling
def test_bulk_rejects_room_count_over_limit(unit_service, monkeypatch):
    facilities = unit_service("facilities")
    # building_has_floor is a real DB lookup the handler does before
    # reaching the room_count limit check - stubbed true so this test
    # exercises only the pure validation logic, not Postgres.
    monkeypatch.setattr(facilities, "building_has_floor", lambda conn, building, floor: True)
    event = make_event(
        "POST", "/bulk",
        body={"building": "Any Bldg", "floor": "1", "room_count": 101},
        token=make_token(1, "FACILITY_ADMIN"),
    )
    resp = facilities.handler(event)
    assert resp["statusCode"] == 400
    assert "100" in json.loads(resp["body"])["error"]


# --- Integration: real HTTP -> real LocalStack Lambda -> real Postgres ----

@pytest.mark.integration
def test_summary_shows_only_owned_buildings_for_admin(proxy_available, cleanup, run_id):
    if not proxy_available:
        pytest.skip("local dev stack (proxy/LocalStack/Postgres) is not running")

    _, admin_a_token = register_and_login(cleanup, run_id, "FACILITY_ADMIN", "facadmin_a")
    _, admin_b_token = register_and_login(cleanup, run_id, "FACILITY_ADMIN", "facadmin_b")
    building_a = f"Test{run_id}BuildingA"
    building_b = f"Test{run_id}BuildingB"
    cleanup.register_building(building_a)
    cleanup.register_building(building_b)

    for building, token in ((building_a, admin_a_token), (building_b, admin_b_token)):
        resp = requests.post(
            f"{PROXY_BASE}/facilities/bulk",
            json={"building": building, "floor_count": 1, "rooms_per_floor": 1},
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert resp.status_code == 201, resp.text

    summary = requests.get(
        f"{PROXY_BASE}/facilities/summary?page_size=50",
        headers={"Authorization": f"Bearer {admin_a_token}"},
        timeout=15,
    ).json()
    by_name = {b["building"]: b for b in summary["buildings"]}
    assert by_name[building_a]["owned_by_me"] is True
    assert by_name[building_b]["owned_by_me"] is False


@pytest.mark.integration
@pytest.mark.error_handling
def test_non_owner_admin_cannot_rename_or_delete_building(proxy_available, cleanup, run_id):
    if not proxy_available:
        pytest.skip("local dev stack (proxy/LocalStack/Postgres) is not running")

    _, owner_token = register_and_login(cleanup, run_id, "FACILITY_ADMIN", "owner")
    _, intruder_token = register_and_login(cleanup, run_id, "FACILITY_ADMIN", "intruder")
    building = f"Test{run_id}OwnedBuilding"
    cleanup.register_building(building)

    create = requests.post(
        f"{PROXY_BASE}/facilities/bulk",
        json={"building": building, "floor_count": 1, "rooms_per_floor": 1},
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )
    assert create.status_code == 201

    rename = requests.put(
        f"{PROXY_BASE}/facilities/building",
        json={"building": building, "new_building": "Hijacked"},
        headers={"Authorization": f"Bearer {intruder_token}"},
        timeout=15,
    )
    assert rename.status_code == 403

    delete = requests.delete(
        f"{PROXY_BASE}/facilities/building?building={building}",
        headers={"Authorization": f"Bearer {intruder_token}"},
        timeout=15,
    )
    assert delete.status_code == 403

    # the true owner can still manage it - proves the 403 above is
    # ownership-specific, not a general breakage
    owner_delete = requests.delete(
        f"{PROXY_BASE}/facilities/building?building={building}",
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )
    assert owner_delete.status_code == 200
