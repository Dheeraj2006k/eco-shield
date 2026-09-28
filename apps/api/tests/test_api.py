import os
import time

os.environ["IRIS_AUTH_SECRET"] = "t" * 48  # test-only secret, generated in-process
os.environ["IRIS_AUTH_REQUIRED"] = "true"

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app, engine  # noqa: E402


def token(role: str, name: str = "tester") -> dict:
    t = jwt.encode({"sub": name, "name": name, "role": role, "iat": int(time.time()), "exp": int(time.time()) + 600}, os.environ["IRIS_AUTH_SECRET"], algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(autouse=True)
def fresh():
    engine.reset_all()
    yield


client = TestClient(app)


def run(seconds: float):
    for _ in range(int(seconds / 1.5) + 1):
        for i in range(len(engine.pending)):
            engine.pending[i] = (0, engine.pending[i][1])  # fire scheduled steps immediately, in order
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
    for _ in range(30):
        for i in range(len(engine.pending)):
            engine.pending[i] = (0, engine.pending[i][1])
        engine.tick()
    alerts = client.get("/api/alerts", headers=token("VIEWER")).json()
    active = [a for a in alerts if a["status"] != "RESOLVED" and a["hazard"] == "FLOOD"]
    assert len(active) == 1, "deduplication must keep exactly one flood incident"
    assert active[0]["severity"] in ("HIGH", "CRITICAL")
    assert active[0]["duplicates_suppressed"] > 0
    assert client.post(f"/api/alerts/{active[0]['id']}/acknowledge", headers=token("VIEWER")).status_code == 403
    assert client.post(f"/api/alerts/{active[0]['id']}/acknowledge", headers=token("AUTHORITY")).status_code == 200


def test_sensor_failure_is_suppressed_not_alerted():
    client.post("/api/simulation/sensor-failure", headers=token("ADMIN"))
    for _ in range(15):
        engine.tick()
    n = client.get("/api/nodes/HYD-002", headers=token("VIEWER")).json()
    assert n["quorum"] == "SUPPRESSED"
    assert not [a for a in client.get("/api/alerts", headers=token("VIEWER")).json() if a["hazard"] == "FLOOD" and a["status"] != "RESOLVED"]


def test_ticket_validation_and_lifecycle():
    h = token("FIELD_STEWARD")
    assert client.post("/api/maintenance/ticket", json={"node_id": "bad", "issue": "x"}, headers=h).status_code == 422
    r = client.post("/api/maintenance/ticket", json={"node_id": "HYD-001", "issue": "Clean the rain gauge", "category": "CLEANING", "priority": "LOW"}, headers=h)
    assert r.status_code == 201
    tid = r.json()["ticket_id"]
    assert client.post(f"/api/maintenance/{tid}/resolve", headers=token("VIEWER")).status_code == 403
    assert client.post(f"/api/maintenance/{tid}/resolve", headers=h).status_code == 200
    assert client.post(f"/api/maintenance/{tid}/resolve", headers=h).status_code == 409


def test_websocket_requires_token():
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/alerts"):
            pass
    t = token("VIEWER")["Authorization"].split()[1]
    with client.websocket_connect(f"/ws/alerts?token={t}"):
        pass
