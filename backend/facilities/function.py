"""
Facilities service: manage building/floor/room records.

Create, update, and delete are restricted to FACILITY_ADMIN. Read access
is open to any authenticated user, since employees need to pick a
facility when filing an incident.
"""

import json
import logging
import os
import sys

# LocalStack's hot-reload mounts this service's own folder directly, so its
# dependencies/ subfolder (pip packages installed by bin/start-dev.sh) must
# be added to sys.path before importing local modules that need them
# (auth.py needs PyJWT, postgres_service.py needs psycopg).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "dependencies"))

from auth import AuthError, decode_token, get_bearer_token, require_role
from postgres_service import (
    bulk_add_floors,
    bulk_add_rooms,
    building_has_floor,
    create_facility,
    delete_building,
    delete_facility,
    get_connection,
    get_facility,
    get_max_floor_number,
    get_max_room_index,
    list_building_summaries,
    list_buildings,
    list_facilities,
    list_floors,
    list_rooms,
    rename_building,
    update_facility,
)

# Configure logging for Lambda
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# PostgreSQL connection string built from environment variables with sensible defaults
PG_CONFIG = (
    f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
    f"port={os.getenv('POSTGRES_PORT', '5432')} "
    f"user={os.getenv('POSTGRES_USER', 'test')} "
    f"password={os.getenv('POSTGRES_PASS', 'test')} "
    f"dbname={os.getenv('POSTGRES_NAME', 'test')} "
    f"connect_timeout=15"
)


def _response(status_code: int, body=None) -> dict:
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body) if body is not None else "",
    }


def _error(status_code: int, message: str) -> dict:
    return _response(status_code, {"error": message})


def _get_method_and_path(event: dict):
    """
    Extracts the HTTP method and path from a Lambda Function URL event
    (payload format 2.0), normalizing away the "/api/facilities" prefix
    CloudFront leaves in place versus the local dev proxy, which strips it.
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod", "GET")
    path = event.get("rawPath") or event.get("path") or "/"

    for prefix in ("/api/facilities", "/facilities"):
        if path.startswith(prefix):
            path = path[len(prefix):] or "/"
            break

    return method.upper(), path


def _parse_facility_id(path: str) -> int:
    """Parses "/{id}" into an int, raising ValueError if it isn't one."""
    segment = path.strip("/")
    if not segment.isdigit():
        raise ValueError(f"Invalid facility id: {segment}")
    return int(segment)


def _parse_body(event: dict) -> dict:
    raw_body = event.get("body") or "{}"
    try:
        return json.loads(raw_body)
    except json.JSONDecodeError:
        raise ValueError("Request body must be valid JSON")


def _require_fields(data: dict, *fields: str) -> None:
    missing = [field for field in fields if not data.get(field)]
    if missing:
        raise ValueError(f"Missing required field(s): {', '.join(missing)}")


def _authenticate(event: dict) -> dict:
    """Validates the bearer token and returns its claims, regardless of role."""
    return decode_token(get_bearer_token(event))


def handle_create(conn, event: dict) -> dict:
    """POST /facilities - creates a facility (FACILITY_ADMIN only). Only building is required; floor and room are optional."""
    require_role(_authenticate(event), "FACILITY_ADMIN")

    data = _parse_body(event)
    _require_fields(data, "building")
    facility = create_facility(
        conn,
        data["building"].strip(),
        (data.get("floor") or "").strip() or None,
        (data.get("room") or "").strip() or None,
    )
    return _response(201, {"facility": facility})


def handle_list(conn, event: dict) -> dict:
    """GET /facilities - lists all facilities (any authenticated user)."""
    _authenticate(event)
    return _response(200, {"facilities": list_facilities(conn)})


def _query_param(event: dict, name: str) -> str:
    params = event.get("queryStringParameters") or {}
    return (params.get(name) or "").strip()


def handle_buildings(conn, event: dict) -> dict:
    """GET /facilities/buildings - distinct building names (any authenticated user)."""
    _authenticate(event)
    return _response(200, {"buildings": list_buildings(conn)})


# Floor is optional on a facility, but a query string can't carry a real
# `None` - the frontend sends this sentinel for "facilities in this building
# with no floor set", and we translate it back to NULL here.
NO_FLOOR_SENTINEL = "__NONE__"


def handle_floors(conn, event: dict) -> dict:
    """GET /facilities/floors?building=X - distinct floors in a building."""
    _authenticate(event)
    building = _query_param(event, "building")
    if not building:
        raise ValueError("Missing required query parameter: building")
    floors = [floor if floor is not None else NO_FLOOR_SENTINEL for floor in list_floors(conn, building)]
    return _response(200, {"floors": floors})


def handle_rooms(conn, event: dict) -> dict:
    """GET /facilities/rooms?building=X&floor=Y - rooms in a building/floor."""
    _authenticate(event)
    building = _query_param(event, "building")
    floor_param = _query_param(event, "floor")
    if not building or not floor_param:
        raise ValueError("Missing required query parameter(s): building, floor")
    floor = None if floor_param == NO_FLOOR_SENTINEL else floor_param
    return _response(200, {"rooms": list_rooms(conn, building, floor)})


_DEFAULT_SUMMARY_PAGE_SIZE = 10
_MAX_PAGE_SIZE = 100


def _parse_page(params: dict, default_page_size: int) -> tuple[int, int]:
    """Parses page/page_size query params, defaulting page to 1."""
    page = params.get("page") or "1"
    page_size = params.get("page_size") or str(default_page_size)
    try:
        page = int(page)
        page_size = int(page_size)
    except ValueError:
        raise ValueError("page and page_size must be integers")
    if page < 1:
        raise ValueError("page must be >= 1")
    if page_size < 1 or page_size > _MAX_PAGE_SIZE:
        raise ValueError(f"page_size must be between 1 and {_MAX_PAGE_SIZE}")
    return page, page_size


def handle_summary(conn, event: dict) -> dict:
    """GET /facilities/summary?page=&page_size= - paginated per-building floor/room counts (any authenticated user)."""
    _authenticate(event)
    params = event.get("queryStringParameters") or {}
    page, page_size = _parse_page(params, _DEFAULT_SUMMARY_PAGE_SIZE)

    buildings, total = list_building_summaries(conn, page, page_size)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return _response(200, {
        "buildings": buildings,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    })


def handle_rename_building(conn, event: dict) -> dict:
    """PUT /facilities/building - renames every row for one building (FACILITY_ADMIN only)."""
    require_role(_authenticate(event), "FACILITY_ADMIN")

    data = _parse_body(event)
    _require_fields(data, "building", "new_building")
    old_building = data["building"].strip()
    new_building = data["new_building"].strip()
    if not new_building:
        raise ValueError("new_building must not be blank")

    updated_count = rename_building(conn, old_building, new_building)
    return _response(200, {"building": new_building, "updated_count": updated_count})


def handle_delete_building(conn, event: dict) -> dict:
    """DELETE /facilities/building?building=X - deletes every row for one building (FACILITY_ADMIN only)."""
    require_role(_authenticate(event), "FACILITY_ADMIN")

    building = _query_param(event, "building")
    if not building:
        raise ValueError("Missing required query parameter: building")

    deleted_count = delete_building(conn, building)
    return _response(200, {"building": building, "deleted_count": deleted_count})


def handle_get(conn, event: dict, facility_id: int) -> dict:
    """GET /facilities/{id} - fetches one facility (any authenticated user)."""
    _authenticate(event)
    facility = get_facility(conn, facility_id)
    if not facility:
        return _error(404, "Facility not found")
    return _response(200, {"facility": facility})


def handle_update(conn, event: dict, facility_id: int) -> dict:
    """PUT /facilities/{id} - updates a facility (FACILITY_ADMIN only). Only building is required; floor and room are optional."""
    require_role(_authenticate(event), "FACILITY_ADMIN")

    data = _parse_body(event)
    _require_fields(data, "building")
    facility = update_facility(
        conn,
        facility_id,
        data["building"].strip(),
        (data.get("floor") or "").strip() or None,
        (data.get("room") or "").strip() or None,
    )
    if not facility:
        return _error(404, "Facility not found")
    return _response(200, {"facility": facility})


_MAX_FLOORS_PER_BUILDING = 20
_MAX_ROOMS_PER_FLOOR = 100


def _nonneg_int(data: dict, field: str, max_value: int) -> int:
    """Parses an optional whole-number field (0 if absent/blank), rejecting floats, bools, and out-of-range values."""
    if field not in data or data[field] in (None, ""):
        return 0
    value = data[field]
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} must be a whole number")
    if value < 0 or value > max_value:
        raise ValueError(f"{field} must be between 0 and {max_value}")
    return value


def handle_bulk(conn, event: dict) -> dict:
    """
    POST /facilities/bulk - bulk-generates floor/room rows for a building
    (FACILITY_ADMIN only). Two mutually exclusive modes:

    - {"building": "...", "floor_count": N, "rooms_per_floor": M}
      Adds N new floors after the building's current highest floor, each
      optionally with M rooms. Works for a brand new building too (floors
      start at 1) and for adding more floors to an existing one.

    - {"building": "...", "floor": "3", "room_count": M}
      Adds M new rooms to an existing floor, after its current highest room.
    """
    require_role(_authenticate(event), "FACILITY_ADMIN")

    data = _parse_body(event)
    _require_fields(data, "building")
    building = data["building"].strip()
    if not building:
        raise ValueError("building must not be blank")

    if data.get("floor") not in (None, ""):
        if data.get("floor_count") not in (None, "") or data.get("rooms_per_floor") not in (None, ""):
            raise ValueError("Cannot combine 'floor' with 'floor_count'/'rooms_per_floor'")

        floor = str(data["floor"]).strip()
        if not floor.isdigit() or not (1 <= int(floor) <= _MAX_FLOORS_PER_BUILDING):
            raise ValueError(f"floor must be a whole number from 1 to {_MAX_FLOORS_PER_BUILDING}")
        if not building_has_floor(conn, building, floor):
            raise ValueError(f"Floor {floor} does not exist for building {building} - use floor_count to create it")

        room_count = _nonneg_int(data, "room_count", _MAX_ROOMS_PER_FLOOR)
        current_max_room = get_max_room_index(conn, building, int(floor))
        if current_max_room + room_count > _MAX_ROOMS_PER_FLOOR:
            raise ValueError(f"Adding {room_count} room(s) would exceed the maximum of {_MAX_ROOMS_PER_FLOOR} rooms per floor")

        created = bulk_add_rooms(conn, building, floor, room_count)
        requested_count = 2 + room_count  # building-level + floor-level bare rows, plus the new rooms
    else:
        floor_count = _nonneg_int(data, "floor_count", _MAX_FLOORS_PER_BUILDING)
        rooms_per_floor = _nonneg_int(data, "rooms_per_floor", _MAX_ROOMS_PER_FLOOR)
        if rooms_per_floor > 0 and floor_count == 0:
            raise ValueError("rooms_per_floor requires floor_count to be greater than 0")

        current_max_floor = get_max_floor_number(conn, building)
        if current_max_floor + floor_count > _MAX_FLOORS_PER_BUILDING:
            raise ValueError(f"Adding {floor_count} floor(s) would exceed the maximum of {_MAX_FLOORS_PER_BUILDING} floors per building")

        created = bulk_add_floors(conn, building, floor_count, rooms_per_floor)
        requested_count = 1 + floor_count + (floor_count * rooms_per_floor)  # building row + floor rows + room rows

    return _response(201, {
        "building": building,
        "created_count": len(created),
        "skipped_count": max(requested_count - len(created), 0),
        "created": created,
    })


def handle_delete(conn, event: dict, facility_id: int) -> dict:
    """DELETE /facilities/{id} - deletes a facility (FACILITY_ADMIN only)."""
    require_role(_authenticate(event), "FACILITY_ADMIN")

    if not delete_facility(conn, facility_id):
        return _error(404, "Facility not found")
    return _response(204)


def handler(event=None, context=None):
    """
    Facilities service Lambda entry point.

    Routes:
        POST   /facilities         - create a facility (FACILITY_ADMIN only)
        POST   /facilities/bulk    - bulk-generate floor/room rows (FACILITY_ADMIN only)
        GET    /facilities         - list all facilities
        GET    /facilities/buildings          - distinct building names
        GET    /facilities/floors?building=X  - distinct floors in a building
        GET    /facilities/rooms?building=X&floor=Y - rooms in a building/floor
        GET    /facilities/summary?page=&page_size= - paginated per-building floor/room counts
        PUT    /facilities/building - rename every row for one building (FACILITY_ADMIN only), body {building, new_building}
        DELETE /facilities/building?building=X - delete every row for one building (FACILITY_ADMIN only)
        GET    /facilities/{id}    - get a facility
        PUT    /facilities/{id}    - update a facility (FACILITY_ADMIN only)
        DELETE /facilities/{id}    - delete a facility (FACILITY_ADMIN only)

    Args:
        event (dict, optional): The Lambda event.
        context (object, optional): The Lambda context.

    Returns:
        dict: A response object with statusCode, headers, and body.
    """
    logger.debug("Received event: %s", event)
    logger.debug("Received context: %s", context)

    event = event or {}
    method, path = _get_method_and_path(event)

    try:
        conn = get_connection(PG_CONFIG)

        if method == "POST" and path == "/":
            return handle_create(conn, event)
        if method == "POST" and path == "/bulk":
            return handle_bulk(conn, event)
        if method == "GET" and path == "/":
            return handle_list(conn, event)
        if method == "GET" and path == "/buildings":
            return handle_buildings(conn, event)
        if method == "GET" and path == "/floors":
            return handle_floors(conn, event)
        if method == "GET" and path == "/rooms":
            return handle_rooms(conn, event)
        if method == "GET" and path == "/summary":
            return handle_summary(conn, event)
        if method == "PUT" and path == "/building":
            return handle_rename_building(conn, event)
        if method == "DELETE" and path == "/building":
            return handle_delete_building(conn, event)
        if method == "GET" and path != "/":
            return handle_get(conn, event, _parse_facility_id(path))
        if method == "PUT" and path != "/":
            return handle_update(conn, event, _parse_facility_id(path))
        if method == "DELETE" and path != "/":
            return handle_delete(conn, event, _parse_facility_id(path))

        return _error(404, f"No route for {method} {path}")

    except AuthError as e:
        return _error(e.status_code, str(e))
    except ValueError as e:
        return _error(400, str(e))
    except Exception as e:
        logger.error("Handler error: %s", str(e))
        return _error(500, "Internal server error")


# Main entry point for local testing
if __name__ == "__main__":
    print(handler({"requestContext": {"http": {"method": "GET"}}, "rawPath": "/"}))
