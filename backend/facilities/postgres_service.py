"""
PostgreSQL connectivity and data access for the facilities service.

Reuses the module-level connection pooling pattern from
backend/_examples/python-service/postgres_service.py so a single
connection is shared across warm Lambda invocations.
"""

from psycopg import connect

# Module-level PostgreSQL connection for connection pooling across Lambda invocations.
# Persists between invocations within the same Lambda container.
PG_CONN = None


def get_connection(config: str):
    """
    Returns a pooled psycopg connection, reused across warm Lambda invocations.

    On first use (or after a dropped connection) also ensures the facilities
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
    """Creates the facilities table if it does not already exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS facilities (
                id BIGSERIAL PRIMARY KEY,
                building TEXT NOT NULL,
                floor TEXT NOT NULL,
                seat TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)


def create_facility(conn, building: str, floor: str, seat: str | None) -> dict:
    """Inserts a new facility and returns it."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO facilities (building, floor, seat)
            VALUES (%s, %s, %s)
            RETURNING id, building, floor, seat, created_at;
            """,
            (building, floor, seat),
        )
        return _row_to_dict(cur.fetchone())


def list_facilities(conn) -> list:
    """Returns all facilities ordered by building/floor/seat."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, building, floor, seat, created_at
            FROM facilities
            ORDER BY building, floor, seat;
        """)
        return [_row_to_dict(row) for row in cur.fetchall()]


def get_facility(conn, facility_id: int) -> dict | None:
    """Fetches a single facility by id, or None if not found."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, building, floor, seat, created_at
            FROM facilities
            WHERE id = %s;
            """,
            (facility_id,),
        )
        row = cur.fetchone()
        return _row_to_dict(row) if row else None


def update_facility(conn, facility_id: int, building: str, floor: str, seat: str | None) -> dict | None:
    """Updates a facility's fields, returning the updated row or None if not found."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE facilities
            SET building = %s, floor = %s, seat = %s
            WHERE id = %s
            RETURNING id, building, floor, seat, created_at;
            """,
            (building, floor, seat, facility_id),
        )
        row = cur.fetchone()
        return _row_to_dict(row) if row else None


def delete_facility(conn, facility_id: int) -> bool:
    """Deletes a facility by id, returning True if a row was deleted."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM facilities WHERE id = %s;", (facility_id,))
        return cur.rowcount > 0


def _row_to_dict(row) -> dict:
    return {
        "id": row[0],
        "building": row[1],
        "floor": row[2],
        "seat": row[3],
        "created_at": row[4].isoformat(),
    }
