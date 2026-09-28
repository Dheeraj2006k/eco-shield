# ECO-SHIELD

**ECO** — Ecological · **SHIELD** — **S**mart **H**azard **I**ntelligence & **E**nvironmental **L**ocal **D**etection

AI-powered multi-hazard environmental monitoring and early warning.
*Modular sensing → edge intelligence → validated risk → regional intelligence → actionable warning.*

> **Demonstration build.** Every reading, node, gateway, incident and alert in this repository is **simulated**.
> The UI labels it as such everywhere. No real deployment, live field data, transmitted SMS/CAP message, or trained vision model is claimed.
> ECO-SHIELD is *decision support*, not an autonomous emergency command.

## What is in the box

| Path | What it is |
|---|---|
| `apps/web` | Next.js 15 + TypeScript + Tailwind command-center UI (17 routes), auth/RBAC, in-browser demo engine |
| `apps/api` | FastAPI backend: REST + WebSocket, JWT/RBAC, server-side demo engine, optional MQTT bridge |
| `services/ml` | Reference AI-0/AI-1 code: EWMA/Kalman/CUSUM, evidence fusion, Isolation Forest, XGBoost, GRU (PyTorch); `train.py` emits the model registry |
| `services/simulation` | Standalone MQTT telemetry simulator (payloads flagged `simulated: true`) |
| `packages/{types,config,ui}` | Shared TypeScript types, thresholds/RBAC config, UI primitives |
| `infrastructure` | `docker/` Dockerfiles, `database/schema.sql` (PostgreSQL + TimescaleDB + PostGIS), `mqtt/` Mosquitto config |
| `docs` | `ARCHITECTURE.md`, `API.md`, `DEMO_GUIDE.md`, `DEPLOYMENT.md` |

## Features

- Public landing page, sign-in, and a persistent command-center shell (sidebar, top bar, notifications, search, mobile drawer + bottom nav).
- **Dashboard**, **Live GIS map** (Leaflet, node/health/risk/rainfall/water/air/fire/population/infrastructure layers), **Nodes** and **Node detail** (telemetry charts, AI-0 indicators, sensor-pod visual, maintenance mode).
- **Alert Center / Alert detail**: severity and confidence kept separate, evidence contribution, quorum status, alert state machine, de-duplication and escalation, dissemination + backhaul-independent local response.
- **AI Intelligence**: AI-0/1/2 model cards, reliability-weighted evidence fusion, quorum gating, model lifecycle, model registry (real metrics on synthetic data) with human approval gate.
- **Analytics**, **Regional risk map**, **Maintenance** (lifecycle workflow, tickets that change node state, community/institutional O&M *proposal*), **Simulation** sandbox + **Digital twin** (advanced/research), **Vision AI**, **Architecture**, **Hardware**, **Settings**.
- **Demo Control Center**: eight scenarios that drive one central engine, so every page updates together.

## Quick start (local, no Docker)

Requirements: Node 20+, Python 3.11+.

```bash
npm install
npm run gen-env          # writes git-ignored apps/web/.env.local and apps/api/.env with random secrets, prints demo logins once
npm run dev              # web on http://localhost:3000
```

Optional backend and ML:

```bash
pip install -r apps/api/requirements.txt -r services/ml/requirements.txt
cd apps/api && uvicorn app.main:app --reload --port 8000        # API docs at /docs
cd services/ml && python train.py --web-out ../../apps/web/src/data/model-registry.json
```

Tests:

```bash
cd apps/api && python -m pytest          # 10 API tests (auth, RBAC, dedup, suppression, outage queueing, tickets, maintenance mode, snapshot shape, persistence, websocket auth)
cd services/ml && python -m pytest       # fusion / quorum / CUSUM tests
cd apps/web && npx tsc --noEmit && npx tsx scripts/engine-test.ts   # typecheck + headless engine scenarios
# API/UI parity: dump a snapshot (see scripts/parity.ts header) then: npx tsx scripts/parity.ts
```

## Environment variables

See `.env.example`. Nothing secret is committed; `.env*` files are git-ignored.

| Variable | Used by | Purpose |
|---|---|---|
| `IRIS_AUTH_SECRET` | web, api | HS256 signing secret (≥ 32 chars). Web issues the session JWT; API verifies it |
| `IRIS_USERS` | web | `user\|ROLE\|password,...` (demo-grade credential store) |
| `NEXT_PUBLIC_API_URL` | web | Backend URL; enables the *Backend API* data source |
| `NEXT_PUBLIC_DEFAULT_SOURCE` | web | `remote` to start on the backend (default: local engine) |
| `IRIS_DB_PATH` | api | SQLite file for persisted incidents/tickets (`:memory:` disables) |
| `IRIS_AUTH_REQUIRED` | api | `false` only for local dev; defaults to `true` |
| `IRIS_CORS_ORIGINS` | api | Allowed web origins |
| `IRIS_MQTT_ENABLED/HOST/USER/PASSWORD` | api, simulation | Optional MQTT ingestion |
| `POSTGRES_PASSWORD`, `MINIO_ROOT_USER/PASSWORD` | compose | Infrastructure credentials |

## Roles (RBAC)

`ADMIN` everything · `AUTHORITY` alerts, regional/GIS, analytics · `OPERATOR` nodes, alerts, AI, simulations · `FIELD_STEWARD` maintenance, service, replacement, calibration · `VIEWER` read-only.
Routes are enforced in Next.js middleware, write actions are gated in the UI and re-checked by the API.

## Database

`infrastructure/database/schema.sql` defines nodes, sensors, pods, a TimescaleDB hypertable for telemetry, events, incidents (a partial unique index enforces one active incident per dedup key), tickets, model registry (deployment requires a named approver) and an audit log.
**The current web app and API run in memory; the schema is provided and Compose loads it, but persistence code is not wired in yet.**

## Data sources & integration status

The UI can run against either source (Settings → *Data mode*, or `NEXT_PUBLIC_DEFAULT_SOURCE=remote`):

- **Local demo engine (default)** — the simulation runs in the browser (`apps/web/src/lib/engine`). No backend needed; works on Vercel with no other service. State lives in memory and resets on reload.
- **Backend API** — the FastAPI engine (`apps/api`) runs the same simulation server-side. The UI loads `/api/snapshot`, then follows `/ws/state`; every action (scenarios, acknowledge, tickets, maintenance mode) is a REST call re-checked against the caller's role. Incidents, tickets and events are persisted to SQLite (`IRIS_DB_PATH`) and survive API restarts. The web app mints a 15-minute bearer token at `/api/backend-token` for the cross-origin calls.

The Python and TypeScript engines are kept in step: `apps/web/scripts/parity.ts` checks that the API snapshot has exactly the shape the UI expects.

Still true: all data is simulated; SMS/voice/CAP-SACHET dispatch, LoRaWAN and camera inference are simulated flows; vision models are not trained; the PostgreSQL/TimescaleDB schema is provided but the API persists to SQLite for now; Docker files are untested (no Docker in the authoring environment).

## Demo

See `docs/DEMO_GUIDE.md` (5–10 minute SIH flow). Deployment: `docs/DEPLOYMENT.md`.
