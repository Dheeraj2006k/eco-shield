# API

Base URL `http://localhost:8000`. Interactive docs at `/docs`. All data is simulated.

**Auth:** `Authorization: Bearer <JWT>` (or the `iris_session` cookie). The web app issues the JWT at `POST /api/auth/login` (Next.js, port 3000) signed with `IRIS_AUTH_SECRET`; claims `sub`, `name`, `role`, `exp`. Missing/invalid → `401`; insufficient role → `403`.

## REST

| Method | Path | Capability | Notes |
|---|---|---|---|
| GET | `/api/health` | public | status, auth flag, tick |
| GET | `/api/nodes?hazard=` | view | list |
| GET | `/api/nodes/{id}` | view | node + sensors (quality, freshness, reliability weight) |
| GET | `/api/nodes/{id}/telemetry?metric=&limit=` | view | recent points (`limit` ≤ 240) |
| GET | `/api/alerts?status=&hazard=` | view | incidents |
| GET | `/api/alerts/{id}` | view | incident + events + fusion evidence |
| POST | `/api/alerts/{id}/acknowledge` | ack_alerts | 409 if not active |
| GET | `/api/analytics?range=24H\|7D\|30D\|90D` | analytics | |
| GET | `/api/regions` | gis | |
| GET | `/api/maintenance` | view | tickets |
| POST | `/api/maintenance/ticket` | maintenance | body below |
| POST | `/api/maintenance/{id}/advance` | service_nodes | next workflow step |
| POST | `/api/maintenance/{id}/resolve` | service_nodes | applies service effects to the node |
| GET | `/api/hardware` | view | |
| GET | `/api/ai/models` | view | registry from `services/ml/artifacts/registry.json` |
| POST | `/api/simulation/{flood\|fire\|pollution\|sensor-failure\|node-offline\|backhaul-outage\|normal\|restore-backhaul\|maintenance-event}` | simulate | |

Ticket body: `{"node_id":"HYD-001","issue":"Clean the rain gauge","category":"CLEANING","priority":"LOW"}` (`node_id` must match `AAA-000`, `issue` 5–200 chars) → `201` + ticket.

Example — node:

```json
{"id":"HYD-001","type":"HYDRO_FLOOD_POD","gateway_id":"GW-HRD-01","battery":92.0,"signal":-92.3,
 "health_status":"HEALTHY","risk_level":"NORMAL","risk_score":0.08,"confidence":0.82,"quorum":"NONE",
 "sensors":[{"id":"HYD-001-water_level","type":"water_level","unit":"cm","last_value":141.2,
             "quality_score":0.96,"freshness":1.0,"reliability_weight":0.8294,"health":"HEALTHY"}],
 "simulated":true}
```

Example — incident:

```json
{"id":"INC-1001","hazard":"FLOOD","severity":"CRITICAL","confidence":0.77,"confidence_level":"HIGH",
 "state":"CRITICAL","status":"ACTIVE","location":"Upper Ganga Corridor · Dehradun",
 "recommended_action":"Notify downstream flood-prone areas and local authority.",
 "detections":14,"duplicates_suppressed":11,
 "decision_support_note":"Decision support — not autonomous emergency command.","simulated":true}
```

## WebSocket

Connect with `?token=<JWT>` (or the session cookie). Unauthenticated connections are closed with code `4401`.

| Path | Message |
|---|---|
| `/ws/events` | `{"type":"event","data":{"id","at","level","source","message"}}` per engine log entry |
| `/ws/telemetry` | `{"type":"telemetry","data":[{"node_id","battery","signal","risk","quorum","values":{…},"simulated":true}]}` every ~1.5 s |
| `/ws/alerts` | `{"type":"alerts","data":[Incident…]}` whenever the set of active incidents changes |

## MQTT (optional)

`iris/telemetry/<node_id>` ← `{"sensor":"water_level","value":152.4}`. Enable with `IRIS_MQTT_ENABLED=true`; run `services/simulation/simulator.py` to publish simulated readings.
