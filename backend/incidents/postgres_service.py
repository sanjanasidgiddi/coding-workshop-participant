"""
PostgreSQL connectivity and data access for the incidents service.

Reuses the module-level connection pooling pattern from
backend/_examples/python-service/postgres_service.py so a single
connection is shared across warm Lambda invocations.

Foreign keys to users/facilities are intentionally not enforced at the
database level: each service's table is created lazily on its own first
invocation with no guaranteed ordering between services, so an FK
constraint here could fail to create the incidents table if the users or
facilities service hasn't cold-started yet. Referential integrity
(facility exists, assigned engineer has role ENGINEER) is instead
checked in function.py before writes.
"""

from psycopg import connect

PG_CONN = None

ALLOWED_STATUSES = ("OPEN", "IN_PROGRESS", "BLOCKED", "RESOLVED", "CLOSED")
ALLOWED_PRIORITIES = ("LOW", "MEDIUM", "HIGH", "CRITICAL")

_COLUMNS = """
    id, title, description, category, status, priority, employee_id,
    assigned_engineer_id, facility_id, escalated, blocked_reason,
    created_at, updated_at, resolved_at, closed_at
"""


def get_connection(config: str):
    """
    Returns a pooled psycopg connection, reused across warm Lambda invocations.

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
    """Creates the incidents table if it does not already exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id BIGSERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT,
                status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED')),
                priority TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
                employee_id BIGINT NOT NULL,
                assigned_engineer_id BIGINT,
                facility_id BIGINT,
                escalated BOOLEAN NOT NULL DEFAULT FALSE,
                blocked_reason TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                resolved_at TIMESTAMPTZ,
                closed_at TIMESTAMPTZ
            );
        """)


def user_has_role(conn, user_id: int, role: str) -> bool:
    """Checks whether a user id exists with the given role (cross-service validation)."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM users WHERE id = %s AND role = %s;", (user_id, role))
        return cur.fetchone() is not None


def facility_exists(conn, facility_id: int) -> bool:
    """Checks whether a facility id exists (cross-service validation)."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM facilities WHERE id = %s;", (facility_id,))
        return cur.fetchone() is not None


def create_incident(conn, title: str, description: str | None, category: str | None,
                     priority: str, employee_id: int, facility_id: int) -> dict:
    """Inserts a new incident, owned by employee_id, and returns it."""
    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO incidents (title, description, category, priority, employee_id, facility_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING {_COLUMNS};
            """,
            (title, description, category, priority, employee_id, facility_id),
        )
        return _row_to_dict(cur.fetchone())


def get_incident(conn, incident_id: int) -> dict | None:
    """Fetches a single incident by id, or None if not found."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT {_COLUMNS} FROM incidents WHERE id = %s;", (incident_id,))
        row = cur.fetchone()
        return _row_to_dict(row) if row else None


def list_incidents(conn, filters: dict, search: str | None, sort_by: str, order: str) -> list:
    """
    Lists incidents matching filters, with optional title/description search.

    filters may include: status, priority, assigned_engineer_id, employee_id,
    facility_id, category. sort_by/order must already be validated by the
    caller (they're interpolated directly since column/direction names
    can't be passed as query parameters).
    """
    clauses = []
    params = []
    for column in ("status", "priority", "assigned_engineer_id", "employee_id", "facility_id", "category"):
        if filters.get(column) is not None:
            clauses.append(f"{column} = %s")
            params.append(filters[column])

    if search:
        clauses.append("(title ILIKE %s OR description ILIKE %s)")
        params.extend([f"%{search}%", f"%{search}%"])

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    with conn.cursor() as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM incidents {where_sql} ORDER BY {sort_by} {order};",
            params,
        )
        return [_row_to_dict(row) for row in cur.fetchall()]


def update_incident(conn, incident_id: int, fields: dict) -> dict | None:
    """
    Updates the given columns on an incident and bumps updated_at.

    `fields` keys must already be restricted by the caller to a known
    whitelist of incident columns - they are interpolated directly into
    the SET clause since column names can't be passed as query parameters.
    """
    set_clauses = [f"{column} = %s" for column in fields]
    params = list(fields.values()) + [incident_id]
    with conn.cursor() as cur:
        cur.execute(
            f"""
            UPDATE incidents
            SET {', '.join(set_clauses)}, updated_at = now()
            WHERE id = %s
            RETURNING {_COLUMNS};
            """,
            params,
        )
        row = cur.fetchone()
        return _row_to_dict(row) if row else None


def _row_to_dict(row) -> dict:
    return {
        "id": row[0],
        "title": row[1],
        "description": row[2],
        "category": row[3],
        "status": row[4],
        "priority": row[5],
        "employee_id": row[6],
        "assigned_engineer_id": row[7],
        "facility_id": row[8],
        "escalated": row[9],
        "blocked_reason": row[10],
        "created_at": row[11].isoformat(),
        "updated_at": row[12].isoformat(),
        "resolved_at": row[13].isoformat() if row[13] else None,
        "closed_at": row[14].isoformat() if row[14] else None,
    }
