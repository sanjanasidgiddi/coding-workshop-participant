"""
Users service: registration, login, and current-user retrieval.
"""

import json
import logging
import os
import re
import sys

# LocalStack's hot-reload mounts this service's own folder directly, so its
# dependencies/ subfolder (pip packages installed by bin/start-dev.sh) must
# be added to sys.path before importing local modules that need them
# (auth.py needs PyJWT, postgres_service.py needs psycopg, security.py
# needs bcrypt).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "dependencies"))

from auth import AuthError, decode_token, get_bearer_token, issue_token, require_role
from postgres_service import (
    ALLOWED_ROLES,
    create_user,
    get_connection,
    get_user_by_email,
    get_user_by_id,
    list_engineers,
)
from security import hash_password, verify_password

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

EMAIL_RE = re.compile(r"^[^@\s]+@acme\.inc$", re.IGNORECASE)


def _response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def _error(status_code: int, message: str) -> dict:
    return _response(status_code, {"error": message})


def _get_method_and_path(event: dict):
    """
    Extracts the HTTP method and path from a Lambda Function URL event
    (payload format 2.0): event["requestContext"]["http"]["method"] and
    event["rawPath"].

    CloudFront forwards the full "/api/users/..." path to this function's
    URL, while the local dev proxy (bin/proxy-server.js) strips the
    "/api/users" prefix before forwarding. Both cases are normalized here
    so routes are matched the same way locally and in the cloud.
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod", "GET")
    path = event.get("rawPath") or event.get("path") or "/"

    for prefix in ("/api/users", "/users"):
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


def _require_fields(data: dict, *fields: str) -> None:
    missing = [field for field in fields if not data.get(field)]
    if missing:
        raise ValueError(f"Missing required field(s): {', '.join(missing)}")


def handle_register(conn, event: dict) -> dict:
    """POST /register - creates a new user with an @acme.inc email address."""
    data = _parse_body(event)
    _require_fields(data, "name", "email", "password", "role")

    name = data["name"].strip()
    email = data["email"].strip().lower()
    password = data["password"]
    role = data["role"].strip().upper()

    if not EMAIL_RE.match(email):
        raise ValueError("Email must be a valid @acme.inc address")
    if role not in ALLOWED_ROLES:
        raise ValueError(f"Role must be one of: {', '.join(ALLOWED_ROLES)}")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if get_user_by_email(conn, email):
        return _error(409, "A user with this email already exists")

    user = create_user(conn, name, email, hash_password(password), role)
    return _response(201, {"user": user})


def handle_login(conn, event: dict) -> dict:
    """POST /login - authenticates a user and returns a signed access token."""
    data = _parse_body(event)
    _require_fields(data, "email", "password")

    email = data["email"].strip().lower()
    password = data["password"]

    user = get_user_by_email(conn, email)
    if not user or not user["active"] or not verify_password(password, user["password_hash"]):
        return _error(401, "Invalid email or password")

    token = issue_token(user["id"], user["role"])
    return _response(200, {
        "access_token": token,
        "token_type": "Bearer",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
        },
    })


def handle_me(conn, event: dict) -> dict:
    """GET /me - returns the currently authenticated user."""
    token = get_bearer_token(event)
    claims = decode_token(token)
    user = get_user_by_id(conn, int(claims["sub"]))
    if not user:
        return _error(404, "User not found")
    return _response(200, {"user": user})


def handle_engineers(conn, event: dict) -> dict:
    """GET /engineers - lists all ENGINEER users (FACILITY_ADMIN only)."""
    claims = decode_token(get_bearer_token(event))
    require_role(claims, "FACILITY_ADMIN")
    return _response(200, {"engineers": list_engineers(conn)})


def handler(event=None, context=None):
    """
    Users service Lambda entry point.

    Routes:
        POST /register   - create a new user
        POST /login       - authenticate and receive a signed access token
        GET  /me          - retrieve the currently authenticated user
        GET  /engineers   - list ENGINEER users (FACILITY_ADMIN only)

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

        if method == "POST" and path == "/register":
            return handle_register(conn, event)
        if method == "POST" and path == "/login":
            return handle_login(conn, event)
        if method == "GET" and path == "/me":
            return handle_me(conn, event)
        if method == "GET" and path == "/engineers":
            return handle_engineers(conn, event)

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
    print(handler({"requestContext": {"http": {"method": "GET"}}, "rawPath": "/me"}))
