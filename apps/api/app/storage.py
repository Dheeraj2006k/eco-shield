"""Durable storage for the engine's mutable state (incidents, tickets, events).

Two backends behind the same interface — load(kind), save_changed(kind, docs, id_key), close():

  * Storage (SQLite, stdlib)  — default. File selected by IRIS_DB_PATH (":memory:" disables persistence).
  * PgStorage (PostgreSQL)    — used automatically when DATABASE_URL is set (e.g. a Supabase connection
                                 string). Writes to typed tables; see infrastructure/database/supabase.sql
                                 for the schema to paste into Supabase's SQL editor. PgStorage also runs
                                 that same DDL itself on startup (idempotent), so a fresh database still
                                 works even if the migration was not pasted first.

Both backends only persist incidents / tickets / events. Nodes, sensors, gateways and telemetry are
pure in-memory simulation state and are intentionally not written anywhere.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import sqlite3
import threading
from pathlib import Path
from typing import Protocol

log = logging.getLogger("iris.storage")


class DocStore(Protocol):
    def load(self, kind: str) -> list[dict]: ...
    def save_changed(self, kind: str, docs: list[dict], id_key: str) -> int: ...
    def close(self) -> None: ...


# ------------------------------------------------------------------ SQLite (default)
class Storage:
    """Local file store — one JSON document per row. Zero external dependencies."""

    def __init__(self, path: str) -> None:
        self.path = path
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (kind, id))")
        self.db.commit()
        self._seen: dict[tuple[str, str], str] = {}

    def load(self, kind: str) -> list[dict]:
        with self.lock:
            rows = self.db.execute("SELECT id, body FROM docs WHERE kind = ?", (kind,)).fetchall()
        out = []
        for id_, body in rows:
            self._seen[(kind, id_)] = hashlib.md5(body.encode()).hexdigest()
            out.append(json.loads(body))
        return out

    def save_changed(self, kind: str, docs: list[dict], id_key: str) -> int:
        n = 0
        with self.lock:
            for d in docs:
                body = json.dumps(d, sort_keys=True, default=str)
                h = hashlib.md5(body.encode()).hexdigest()
                key = (kind, d[id_key])
                if self._seen.get(key) == h:
                    continue
                self.db.execute("INSERT INTO docs(kind, id, body) VALUES (?,?,?) ON CONFLICT(kind, id) DO UPDATE SET body = excluded.body", (kind, d[id_key], body))
                self._seen[key] = h
                n += 1
            if n:
                self.db.commit()
        return n

    def close(self) -> None:
        with self.lock:
            self.db.close()


# ------------------------------------------------------------------ PostgreSQL / Supabase
# Column order mirrors infrastructure/database/supabase.sql exactly.
_PG_TABLES: dict[str, dict] = {
    "incident": {
        "table": "incidents",
        "pk": "id",
        "columns": [
            "id", "key", "event_ids", "hazard", "severity", "peak_severity", "confidence", "confidence_level",
            "state", "location", "district", "lat", "lon", "node_ids", "primary_node_id", "status",
            "recommended_action", "created_at", "updated_at", "acknowledged_at", "acknowledged_by", "resolved_at",
            "detections", "duplicates_suppressed", "history", "fusion", "dissemination", "simulated",
        ],
        "json_cols": {"event_ids", "node_ids", "history", "fusion", "dissemination"},
    },
    "ticket": {
        "table": "maintenance_tickets",
        "pk": "ticket_id",
        "columns": ["ticket_id", "node_id", "issue", "category", "priority", "assigned_to", "status", "created_at", "resolved_at", "service_history"],
        "json_cols": {"service_history"},
    },
    "event": {
        "table": "events",
        "pk": "id",
        "columns": ["id", "node_id", "hazard", "timestamp", "severity", "confidence", "evidence", "sensor_health", "model_versions"],
        "json_cols": {"evidence", "sensor_health", "model_versions"},
    },
}

_MIGRATION_SQL = (Path(__file__).resolve().parents[3] / "infrastructure" / "database" / "supabase.sql").read_text(encoding="utf-8")


class PgStorage:
    """PostgreSQL-backed store (e.g. Supabase). Requires `psycopg[binary]`."""

    def __init__(self, dsn: str) -> None:
        import psycopg  # local import: optional dependency, only needed when DATABASE_URL is set

        self._psycopg = psycopg
        self.lock = threading.Lock()
        self.conn = psycopg.connect(dsn, autocommit=False, connect_timeout=5)
        self._ensure_schema()
        self._seen: dict[tuple[str, str], str] = {}

    def _ensure_schema(self) -> None:
        with self.lock, self.conn.cursor() as cur:
            cur.execute(_MIGRATION_SQL)
        self.conn.commit()
        log.warning("PgStorage: schema ensured (ran infrastructure/database/supabase.sql)")

    def load(self, kind: str) -> list[dict]:
        spec = _PG_TABLES[kind]
        cols = ", ".join(f'"{c}"' for c in spec["columns"])
        with self.lock, self.conn.cursor() as cur:
            cur.execute(f'SELECT {cols} FROM "{spec["table"]}"')
            rows = cur.fetchall()
        out = []
        for row in rows:
            d = dict(zip(spec["columns"], row))
            body = json.dumps(d, sort_keys=True, default=str)
            self._seen[(kind, d[spec["pk"]])] = hashlib.md5(body.encode()).hexdigest()
            out.append(d)
        return out

    def save_changed(self, kind: str, docs: list[dict], id_key: str) -> int:
        spec = _PG_TABLES[kind]
        Json = self._psycopg.types.json.Json  # noqa: N806
        n = 0
        with self.lock, self.conn.cursor() as cur:
            for d in docs:
                body = json.dumps(d, sort_keys=True, default=str)
                h = hashlib.md5(body.encode()).hexdigest()
                key = (kind, d[id_key])
                if self._seen.get(key) == h:
                    continue
                cols = spec["columns"]
                values = [Json(d.get(c)) if c in spec["json_cols"] else d.get(c) for c in cols]
                col_list = ", ".join(f'"{c}"' for c in cols)
                placeholders = ", ".join(["%s"] * len(cols))
                updates = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in cols if c != spec["pk"])
                cur.execute(f'INSERT INTO "{spec["table"]}" ({col_list}) VALUES ({placeholders}) ON CONFLICT ("{spec["pk"]}") DO UPDATE SET {updates}', values)
                self._seen[key] = h
                n += 1
            if n:
                self.conn.commit()
        return n

    def close(self) -> None:
        with self.lock:
            self.conn.close()


def open_store(database_url: str | None, sqlite_path: str) -> DocStore | None:
    """Picks PgStorage when DATABASE_URL is set, else SQLite; None disables persistence (":memory:")."""
    if database_url:
        try:
            return PgStorage(database_url)
        except ImportError:
            log.error("DATABASE_URL is set but `psycopg` is not installed — falling back to SQLite. Run: pip install 'psycopg[binary]'")
        except Exception:
            log.exception("Could not connect to DATABASE_URL — falling back to SQLite")
    if sqlite_path == ":memory:":
        return None
    return Storage(sqlite_path)


def _max_seq(docs: list[dict], key: str, prefix: str) -> int | None:
    nums = [int(m.group(1)) for d in docs if (m := re.match(rf"{prefix}-(\d+)", str(d.get(key, ""))))]
    return max(nums) + 1 if nums else None


def restore(engine, store: DocStore) -> dict[str, int]:
    """Load persisted incidents/tickets/events into the engine (if any) and advance id counters."""
    inc, tkt, evt = store.load("incident"), store.load("ticket"), store.load("event")
    with engine.lock:
        if inc:
            engine.incidents = sorted(inc, key=lambda i: -i["created_at"])
            engine.seq["inc"] = max(engine.seq["inc"], _max_seq(inc, "id", "INC") or 0)
        if tkt:
            engine.tickets = sorted(tkt, key=lambda t: -t["created_at"])
            engine.seq["tkt"] = max(engine.seq["tkt"], _max_seq(tkt, "ticket_id", "MT") or 0)
        if evt:
            engine.events.extend(sorted(evt, key=lambda e: -e["timestamp"])[:100])
            engine.seq["evt"] = max(engine.seq["evt"], _max_seq(evt, "id", "EVT") or 0)
    return {"incidents": len(inc), "tickets": len(tkt), "events": len(evt)}


def persist(engine, store: DocStore) -> int:
    with engine.lock:
        inc = [dict(i) for i in engine.incidents]
        tkt = [dict(t) for t in engine.tickets]
        evt = [dict(e) for e in list(engine.events)[:20]]
    return store.save_changed("incident", inc, "id") + store.save_changed("ticket", tkt, "ticket_id") + store.save_changed("event", evt, "id")
