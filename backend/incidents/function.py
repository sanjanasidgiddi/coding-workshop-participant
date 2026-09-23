"""
Incidents service: create/list/view incidents and drive the
assignment/status workflow (assign engineer, update priority, update
status, mark blocked, resolve/close).
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone

# LocalStack's hot-reload mounts this service's own folder directly, so its
# dependencies/ subfolder (pip packages installed by bin/start-dev.sh) must
# be added to sys.path before importing local modules that need them
# (auth.py needs PyJWT, postgres_service.py needs psycopg).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "dependencies"))

from auth import AuthError, decode_token, get_bearer_token
from postgres_service import (
    ALLOWED_PRIORITIES,
    ALLOWED_STATUSES,
    create_incident,
    facility_exists,
    get_connection,
    get_incident,
    list_incidents,
    update_incident,
    user_has_role,
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

_SORTABLE_COLUMNS = ("created_at", "updated_at", "priority")
_FILTERABLE_INT_COLUMNS = ("assigned_engineer_id", "employee_id", "facility_id")


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
    (payload format 2.0), normalizing away the "/api/incidents" prefix
    CloudFront leaves in place versus the local dev proxy, which strips it.
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod", "GET")
    path = event.get("rawPath") or event.get("path") or "/"

    for prefix in ("/api/incidents", "/incidents"):
        if path.startswith(prefix):
            path = path[len(prefix):] or "/"
            break

    return method.upper(), path


def _parse_incident_id(path: str) -> int:
    """Parses "/{id}" into an int, raising ValueError if it isn't one."""
    segment = path.strip("/")
    if not segment.isdigit():
        raise ValueError(f"Invalid incident id: {segment}")
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
    """Validates the bearer token and returns its claims."""
    return decode_token(get_bearer_token(event))


def handle_create(conn, event: dict) -> dict:
    """POST /incidents - creates an incident (EMPLOYEE only, owned by the caller)."""
    claims = _authenticate(event)
    if claims.get("role") != "EMPLOYEE":
        raise AuthError("Only employees can create incidents", 403)

    data = _parse_body(event)
    _require_fields(data, "title", "priority", "facility_id")

    priority = data["priority"].strip().upper()
    if priority not in ALLOWED_PRIORITIES:
        raise ValueError(f"Priority must be one of: {', '.join(ALLOWED_PRIORITIES)}")

    try:
        facility_id = int(data["facility_id"])
    except (TypeError, ValueError):
        raise ValueError("facility_id must be an integer")
    if not facility_exists(conn, facility_id):
        raise ValueError(f"Facility {facility_id} does not exist")

    incident = create_incident(
        conn,
        title=data["title"].strip(),
        description=(data.get("description") or "").strip() or None,
        category=(data.get("category") or "").strip() or None,
        priority=priority,
        employee_id=int(claims["sub"]),
        facility_id=facility_id,
    )
    return _response(201, {"incident": incident})


def _parse_filters(event: dict, claims: dict) -> dict:
    """Builds the filters dict for list_incidents, scoped by the caller's role."""
    params = event.get("queryStringParameters") or {}
    filters = {}

    for column in _FILTERABLE_INT_COLUMNS:
        if params.get(column):
            try:
                filters[column] = int(params[column])
            except ValueError:
                raise ValueError(f"{column} must be an integer")

    if params.get("status"):
        status = params["status"].strip().upper()
        if status not in ALLOWED_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(ALLOWED_STATUSES)}")
        filters["status"] = status

    if params.get("priority"):
        priority = params["priority"].strip().upper()
        if priority not in ALLOWED_PRIORITIES:
            raise ValueError(f"priority must be one of: {', '.join(ALLOWED_PRIORITIES)}")
        filters["priority"] = priority

    if params.get("category"):
        filters["category"] = params["category"].strip()

    # Role-based scoping overrides whatever the caller asked for.
    role = claims.get("role")
    if role == "EMPLOYEE":
        filters["employee_id"] = int(claims["sub"])
    elif role == "ENGINEER":
        filters["assigned_engineer_id"] = int(claims["sub"])

    return filters


def handle_list(conn, event: dict) -> dict:
    """GET /incidents - lists incidents, filtered/sorted/searched, scoped by role."""
    claims = _authenticate(event)
    params = event.get("queryStringParameters") or {}

    filters = _parse_filters(event, claims)
    search = (params.get("q") or "").strip() or None

    sort_by = (params.get("sort_by") or "created_at").strip().lower()
    if sort_by not in _SORTABLE_COLUMNS:
        raise ValueError(f"sort_by must be one of: {', '.join(_SORTABLE_COLUMNS)}")

    order = (params.get("order") or "desc").strip().lower()
    if order not in ("asc", "desc"):
        raise ValueError("order must be 'asc' or 'desc'")

    incidents = list_incidents(conn, filters, search, sort_by, order)
    return _response(200, {"incidents": incidents})


def _authorize_view(claims: dict, incident: dict) -> None:
    """Raises AuthError(403) unless the caller may view this incident."""
    role = claims.get("role")
    user_id = int(claims["sub"])
    if role == "FACILITY_ADMIN":
        return
    if role == "EMPLOYEE" and incident["employee_id"] == user_id:
        return
    if role == "ENGINEER" and incident["assigned_engineer_id"] == user_id:
        return
    raise AuthError("You do not have access to this incident", 403)


def handle_get(conn, event: dict, incident_id: int) -> dict:
    """GET /incidents/{id} - fetches one incident, scoped by role."""
    claims = _authenticate(event)
    incident = get_incident(conn, incident_id)
    if not incident:
        return _error(404, "Incident not found")
    _authorize_view(claims, incident)
    return _response(200, {"incident": incident})


def handle_update(conn, event: dict, incident_id: int) -> dict:
    """
    PATCH /incidents/{id} - drives the assignment/status workflow.

    - priority, assigned_engineer_id: FACILITY_ADMIN only
    - status (IN_PROGRESS/BLOCKED/RESOLVED), blocked_reason: the assigned ENGINEER only
    - status = CLOSED: FACILITY_ADMIN only
    """
    claims = _authenticate(event)
    role = claims.get("role")
    user_id = int(claims["sub"])

    incident = get_incident(conn, incident_id)
    if not incident:
        return _error(404, "Incident not found")

    data = _parse_body(event)
    fields = {}

    if "priority" in data or "assigned_engineer_id" in data:
        if role != "FACILITY_ADMIN":
            raise AuthError("Only facility admins can update priority or assignment", 403)

        if "priority" in data:
            priority = data["priority"].strip().upper()
            if priority not in ALLOWED_PRIORITIES:
                raise ValueError(f"priority must be one of: {', '.join(ALLOWED_PRIORITIES)}")
            fields["priority"] = priority

        if "assigned_engineer_id" in data:
            try:
                engineer_id = int(data["assigned_engineer_id"])
            except (TypeError, ValueError):
                raise ValueError("assigned_engineer_id must be an integer")
            if not user_has_role(conn, engineer_id, "ENGINEER"):
                raise ValueError(f"User {engineer_id} is not an ENGINEER")
            fields["assigned_engineer_id"] = engineer_id

    if "status" in data:
        status = data["status"].strip().upper()
        if status not in ALLOWED_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(ALLOWED_STATUSES)}")

        if status == "CLOSED":
            if role != "FACILITY_ADMIN":
                raise AuthError("Only facility admins can close incidents", 403)
            fields["closed_at"] = datetime.now(timezone.utc)
        else:
            if role != "ENGINEER" or incident["assigned_engineer_id"] != user_id:
                raise AuthError("Only the assigned engineer can update this status", 403)
            if status == "BLOCKED":
                blocked_reason = (data.get("blocked_reason") or "").strip()
                if not blocked_reason:
                    raise ValueError("blocked_reason is required when status is BLOCKED")
                fields["blocked_reason"] = blocked_reason
            else:
                fields["blocked_reason"] = None
            if status == "RESOLVED":
                fields["resolved_at"] = datetime.now(timezone.utc)

        fields["status"] = status
    elif "blocked_reason" in data:
        raise ValueError("blocked_reason can only be set together with status=BLOCKED")

    if not fields:
        raise ValueError("No updatable fields provided")

    updated = update_incident(conn, incident_id, fields)
    return _response(200, {"incident": updated})


def handler(event=None, context=None):
    """
    Incidents service Lambda entry point.

    Routes:
        POST  /incidents      - create an incident (EMPLOYEE only)
        GET   /incidents      - list incidents (filter/sort/search, role-scoped)
        GET   /incidents/{id} - get an incident (role-scoped)
        PATCH /incidents/{id} - assign engineer / update priority / update status

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
            return handle_get(conn, event, _parse_incident_id(path))
        if method == "PATCH" and path != "/":
            return handle_update(conn, event, _parse_incident_id(path))

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
