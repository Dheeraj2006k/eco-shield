"""ECO-SHIELD API — REST + WebSocket over the demo engine. All data is SIMULATED."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .engine import TICK_S, TH, Engine
from .models import AckRequest, Incident, Maintenance, Node, Telemetry, TicketCreate
from .security import User, auth_required, decode, require
from .storage import Storage, persist, restore

log = logging.getLogger("iris.api")
engine = Engine()
store: Storage | None = None


class Hub:
    """Fan-out of engine updates to WebSocket subscribers per channel."""

    def __init__(self) -> None:
        self.channels: dict[str, set[WebSocket]] = {"events": set(), "telemetry": set(), "alerts": set(), "state": set()}

    async def publish(self, channel: str, payload: dict | str) -> None:
        if not self.channels[channel]:
            return
        text = payload if isinstance(payload, str) else json.dumps(payload, default=str)
        dead = []
        for ws in list(self.channels[channel]):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.channels[channel].discard(ws)


hub = Hub()


async def loop() -> None:
    last_alerts = ""
    while True:
        await asyncio.sleep(TICK_S)
        engine.tick()
        with engine.lock:
            new_logs, engine.new_log = engine.new_log, []
            tele = [{"node_id": n["id"], "timestamp": engine.now, "battery": round(n["battery"], 2), "signal": round(n["signal"], 1), "risk": n["risk"], "quorum": n["quorum"], "values": {t: round(s["value"], 2) for t, s in n["sensors"].items()}, "simulated": True} for n in engine.nodes.values()]
            alerts = [i for i in engine.incidents if i["status"] != "RESOLVED"]
        for e in reversed(new_logs):
            await hub.publish("events", {"type": "event", "data": e})
        await hub.publish("telemetry", {"type": "telemetry", "data": tele})
        snap = json.dumps(alerts, default=str, sort_keys=True)
        if snap != last_alerts:
            last_alerts = snap
            await hub.publish("alerts", {"type": "alerts", "data": alerts})
        if hub.channels["state"]:
            await hub.publish("state", {"type": "state", "data": engine.snapshot(with_history=False)})
        if store:
            try:
                await asyncio.get_running_loop().run_in_executor(None, persist, engine, store)
            except Exception:  # persistence must never stop the engine
                log.exception("persist failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global store
    path = os.environ.get("IRIS_DB_PATH", "iris_state.db")
    if path != ":memory:":
        store = Storage(path)
        counts = restore(engine, store)
        log.warning("restored from %s: %s", path, counts)
    tasks = [asyncio.create_task(loop())]
    if os.environ.get("IRIS_MQTT_ENABLED", "false").lower() == "true":
        from .mqtt_bridge import run_bridge

        tasks.append(asyncio.create_task(run_bridge(engine)))
    yield
    for t in tasks:
        t.cancel()
    if store:
        persist(engine, store)
        store.close()


app = FastAPI(title="ECO-SHIELD API", version="1.1.0", description="Demo API — all telemetry is simulated.", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("IRIS_CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "eco-shield-api", "data": "SIMULATED", "auth_required": auth_required(), "tick": engine.tick_n, "persistence": store.path if store else "off"}


# ------------------------------------------------------------------ state for the web UI (remote mode)
@app.get("/api/snapshot")
def snapshot(_: User = Depends(require("view"))):
    """Full engine state in the exact shape the web UI consumes (including telemetry history)."""
    return engine.snapshot(with_history=True)


# ------------------------------------------------------------------ read
@app.get("/api/nodes", response_model=list[Node])
def list_nodes(hazard: str | None = None, _: User = Depends(require("view"))):
    with engine.lock:
        return [engine.node_view(n) for n in engine.nodes.values() if hazard is None or n["hazard"] == hazard.upper()]


@app.get("/api/nodes/{node_id}", response_model=Node)
def get_node(node_id: str, _: User = Depends(require("view"))):
    with engine.lock:
        n = engine.nodes.get(node_id)
        if not n:
            raise HTTPException(404, "Node not found")
        return engine.node_view(n)


@app.get("/api/nodes/{node_id}/telemetry", response_model=list[Telemetry])
def node_telemetry(node_id: str, metric: str = Query("water_level", max_length=24), limit: int = Query(120, ge=1, le=240), _: User = Depends(require("view"))):
    with engine.lock:
        n = engine.nodes.get(node_id)
        if not n or metric not in n["sensors"]:
            raise HTTPException(404, "Node or metric not found")
        s = n["sensors"][metric]
        return [Telemetry(timestamp=t, node_id=node_id, sensor_id=s["id"], value=v, unit=TH[metric][3], quality=s["quality"], battery=n["battery"], signal=n["signal"]) for t, v in list(engine.history[node_id][metric])[-limit:]]


class MaintenanceModeBody(BaseModel):
    on: bool


@app.post("/api/nodes/{node_id}/maintenance-mode")
def maintenance_mode(node_id: str, body: MaintenanceModeBody, user: User = Depends(require("service_nodes"))):
    if not engine.set_maintenance_mode(node_id, body.on, user.name):
        raise HTTPException(404, "Node not found")
    return {"ok": True, "node": node_id, "maintenance_mode": body.on}


@app.get("/api/alerts", response_model=list[Incident])
def list_alerts(status: str | None = None, hazard: str | None = None, _: User = Depends(require("view"))):
    with engine.lock:
        return [engine.incident_view(i) for i in engine.incidents if (not status or i["status"] == status.upper()) and (not hazard or i["hazard"] == hazard.upper())]


@app.get("/api/alerts/{incident_id}")
def get_alert(incident_id: str, _: User = Depends(require("view"))):
    with engine.lock:
        i = next((x for x in engine.incidents if x["id"] == incident_id), None)
        if not i:
            raise HTTPException(404, "Incident not found")
        events = [e for e in engine.events if e["id"] in i["event_ids"]]
        return {"incident": engine.incident_view(i), "events": events, "fusion": i["fusion"]}


@app.post("/api/alerts/{incident_id}/acknowledge")
def acknowledge(incident_id: str, body: AckRequest | None = None, user: User = Depends(require("ack_alerts"))):
    if not engine.acknowledge(incident_id, user.name):
        raise HTTPException(409, "Incident not found or not active")
    return {"ok": True, "incident": incident_id, "acknowledged_by": user.name}


@app.post("/api/notifications/read")
def notifications_read(_: User = Depends(require("view"))):
    engine.mark_notifications_read()
    return {"ok": True}


@app.get("/api/analytics")
def analytics(range: str = Query("7D", pattern="^(24H|7D|30D|90D)$"), _: User = Depends(require("analytics"))):
    with engine.lock:
        by_hazard: dict[str, int] = {}
        for i in engine.incidents:
            by_hazard[i["hazard"]] = by_hazard.get(i["hazard"], 0) + 1
        return {
            "range": range,
            "data_source": "SIMULATED",
            "alerts_by_hazard": by_hazard,
            "node_health": {h: sum(1 for n in engine.nodes.values() if n["health"] == h) for h in ("HEALTHY", "DEGRADED", "OFFLINE", "MAINTENANCE_REQUIRED")},
            "mean_battery": round(sum(n["battery"] for n in engine.nodes.values()) / len(engine.nodes), 2),
            "sensor_reliability": {n["id"]: round(sum(engine.weight(s) / max(s["rel"], 1e-6) for s in n["sensors"].values()) / len(n["sensors"]), 3) for n in engine.nodes.values()},
        }


@app.get("/api/regions")
def regions(_: User = Depends(require("gis"))):
    with engine.lock:
        out: dict[str, dict] = {}
        for n in engine.nodes.values():
            r = out.setdefault(n["district"], {"district": n["district"], "nodes": 0, "max_risk_score": 0.0, "active_alerts": 0, "data": "SIMULATED / demo exposure"})
            r["nodes"] += 1
            r["max_risk_score"] = round(max(r["max_risk_score"], n["E"]), 3)
        for i in engine.incidents:
            if i["status"] != "RESOLVED":
                for nid in i["node_ids"]:
                    out[engine.nodes[nid]["district"]]["active_alerts"] += 1
        return list(out.values())


@app.get("/api/maintenance", response_model=list[Maintenance])
def maintenance(_: User = Depends(require("view"))):
    with engine.lock:
        return list(engine.tickets)


@app.post("/api/maintenance/ticket", response_model=Maintenance, status_code=201)
def create_ticket(body: TicketCreate, user: User = Depends(require("maintenance"))):
    try:
        return engine.create_ticket(body.node_id, body.issue, body.category, body.priority, user.name)
    except KeyError:
        raise HTTPException(404, "Node not found")


@app.post("/api/maintenance/{ticket_id}/advance")
def advance_ticket(ticket_id: str, user: User = Depends(require("service_nodes"))):
    if not engine.advance(ticket_id, user.name):
        raise HTTPException(409, "Ticket not found or already resolved")
    return {"ok": True}


@app.post("/api/maintenance/{ticket_id}/resolve")
def resolve_ticket(ticket_id: str, user: User = Depends(require("service_nodes"))):
    if not engine.resolve(ticket_id, user.name):
        raise HTTPException(409, "Ticket not found or already resolved")
    return {"ok": True}


HARDWARE = {
    "hydro_flood_pod": [{"part": "DFRobot A02YYUW", "measures": "water level"}, {"part": "DFRobot SEN0575", "measures": "rainfall"}, {"part": "DHT22 / SHT31", "measures": "temperature / humidity"}],
    "fire_air_pod": [{"part": "Sensirion SPS30", "measures": "PM2.5 / PM10"}, {"part": "MQ-2", "measures": "smoke / combustible gas"}, {"part": "DHT22 / SHT31", "measures": "temperature / humidity"}],
    "universal_core": ["ESP32-S3 WROOM-1 / N16R8", "Seeed Wio-E5", "LiFePO4 IFR26650", "Solar 6V/9V 5–10W", "TP5000", "IP65 enclosure"],
    "gateway": {"prototype": "Raspberry Pi 5", "optional": "Raspberry Pi AI HAT+", "high_compute_production_target": "Qualcomm Dragonwing IQ-8275 (not required for every gateway)"},
}


@app.get("/api/hardware")
def hardware(_: User = Depends(require("view"))):
    return HARDWARE


@app.get("/api/ai/models")
def ai_models(_: User = Depends(require("view"))):
    p = Path(__file__).resolve().parents[3] / "services" / "ml" / "artifacts" / "registry.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"data_source": "registry not generated — run services/ml/train.py", "models": []}


# ------------------------------------------------------------------ simulation
def _sim(kind: str):
    def handler(_: User = Depends(require("simulate"))):
        steps = engine.scenario(kind)
        return {"scenario": kind, "steps": steps, "note": "SIMULATED scenario applied to the demo engine"}

    return handler


for _kind in ("flood", "fire", "pollution", "sensor-failure", "node-offline", "backhaul-outage", "normal", "restore-backhaul", "maintenance-event"):
    app.post(f"/api/simulation/{_kind}")(_sim(_kind))


# ------------------------------------------------------------------ websockets
async def _ws(channel: str, ws: WebSocket, token: str | None):
    if auth_required():
        user = decode(token) or decode(ws.cookies.get("iris_session"))
        if not user or not user.can("view"):
            await ws.close(code=4401)
            return
    await ws.accept()
    hub.channels[channel].add(ws)
    try:
        while True:
            await ws.receive_text()  # keep-alive; clients send nothing meaningful
    except WebSocketDisconnect:
        pass
    finally:
        hub.channels[channel].discard(ws)


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket, token: str | None = None):
    await _ws("events", ws, token)


@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket, token: str | None = None):
    await _ws("telemetry", ws, token)


@app.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket, token: str | None = None):
    await _ws("alerts", ws, token)


@app.websocket("/ws/state")
async def ws_state(ws: WebSocket, token: str | None = None):
    """Full-state stream (without history; only the newest telemetry point per metric) for the web UI."""
    await _ws("state", ws, token)
