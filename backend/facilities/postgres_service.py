"""
PostgreSQL connectivity and data access for the facilities service.

Reuses the module-level connection pooling pattern from
backend/_examples/python-service/postgres_service.py so a single
connection is shared across warm Lambda invocations.
"""

from psycopg import connect
from psycopg.errors import UniqueViolation

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
    """Creates the facilities table if it does not already exist.

    Also self-heals environments created before the `seat` -> `room` rename,
    before `floor` became optional, and before building/floor "bare" rows
    (the `(building, NULL, NULL)` / `(building, floor, NULL)` rows that make
    "whole building"/"whole floor" itself a selectable facility) were
    backfilled for pre-existing data: this repo has no separate migration
    tool, so idempotent DDL here is it.
    """
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS facilities (
                id BIGSERIAL PRIMARY KEY,
                building TEXT NOT NULL,
                floor TEXT,
                room TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)
        cur.execute("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'facilities' AND column_name = 'seat'
                ) THEN
                    ALTER TABLE facilities RENAME COLUMN seat TO room;
                END IF;
            END $$;
        """)
        cur.execute("ALTER TABLE facilities ALTER COLUMN floor DROP NOT NULL;")
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'facilities_unique_location'
                ) THEN
                    ALTER TABLE facilities
                        ADD CONSTRAINT facilities_unique_location
                        UNIQUE NULLS NOT DISTINCT (building, floor, room);
                END IF;
            END $$;
        """)
        # Backfill bare rows for facilities created before bulk_add_floors/
        # bulk_add_rooms started ensuring them - without these, older
        # buildings have no "whole building"/"whole floor" facility for the
        # employee selector to fall back to, so picking just a building (or
        # a building + floor) can leave nothing selectable to submit.
        cur.execute("""
            INSERT INTO facilities (building, floor, room)
            SELECT DISTINCT building, NULL, NULL FROM facilities
            ON CONFLICT (building, floor, room) DO NOTHING;
        """)
        cur.execute("""
            INSERT INTO facilities (building, floor, room)
            SELECT DISTINCT building, floor, NULL FROM facilities WHERE floor IS NOT NULL
            ON CONFLICT (building, floor, room) DO NOTHING;
        """)


def create_facility(conn, building: str, floor: str | None, room: str | None) -> dict:
    """Inserts a new facility and returns it. Raises ValueError if this exact
    building/floor/room already exists (the unique constraint)."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO facilities (building, floor, room)
                VALUES (%s, %s, %s)
                RETURNING id, building, floor, room, created_at;
                """,
                (building, floor, room),
            )
            return _row_to_dict(cur.fetchone())
    except UniqueViolation:
        raise ValueError("A facility with this building/floor/room already exists")


def list_facilities(conn) -> list:
    """Returns all facilities ordered by building/floor/room."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, building, floor, room, created_at
            FROM facilities
            ORDER BY building, floor, room;
        """)
        return [_row_to_dict(row) for row in cur.fetchall()]


def list_buildings(conn) -> list:
    """Returns the distinct set of building names, alphabetically."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT building
            FROM facilities
            ORDER BY building;
        """)
        return [row[0] for row in cur.fetchall()]


def list_floors(conn, building: str) -> list:
    """Returns the distinct set of floors within a building, sorted
    numerically (floor is TEXT, so a plain `ORDER BY floor` sorts "10"
    before "2"). Non-numeric custom floor names sort alphabetically after
    all numeric floors; the building-level bare row (floor IS NULL) sorts
    last, same as before."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT floor
            FROM (SELECT DISTINCT floor FROM facilities WHERE building = %s) AS distinct_floors
            ORDER BY
                floor IS NULL,
                floor !~ '^[0-9]+$',
                (CASE WHEN floor ~ '^[0-9]+$' THEN floor::int END),
                floor;
            """,
            (building,),
        )
        return [row[0] for row in cur.fetchall()]


def list_rooms(conn, building: str, floor: str | None) -> list:
    """Returns the rooms (id + label) within a building/floor combination.

    `floor` may be None to match facilities that don't track a floor at all
    (an ordinary `= NULL` comparison never matches, hence `IS NOT DISTINCT
    FROM` here instead).

    Sorted numerically, same rationale as list_floors: room is TEXT, so a
    plain `ORDER BY room` would sort "1200" before "13".
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, room
            FROM facilities
            WHERE building = %s AND floor IS NOT DISTINCT FROM %s
            ORDER BY
                room IS NULL,
                room !~ '^[0-9]+$',
                (CASE WHEN room ~ '^[0-9]+$' THEN room::int END),
                room;
            """,
            (building, floor),
        )
        return [{"id": row[0], "room": row[1]} for row in cur.fetchall()]


def get_facility(conn, facility_id: int) -> dict | None:
    """Fetches a single facility by id, or None if not found."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, building, floor, room, created_at
            FROM facilities
            WHERE id = %s;
            """,
            (facility_id,),
        )
        row = cur.fetchone()
        return _row_to_dict(row) if row else None


def update_facility(conn, facility_id: int, building: str, floor: str | None, room: str | None) -> dict | None:
    """Updates a facility's fields, returning the updated row or None if not found.
    Raises ValueError if the new building/floor/room collides with another row."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE facilities
                SET building = %s, floor = %s, room = %s
                WHERE id = %s
                RETURNING id, building, floor, room, created_at;
                """,
                (building, floor, room, facility_id),
            )
            row = cur.fetchone()
            return _row_to_dict(row) if row else None
    except UniqueViolation:
        raise ValueError("A facility with this building/floor/room already exists")


def delete_facility(conn, facility_id: int) -> bool:
    """Deletes a facility by id, returning True if a row was deleted."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM facilities WHERE id = %s;", (facility_id,))
        return cur.rowcount > 0


def list_building_summaries(conn, page: int, page_size: int) -> tuple[list, int]:
    """Aggregates distinct-floor and room counts per building, paginated
    alphabetically - for the admin building-card view."""
    with conn.cursor() as cur:
        cur.execute("SELECT count(DISTINCT building) FROM facilities;")
        total = cur.fetchone()[0]

        cur.execute(
            """
            SELECT building,
                   count(DISTINCT floor) FILTER (WHERE floor IS NOT NULL) AS floor_count,
                   count(*) FILTER (WHERE room IS NOT NULL) AS room_count
            FROM facilities
            GROUP BY building
            ORDER BY building
            LIMIT %s OFFSET %s;
            """,
            (page_size, (page - 1) * page_size),
        )
        buildings = [{"building": row[0], "floor_count": row[1], "room_count": row[2]} for row in cur.fetchall()]

    return buildings, total


def building_exists(conn, building: str) -> bool:
    """Whether any facility row exists for this building."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM facilities WHERE building = %s LIMIT 1;", (building,))
        return cur.fetchone() is not None


def count_incidents_for_building(conn, building: str) -> int:
    """Counts incidents referencing any facility row under `building`.

    This is a raw cross-table query rather than a call into the incidents
    service - the two are independently deployed Lambdas with no shared
    code, and there is deliberately no foreign key between their tables
    (see incidents/postgres_service.py). It exists purely to stop a
    building delete from leaving incidents with a dangling facility_id.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM incidents WHERE facility_id IN (SELECT id FROM facilities WHERE building = %s);",
            (building,),
        )
        return cur.fetchone()[0]


def rename_building(conn, old_building: str, new_building: str) -> int:
    """Renames every facility row for `old_building` to `new_building` in
    one atomic UPDATE (floor/room values are untouched). Raises ValueError
    if `old_building` doesn't exist, or if `new_building` is already a
    different, existing building (renaming never merges two buildings)."""
    if not building_exists(conn, old_building):
        raise ValueError(f"Building '{old_building}' does not exist")
    if new_building != old_building and building_exists(conn, new_building):
        raise ValueError(f"A building named '{new_building}' already exists")

    with conn.cursor() as cur:
        cur.execute("UPDATE facilities SET building = %s WHERE building = %s;", (new_building, old_building))
        return cur.rowcount


def delete_building(conn, building: str) -> int:
    """Deletes every facility row for `building`. Raises ValueError if the
    building doesn't exist, or if any incident still references one of its
    facilities (checked first, so the delete fails cleanly instead of
    leaving a dangling incidents.facility_id)."""
    if not building_exists(conn, building):
        raise ValueError(f"Building '{building}' does not exist")

    incident_count = count_incidents_for_building(conn, building)
    if incident_count > 0:
        raise ValueError(
            f"Cannot delete '{building}': {incident_count} incident(s) still reference its facilities"
        )

    with conn.cursor() as cur:
        cur.execute("DELETE FROM facilities WHERE building = %s;", (building,))
        return cur.rowcount


def get_max_floor_number(conn, building: str) -> int:
    """Highest numeric floor already used for `building` (0 if none).

    Custom, non-numeric floor names (e.g. a floor manually typed as
    "Mezzanine") are ignored - they never participate in bulk numbering, so
    they're left alone and never collided with.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT floor FROM facilities WHERE building = %s AND floor ~ '^[0-9]+$';", (building,))
        floors = [int(row[0]) for row in cur.fetchall()]
    return max(floors) if floors else 0


def get_max_room_index(conn, building: str, floor_number: int) -> int:
    """Highest room index already used on this floor, per the `floor*100 +
    index` numbering convention (0 if none). Custom room labels that don't
    fit the convention are ignored the same way as custom floor names."""
    base = floor_number * 100
    with conn.cursor() as cur:
        cur.execute(
            "SELECT room FROM facilities WHERE building = %s AND floor = %s AND room ~ '^[0-9]+$';",
            (building, str(floor_number)),
        )
        indexes = [int(row[0]) - base for row in cur.fetchall() if 1 <= int(row[0]) - base <= 100]
    return max(indexes) if indexes else 0


def building_has_floor(conn, building: str, floor: str) -> bool:
    """Whether `building` already has at least one row for `floor`."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM facilities WHERE building = %s AND floor = %s LIMIT 1;", (building, floor))
        return cur.fetchone() is not None


def bulk_add_floors(conn, building: str, floor_count: int, rooms_per_floor: int) -> list:
    """
    Adds `floor_count` new floors after the current highest numeric floor
    for `building` (starting at 1 if none exist yet), each with
    `rooms_per_floor` rooms numbered `floor*100 + 1..rooms_per_floor`.

    Also ensures the building-level (NULL, NULL) row and each new
    floor-level (floor, NULL) row exist, so building/floor/room are all
    independently selectable when filing an incident. Idempotent: existing
    rows are left untouched (`ON CONFLICT DO NOTHING`), so this is safe to
    call again later to add more floors.

    Returns the rows actually inserted (excludes any that already existed).
    """
    start = get_max_floor_number(conn, building) + 1
    created = []
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO facilities (building, floor, room)
                VALUES (%s, NULL, NULL)
                ON CONFLICT (building, floor, room) DO NOTHING
                RETURNING id, building, floor, room, created_at;
                """,
                (building,),
            )
            created.extend(cur.fetchall())

            if floor_count > 0:
                cur.execute(
                    """
                    INSERT INTO facilities (building, floor, room)
                    SELECT %s, f::text, NULL
                    FROM generate_series(%s::int, %s::int) AS f
                    ON CONFLICT (building, floor, room) DO NOTHING
                    RETURNING id, building, floor, room, created_at;
                    """,
                    (building, start, start + floor_count - 1),
                )
                created.extend(cur.fetchall())

                if rooms_per_floor > 0:
                    cur.execute(
                        """
                        INSERT INTO facilities (building, floor, room)
                        SELECT %s, f::text, (f * 100 + r)::text
                        FROM generate_series(%s::int, %s::int) AS f
                        CROSS JOIN generate_series(1, %s::int) AS r
                        ON CONFLICT (building, floor, room) DO NOTHING
                        RETURNING id, building, floor, room, created_at;
                        """,
                        (building, start, start + floor_count - 1, rooms_per_floor),
                    )
                    created.extend(cur.fetchall())

    return [_row_to_dict(row) for row in created]


def bulk_add_rooms(conn, building: str, floor: str, room_count: int) -> list:
    """
    Adds `room_count` new rooms to an existing `floor` of `building`, after
    the current highest room index used there. Also ensures the
    building-level and floor-level bare rows exist. Idempotent, like
    `bulk_add_floors`.

    Returns the rows actually inserted (excludes any that already existed).
    """
    floor_number = int(floor)
    start = get_max_room_index(conn, building, floor_number) + 1
    created = []
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO facilities (building, floor, room)
                VALUES (%s, NULL, NULL)
                ON CONFLICT (building, floor, room) DO NOTHING
                RETURNING id, building, floor, room, created_at;
                """,
                (building,),
            )
            created.extend(cur.fetchall())

            cur.execute(
                """
                INSERT INTO facilities (building, floor, room)
                VALUES (%s, %s, NULL)
                ON CONFLICT (building, floor, room) DO NOTHING
                RETURNING id, building, floor, room, created_at;
                """,
                (building, floor),
            )
            created.extend(cur.fetchall())

            if room_count > 0:
                cur.execute(
                    """
                    INSERT INTO facilities (building, floor, room)
                    SELECT %s, %s, (%s::int * 100 + r)::text
                    FROM generate_series(%s::int, %s::int) AS r
                    ON CONFLICT (building, floor, room) DO NOTHING
                    RETURNING id, building, floor, room, created_at;
                    """,
                    (building, floor, floor_number, start, start + room_count - 1),
                )
                created.extend(cur.fetchall())

    return [_row_to_dict(row) for row in created]


def _row_to_dict(row) -> dict:
    return {
        "id": row[0],
        "building": row[1],
        "floor": row[2],
        "room": row[3],
        "created_at": row[4].isoformat(),
    }
