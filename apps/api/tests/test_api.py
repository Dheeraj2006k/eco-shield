import os
import time

os.environ["IRIS_AUTH_SECRET"] = "t" * 48  # test-only secret, generated in-process
os.environ["IRIS_AUTH_REQUIRED"] = "true"
os.environ["IRIS_DB_PATH"] = ":memory:"

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.engine import Engine  # noqa: E402
from app.main import app, engine  # noqa: E402
from app.storage import Storage, persist, restore  # noqa: E402


def token(role: str, name: str = "tester") -> dict:
    t = jwt.encode({"sub": name, "name": name, "role": role, "iat": int(time.time()), "exp": int(time.time()) + 600}, os.environ["IRIS_AUTH_SECRET"], algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(autouse=True)
def fresh():
    engine.reset_all()
    yield


client = TestClient(app)


def run_ticks(n: int, jump_s: float = 40.0):
    """Advance the engine n ticks; the scenario clock is shifted so every timed step is already due."""
    for _ in range(n):
        if engine.run:
            engine.run["started_at"] -= jump_s * 1000 / n if n else 0
        engine.tick()


def test_requires_auth():
    assert client.get("/api/nodes").status_code == 401
    assert client.get("/api/nodes", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_nodes_and_rbac():
    assert len(client.get("/api/nodes", headers=token("VIEWER")).json()) == 8
    assert client.post("/api/simulation/flood", headers=token("VIEWER")).status_code == 403
    assert client.post("/api/simulation/flood", headers=token("OPERATOR")).status_code == 200


def test_flood_creates_single_deduplicated_incident_and_ack():
    client.post("/api/simulation/flood", headers=token("ADMIN"))
    run_ticks(40, jump_s=60)
    alerts = client.get("/api/alerts", headers=token("VIEWER")).json()
    active = [a for a in alerts if a["status"] != "RESOLVED" and a["hazard"] == "FLOOD"]
    assert len(active) == 1, "deduplication must keep exactly one flood incident"
    assert active[0]["severity"] in ("HIGH", "CRITICAL")
    assert active[0]["duplicates_suppressed"] > 0
    assert client.post(f"/api/alerts/{active[0]['id']}/acknowledge", headers=token("VIEWER")).status_code == 403
    assert client.post(f"/api/alerts/{active[0]['id']}/acknowledge", headers=token("AUTHORITY")).status_code == 200


def test_sensor_failure_is_suppressed_not_alerted():
    client.post("/api/simulation/sensor-failure", headers=token("ADMIN"))
    run_ticks(15, jump_s=20)
    n = client.get("/api/nodes/HYD-002", headers=token("VIEWER")).json()
    assert n["quorum"] == "SUPPRESSED"
    assert not [a for a in client.get("/api/alerts", headers=token("VIEWER")).json() if a["hazard"] == "FLOOD" and a["status"] != "RESOLVED"]


def test_backhaul_outage_queues_cloud_but_siren_stays_active():
    client.post("/api/simulation/backhaul-outage", headers=token("ADMIN"))
    client.post("/api/simulation/flood", headers=token("ADMIN"))
    run_ticks(40, jump_s=60)
    inc = next(i for i in engine.incidents if i["status"] != "RESOLVED" and i["hazard"] == "FLOOD")
    assert inc["severity"] == "CRITICAL"
    inc["created_at"] -= 10_000  # dissemination is scheduled on wall-clock age
    engine.tick()
    assert all(c["status"] == "QUEUED" for c in inc["dissemination"]["channels"])
    assert inc["dissemination"]["local_siren"] == "ACTIVE"
    client.post("/api/simulation/restore-backhaul", headers=token("ADMIN"))
    run_ticks(6, jump_s=0)
    assert all(c["status"] == "SENT" for c in inc["dissemination"]["channels"])


def test_ticket_validation_and_lifecycle():
    h = token("FIELD_STEWARD")
    assert client.post("/api/maintenance/ticket", json={"node_id": "bad", "issue": "x"}, headers=h).status_code == 422
    r = client.post("/api/maintenance/ticket", json={"node_id": "HYD-001", "issue": "Clean the rain gauge", "category": "CLEANING", "priority": "LOW"}, headers=h)
    assert r.status_code == 201
    tid = r.json()["ticket_id"]
    assert client.post(f"/api/maintenance/{tid}/resolve", headers=token("VIEWER")).status_code == 403
    assert client.post(f"/api/maintenance/{tid}/resolve", headers=h).status_code == 200
    assert client.post(f"/api/maintenance/{tid}/resolve", headers=h).status_code == 409


def test_maintenance_mode_excludes_node_from_fusion():
    assert client.post("/api/nodes/HYD-001/maintenance-mode", json={"on": True}, headers=token("VIEWER")).status_code == 403
    assert client.post("/api/nodes/HYD-001/maintenance-mode", json={"on": True}, headers=token("FIELD_STEWARD")).status_code == 200
    engine.tick()
    n = client.get("/api/nodes/HYD-001", headers=token("VIEWER")).json()
    assert n["health_status"] == "MAINTENANCE_REQUIRED"


def test_snapshot_shape_for_ui():
    engine.tick()
    s = client.get("/api/snapshot", headers=token("VIEWER")).json()
    for k in ("nodes", "gateways", "history", "fusion", "incidents", "tickets", "log", "notifications", "external", "camera", "pipeline", "riskTrend", "system", "now", "tick"):
        assert k in s, k
    n = s["nodes"][0]
    for k in ("code", "location", "installed_pods", "sensors", "anomaly", "maintenance_mode", "confidence_level", "quorum", "snr", "storage"):
        assert k in n, k
    assert len(s["pipeline"]) == 9
    assert len(s["incidents"]) >= 6 and len(s["tickets"]) >= 5  # seeded history
    assert len(s["history"]["HYD-001"]["water_level"]) >= 120


def test_persistence_survives_restart(tmp_path):
    db = str(tmp_path / "state.db")
    a = Engine()
    st = Storage(db)
    a.scenario("flood")
    for _ in range(40):
        a.run["started_at"] -= 1500
        a.tick()
    a.create_ticket("HYD-001", "Persist me please", "CLEANING", "LOW", "tester")
    assert persist(a, st) > 0
    n_inc = len(a.incidents)
    st.close()

    b = Engine()
    st2 = Storage(db)
    counts = restore(b, st2)
    assert counts["incidents"] == n_inc
    assert any(t["issue"] == "Persist me please" for t in b.tickets)
    assert b.seq["inc"] >= a.seq["inc"] and b.seq["tkt"] >= a.seq["tkt"]
    st2.close()


def test_websocket_requires_token():
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/state"):
            pass
    t = token("VIEWER")["Authorization"].split()[1]
    with client.websocket_connect(f"/ws/state?token={t}"):
        pass
