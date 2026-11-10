"""Compares a live SQLite database with a restored copy, table by table (deploy/vps/restore-drill.sh).

    python compare-databases.py <live.db> <restored.db>

Exits 0 when the restored file passes its integrity check and holds the same tables with the same rows.
"""

import sqlite3
import sys

TABLES = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"


def fail(message):
    print(f"drill: {message}", file=sys.stderr)
    sys.exit(1)


def tables(connection):
    # Litestream keeps two small tables of its own in the database; they are not the household's data.
    return [name for (name,) in connection.execute(TABLES) if not name.startswith("_litestream")]


def rows(connection, table):
    return sorted(repr(row) for row in connection.execute(f'SELECT * FROM "{table}"'))


live = sqlite3.connect(sys.argv[1])
# The restored file is one whole file with nothing beside it, on a read-only mount.
restored = sqlite3.connect(f"file:{sys.argv[2]}?immutable=1", uri=True)

check = restored.execute("PRAGMA integrity_check").fetchall()
if check != [("ok",)]:
    fail(f"the restored database fails its integrity check: {check[:5]}")

live_tables = tables(live)
if live_tables != tables(restored):
    fail(f"the tables differ: {sorted(set(live_tables) ^ set(tables(restored)))}")

total = 0
for table in live_tables:
    expected = rows(live, table)
    if expected != rows(restored, table):
        fail(f"the rows of {table} differ ({len(expected)} live, {len(rows(restored, table))} restored)")
    total += len(expected)

users = live.execute("SELECT count(*) FROM users").fetchone()[0]
if users < 2:
    fail(f"the live database has {users} users: the drill compared an empty database")

print(f"drill: {len(live_tables)} tables and {total} rows are the same in the restored database ({users} users)")
