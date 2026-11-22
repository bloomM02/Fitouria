import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from .simulation import Scenario, simulate


class Store:
    def __init__(self):
        self.path = Path(os.getenv("FITOURIA_DB", str(Path(__file__).with_name("fitouria.sqlite3"))))
        with closing(sqlite3.connect(self.path)) as db, db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS scenarios (
                    id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS readings (
                    id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, source TEXT NOT NULL,
                    payload TEXT NOT NULL, scenario_id INTEGER
                );
            """)

    def save_scenario(self, scenario: Scenario):
        created_at = self.now()
        with closing(sqlite3.connect(self.path)) as db, db:
            cursor = db.execute("INSERT INTO scenarios(created_at, payload) VALUES (?, ?)",
                                (created_at, scenario.model_dump_json()))
            return self.scenario(cursor.lastrowid, created_at, scenario)

    def latest(self):
        with closing(sqlite3.connect(self.path)) as db:
            row = db.execute("SELECT * FROM scenarios ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            return self.scenario(None, None, Scenario())
        return self.scenario(row[0], row[1], Scenario.model_validate_json(row[2]))

    def record(self, source: str, payload: dict):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("""
                INSERT INTO readings(created_at, source, payload, scenario_id)
                VALUES (?, ?, ?, (SELECT MAX(id) FROM scenarios))
            """, (self.now(), source, json.dumps(payload)))
            db.execute("DELETE FROM readings WHERE source = ? AND id < COALESCE("
                       "(SELECT id FROM readings WHERE source = ? ORDER BY id DESC LIMIT 1 OFFSET 199), 0)",
                       (source, source))

    def history(self, source: str, limit: int = 60):
        with closing(sqlite3.connect(self.path)) as db:
            rows = db.execute(
                "SELECT * FROM readings WHERE source = ? ORDER BY id DESC LIMIT ?", (source, limit)
            ).fetchall()
        return [
            dict(id=row[0], timestamp=row[1], source=row[2], scenario_id=row[4], **json.loads(row[3]))
            for row in reversed(rows)
        ]

    @staticmethod
    def now():
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def scenario(identifier, created_at, scenario):
        return dict(id=identifier, created_at=created_at,
                    inputs=scenario.model_dump(), results=simulate(scenario))
