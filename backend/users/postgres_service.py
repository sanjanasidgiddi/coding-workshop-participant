"""
PostgreSQL connectivity and data access for the users service.

Reuses the module-level connection pooling pattern from
backend/_examples/python-service/postgres_service.py so a single
connection is shared across warm Lambda invocations.
"""

from psycopg import connect

# Module-level PostgreSQL connection for connection pooling across Lambda invocations.
# Persists between invocations within the same Lambda container.
PG_CONN = None

ALLOWED_ROLES = ("EMPLOYEE", "FACILITY_ADMIN", "ENGINEER")


def get_connection(config: str):
    """
    Returns a pooled psycopg connection, reused across warm Lambda invocations.

    On first use (or after a dropped connection) also ensures the users
    table exists, since this repository has no separate migration tooling.

    Args:
        config (str): psycopg connection string.

    Returns:
        psycopg.Connection: an open, autocommit connection.

    Raises:
        Exception: if the connection cannot be established.
    """
    global PG_CONN
    try:
        if PG_CONN is None or PG_CONN.closed:
            PG_CONN = connect(config, autocommit=True)
            ensure_schema(PG_CONN)
        return PG_CONN
    except Exception as e:
        print("PostgreSQL error: %s", str(e))
        PG_CONN = None
        raise


def ensure_schema(conn) -> None:
    """Creates the users table if it does not already exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id BIGSERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('EMPLOYEE', 'FACILITY_ADMIN', 'ENGINEER')),
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)


def create_user(conn, name: str, email: str, password_hash: str, role: str) -> dict:
    """Inserts a new user and returns its public fields."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (name, email, password_hash, role)
            VALUES (%s, %s, %s, %s)
            RETURNING id, name, email, role, created_at;
            """,
            (name, email, password_hash, role),
        )
        row = cur.fetchone()
        return {
            "id": row[0],
            "name": row[1],
            "email": row[2],
            "role": row[3],
            "created_at": row[4].isoformat(),
        }


def get_user_by_email(conn, email: str) -> dict | None:
    """Fetches a user (including password_hash) by email, or None if not found."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, email, password_hash, role, active, created_at
            FROM users
            WHERE email = %s;
            """,
            (email,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "name": row[1],
            "email": row[2],
            "password_hash": row[3],
            "role": row[4],
            "active": row[5],
            "created_at": row[6].isoformat(),
        }


def list_engineers(conn, roles: tuple[str, ...] = ("ENGINEER",)) -> list:
    """Fetches all users whose role is in `roles` (every field but
    password_hash). Defaults to ENGINEER only, for the admin-only
    incident-assignment dropdown; the admin People directory reuses this
    same function/endpoint with roles=(EMPLOYEE, ENGINEER)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, email, role, active, created_at
            FROM users
            WHERE role = ANY(%s)
            ORDER BY role, name;
            """,
            (list(roles),),
        )
        return [
            {
                "id": row[0],
                "name": row[1],
                "email": row[2],
                "role": row[3],
                "active": row[4],
                "created_at": row[5].isoformat(),
            }
            for row in cur.fetchall()
        ]


def get_user_by_id(conn, user_id: int) -> dict | None:
    """Fetches a user's public fields by id, or None if not found."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, email, role, active, created_at
            FROM users
            WHERE id = %s;
            """,
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "name": row[1],
            "email": row[2],
            "role": row[3],
            "active": row[4],
            "created_at": row[5].isoformat(),
        }
