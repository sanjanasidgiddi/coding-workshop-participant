"""
PostgreSQL connectivity and data access for the incident notes service.

Reuses the module-level connection pooling pattern from
backend/_examples/python-service/postgres_service.py so a single
connection is shared across warm Lambda invocations.

Like the incidents service, this reads the incidents/users tables
directly (same physical database, cross-service query) rather than
declaring foreign keys, since table creation order between independently
deployed Lambdas isn't guaranteed.
"""

from psycopg import connect

PG_CONN = None


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
    """Creates the incident_notes table if it does not already exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS incident_notes (
                id BIGSERIAL PRIMARY KEY,
                incident_id BIGINT NOT NULL,
                author_user_id BIGINT NOT NULL,
                author_name TEXT,
                author_role TEXT NOT NULL,
                note TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)


def get_incident_summary(conn, incident_id: int) -> dict | None:
    """Fetches just the fields needed to authorize note access (cross-service query)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT employee_id, assigned_engineer_id, status FROM incidents WHERE id = %s;",
            (incident_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {"employee_id": row[0], "assigned_engineer_id": row[1], "status": row[2]}


def get_user_name(conn, user_id: int) -> str | None:
    """Looks up a user's display name for denormalizing onto a new note (cross-service query)."""
    with conn.cursor() as cur:
        cur.execute("SELECT name FROM users WHERE id = %s;", (user_id,))
        row = cur.fetchone()
        return row[0] if row else None


def create_note(conn, incident_id: int, author_user_id: int, author_name: str | None,
                 author_role: str, note: str) -> dict:
    """Inserts a new incident note and returns it."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO incident_notes (incident_id, author_user_id, author_name, author_role, note)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, incident_id, author_user_id, author_name, author_role, note, created_at;
            """,
            (incident_id, author_user_id, author_name, author_role, note),
        )
        return _row_to_dict(cur.fetchone())


def list_notes(conn, incident_id: int) -> list:
    """Returns all notes for an incident in chronological order."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, incident_id, author_user_id, author_name, author_role, note, created_at
            FROM incident_notes
            WHERE incident_id = %s
            ORDER BY created_at ASC;
            """,
            (incident_id,),
        )
        return [_row_to_dict(row) for row in cur.fetchall()]


def _row_to_dict(row) -> dict:
    return {
        "id": row[0],
        "incident_id": row[1],
        "author_user_id": row[2],
        "author_name": row[3],
        "author_role": row[4],
        "note": row[5],
        "created_at": row[6].isoformat(),
    }
