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

_COLUMN_NAMES = (
    "id", "title", "description", "category", "status", "priority", "employee_id",
    "assigned_engineer_id", "facility_id", "escalated", "blocked_reason",
    "created_at", "updated_at", "resolved_at", "closed_at",
)
_COLUMNS = ", ".join(_COLUMN_NAMES)
# `i.`-prefixed variant for queries that JOIN facilities (which also has a
# `created_at` column) - avoids an ambiguous-column error since `sort_by`
# can be "created_at".
_COLUMNS_I = ", ".join(f"i.{name}" for name in _COLUMN_NAMES)


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


def get_facility_owner(conn, facility_id: int) -> int | None:
    """Looks up the admin who owns a facility's building (cross-service
    query, same rationale as facility_exists/user_has_role - no FK, no
    shared code between services). None if the facility doesn't exist, or
    its building has no assigned owner (legacy data)."""
    with conn.cursor() as cur:
        cur.execute("SELECT created_by_user_id FROM facilities WHERE id = %s;", (facility_id,))
        row = cur.fetchone()
        return row[0] if row else None


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


def _build_where(filters: dict, search: str | None) -> tuple[str, list]:
    """Builds a WHERE clause + params from filters/search, shared by list/count/stats."""
    clauses = []
    params = []
    for column in ("status", "priority", "assigned_engineer_id", "employee_id", "facility_id", "category"):
        if filters.get(column) is not None:
            clauses.append(f"{column} = %s")
            params.append(filters[column])

    if filters.get("status_ne") is not None:
        clauses.append("status != %s")
        params.append(filters["status_ne"])

    if search:
        clauses.append("(title ILIKE %s OR description ILIKE %s)")
        params.extend([f"%{search}%", f"%{search}%"])

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where_sql, params


def list_incidents(conn, filters: dict, search: str | None, sort_by: str, order: str,
                    page: int, page_size: int, viewer_user_id: int | None = None) -> tuple[list, int]:
    """
    Lists one page of incidents matching filters, with optional title/description
    search, and the total count of matching rows (for pagination metadata).

    filters may include: status, status_ne, priority, assigned_engineer_id,
    employee_id, facility_id, category. sort_by/order must already be
    validated by the caller (they're interpolated directly since column/
    direction names can't be passed as query parameters).

    `viewer_user_id` is only ever passed for FACILITY_ADMIN callers (see
    handle_list): it joins facilities to compute `owned_by_me` per incident
    and sorts owned-by-this-admin first, then by the caller's requested
    sort_by/order within each group - so the admin "All Incidents" page can
    split the same fetched page into "My Facility Incidents"/"General
    Incidents" sections without a second query. `None` (employee/engineer)
    runs the exact same query as before this feature existed.
    """
    where_sql, params = _build_where(filters, search)

    if viewer_user_id is None:
        with conn.cursor() as cur:
            cur.execute(f"SELECT count(*) FROM incidents {where_sql};", params)
            total = cur.fetchone()[0]

            cur.execute(
                f"""
                SELECT {_COLUMNS} FROM incidents {where_sql}
                ORDER BY {sort_by} {order}
                LIMIT %s OFFSET %s;
                """,
                params + [page_size, (page - 1) * page_size],
            )
            items = [_row_to_dict(row) for row in cur.fetchall()]
        return items, total

    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*) FROM incidents i {where_sql};", params)
        total = cur.fetchone()[0]

        cur.execute(
            f"""
            SELECT {_COLUMNS_I}, (f.created_by_user_id = %s) AS owned_by_me
            FROM incidents i
            LEFT JOIN facilities f ON f.id = i.facility_id
            {where_sql}
            ORDER BY (f.created_by_user_id = %s) DESC NULLS LAST, i.{sort_by} {order}
            LIMIT %s OFFSET %s;
            """,
            [viewer_user_id, *params, viewer_user_id, page_size, (page - 1) * page_size],
        )
        items = []
        for row in cur.fetchall():
            item = _row_to_dict(row[:-1])
            item["owned_by_me"] = bool(row[-1])
            items.append(item)

    return items, total


def get_incident_stats(conn, filters: dict) -> dict:
    """
    Aggregates incident counts by status/priority/category/facility-building
    for the given (role-scoped) filters, entirely in SQL.
    """
    where_sql, params = _build_where(filters, None)

    with conn.cursor() as cur:
        status_filters = " ".join(
            f"count(*) FILTER (WHERE status = '{status}') AS status_{status.lower()},"
            for status in ALLOWED_STATUSES
        )
        priority_filters = ", ".join(
            f"count(*) FILTER (WHERE priority = '{priority}') AS priority_{priority.lower()}"
            for priority in ALLOWED_PRIORITIES
        )
        cur.execute(
            f"""
            SELECT count(*) AS total, {status_filters} {priority_filters}
            FROM incidents {where_sql};
            """,
            params,
        )
        columns = [desc.name for desc in cur.description]
        totals = dict(zip(columns, cur.fetchone()))

        cur.execute(
            f"""
            SELECT category, count(*) AS count
            FROM incidents {where_sql} {"AND" if where_sql else "WHERE"} category IS NOT NULL
            GROUP BY category
            ORDER BY count DESC;
            """,
            params,
        )
        by_category = [{"category": row[0], "count": row[1]} for row in cur.fetchall()]

        # Grouped by building only (never facility_id/floor/room), so every
        # incident anywhere in a building - whole-building, a floor, or a
        # specific room - rolls up into that one building's count.
        cur.execute(
            f"""
            SELECT f.building, count(*) AS count
            FROM incidents i
            JOIN facilities f ON f.id = i.facility_id
            {where_sql} {"AND" if where_sql else "WHERE"} i.facility_id IS NOT NULL
            GROUP BY f.building
            ORDER BY count DESC;
            """,
            params,
        )
        by_building = [{"building": row[0], "count": row[1]} for row in cur.fetchall()]

    return {
        "total": totals["total"],
        "by_status": {status: totals[f"status_{status.lower()}"] for status in ALLOWED_STATUSES},
        "by_priority": {priority: totals[f"priority_{priority.lower()}"] for priority in ALLOWED_PRIORITIES},
        "by_category": by_category,
        "by_building": by_building,
    }


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
