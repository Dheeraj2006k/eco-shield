"""Small durable store (SQLite, stdlib) so incidents, tickets and events survive API restarts.

`IRIS_DB_PATH` selects the file (default ./iris_state.db; use ":memory:" to disable persistence).
The PostgreSQL/TimescaleDB schema in infrastructure/database/schema.sql is the production target;
this store keeps the same entities as JSON documents until a Postgres adapter is added.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import threading


class Storage:
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
        """Upsert only documents whose content changed since the last save. Returns rows written."""
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


def _max_seq(docs: list[dict], key: str, prefix: str) -> int | None:
    nums = [int(m.group(1)) for d in docs if (m := re.match(rf"{prefix}-(\d+)", str(d.get(key, ""))))]
    return max(nums) + 1 if nums else None


def restore(engine, store: Storage) -> dict[str, int]:
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


def persist(engine, store: Storage) -> int:
    with engine.lock:
        inc = [dict(i) for i in engine.incidents]
        tkt = [dict(t) for t in engine.tickets]
        evt = [dict(e) for e in list(engine.events)[:20]]
    return store.save_changed("incident", inc, "id") + store.save_changed("ticket", tkt, "ticket_id") + store.save_changed("event", evt, "id")
