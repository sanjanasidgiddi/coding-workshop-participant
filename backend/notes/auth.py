"""
Reusable authentication/authorization helpers for signed access tokens.

This module only depends on PyJWT (no database access), so it can be
copied into other backend services the same way postgres_service.py is
copied between services, letting them verify tokens issued here and
enforce role checks without duplicating this logic.
"""

import os
import time

import jwt

# Shared signing secret, following this repo's env-var-with-local-default
# convention (see PG_CONFIG in backend/_examples/python-service/function.py).
# Every service that issues or verifies tokens must be configured with the
# same JWT_SECRET value.
JWT_SECRET = os.getenv("JWT_SECRET", "local-dev-secret-change-me-please-32-bytes-min")
JWT_ALGORITHM = "HS256"
JWT_TTL_SECONDS = 8 * 60 * 60  # 8 hours


class AuthError(Exception):
    """Raised for authentication/authorization failures; carries an HTTP status code."""

    def __init__(self, message: str, status_code: int = 401):
        super().__init__(message)
        self.status_code = status_code


def issue_token(user_id: int, role: str) -> str:
    """Creates a signed access token containing the user id and role claims."""
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + JWT_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decodes and validates a signed access token, returning its claims."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise AuthError("Token has expired", 401)
    except jwt.InvalidTokenError:
        raise AuthError("Invalid token", 401)


def get_bearer_token(event: dict) -> str:
    """Extracts the bearer token from the Authorization header of a Lambda event."""
    headers = event.get("headers") or {}
    # Lambda Function URL (payload v2.0) headers are lowercased, but a
    # local proxy or direct invoke may send any casing (e.g. "Authorization"),
    # so match the header name case-insensitively rather than assuming one form.
    auth_header = next(
        (value for key, value in headers.items() if key.lower() == "authorization"),
        None,
    )
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise AuthError("Missing or invalid Authorization header", 401)
    return auth_header.split(" ", 1)[1].strip()


def require_role(claims: dict, *allowed_roles: str) -> dict:
    """Raises AuthError(403) if the token's role is not among allowed_roles."""
    if claims.get("role") not in allowed_roles:
        raise AuthError("Insufficient permissions for this action", 403)
    return claims
