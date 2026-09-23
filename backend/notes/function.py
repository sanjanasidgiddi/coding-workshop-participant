"""
Incident notes service: add and list the chronological note/comment
history for an incident (employee comments, engineer progress updates,
admin updates).
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

from auth import AuthError, decode_token, get_bearer_token
from postgres_service import create_note, get_connection, get_incident_summary, get_user_name, list_notes

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
    (payload format 2.0), normalizing away the "/api/notes" prefix
    CloudFront leaves in place versus the local dev proxy, which strips it.
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod", "GET")
    path = event.get("rawPath") or event.get("path") or "/"

    for prefix in ("/api/notes", "/notes"):
        if path.startswith(prefix):
            path = path[len(prefix):] or "/"
            break

    return method.upper(), path


def _parse_body(event: dict) -> dict:
    raw_body = event.get("body") or "{}"
    try:
        return json.loads(raw_body)
    except json.JSONDecodeError:
        raise ValueError("Request body must be valid JSON")


def _authenticate(event: dict) -> dict:
    """Validates the bearer token and returns its claims."""
    return decode_token(get_bearer_token(event))


def _authorize_access(claims: dict, incident: dict) -> None:
    """Raises AuthError(403) unless the caller may view/note this incident."""
    role = claims.get("role")
    user_id = int(claims["sub"])
    if role == "FACILITY_ADMIN":
        return
    if role == "EMPLOYEE" and incident["employee_id"] == user_id:
        return
    if role == "ENGINEER" and incident["assigned_engineer_id"] == user_id:
        return
    raise AuthError("You do not have access to this incident", 403)


def handle_create(conn, event: dict) -> dict:
    """POST /notes - adds a note to an incident, scoped by role."""
    claims = _authenticate(event)
    role = claims.get("role")
    user_id = int(claims["sub"])

    data = _parse_body(event)
    if not data.get("incident_id"):
        raise ValueError("Missing required field(s): incident_id")
    note = (data.get("note") or "").strip()
    if not note:
        raise ValueError("Missing required field(s): note")

    try:
        incident_id = int(data["incident_id"])
    except (TypeError, ValueError):
        raise ValueError("incident_id must be an integer")

    incident = get_incident_summary(conn, incident_id)
    if not incident:
        return _error(404, "Incident not found")

    _authorize_access(claims, incident)
    if role == "EMPLOYEE" and incident["status"] == "CLOSED":
        raise AuthError("Cannot add notes to a closed incident", 403)

    author_name = get_user_name(conn, user_id)
    created = create_note(conn, incident_id, user_id, author_name, role, note)
    return _response(201, {"note": created})


def handle_list(conn, event: dict) -> dict:
    """GET /notes?incident_id=X - lists the chronological note history, scoped by role."""
    claims = _authenticate(event)
    params = event.get("queryStringParameters") or {}

    if not params.get("incident_id"):
        raise ValueError("Missing required query parameter: incident_id")
    try:
        incident_id = int(params["incident_id"])
    except ValueError:
        raise ValueError("incident_id must be an integer")

    incident = get_incident_summary(conn, incident_id)
    if not incident:
        return _error(404, "Incident not found")

    _authorize_access(claims, incident)
    return _response(200, {"notes": list_notes(conn, incident_id)})


def handler(event=None, context=None):
    """
    Incident notes service Lambda entry point.

    Routes:
        POST /notes                    - add a note to an incident
        GET  /notes?incident_id={id}   - list an incident's note history

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
    print(handler({"requestContext": {"http": {"method": "GET"}}, "rawPath": "/", "queryStringParameters": {"incident_id": "1"}}))
