"""
Facilities service: manage building/floor/seat records.

Create, update, and delete are restricted to FACILITY_ADMIN. Read access
is open to any authenticated user, since employees need to pick a
facility when filing an incident.
"""

import json
import logging
import os

from auth import AuthError, decode_token, get_bearer_token, require_role
from postgres_service import (
    create_facility,
    delete_facility,
    get_connection,
    get_facility,
    list_facilities,
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
    """POST /facilities - creates a facility (FACILITY_ADMIN only)."""
    require_role(_authenticate(event), "FACILITY_ADMIN")

    data = _parse_body(event)
    _require_fields(data, "building", "floor")
    facility = create_facility(conn, data["building"].strip(), data["floor"].strip(), (data.get("seat") or "").strip() or None)
    return _response(201, {"facility": facility})


def handle_list(conn, event: dict) -> dict:
    """GET /facilities - lists all facilities (any authenticated user)."""
    _authenticate(event)
    return _response(200, {"facilities": list_facilities(conn)})


def handle_get(conn, event: dict, facility_id: int) -> dict:
    """GET /facilities/{id} - fetches one facility (any authenticated user)."""
    _authenticate(event)
    facility = get_facility(conn, facility_id)
    if not facility:
        return _error(404, "Facility not found")
    return _response(200, {"facility": facility})


def handle_update(conn, event: dict, facility_id: int) -> dict:
    """PUT /facilities/{id} - updates a facility (FACILITY_ADMIN only)."""
    require_role(_authenticate(event), "FACILITY_ADMIN")

    data = _parse_body(event)
    _require_fields(data, "building", "floor")
    facility = update_facility(conn, facility_id, data["building"].strip(), data["floor"].strip(), (data.get("seat") or "").strip() or None)
    if not facility:
        return _error(404, "Facility not found")
    return _response(200, {"facility": facility})


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
        POST   /facilities      - create a facility (FACILITY_ADMIN only)
        GET    /facilities      - list all facilities
        GET    /facilities/{id} - get a facility
        PUT    /facilities/{id} - update a facility (FACILITY_ADMIN only)
        DELETE /facilities/{id} - delete a facility (FACILITY_ADMIN only)

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
        if method == "GET" and path == "/":
            return handle_list(conn, event)
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
