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
cd apps/api && python -m pytest          # 6 API tests (auth, RBAC, dedup, suppression, tickets, websocket auth)
cd services/ml && python -m pytest       # fusion / quorum / CUSUM tests
cd apps/web && npx tsc --noEmit && npx tsx scripts/engine-test.ts   # typecheck + headless engine scenarios
```

## Environment variables

See `.env.example`. Nothing secret is committed; `.env*` files are git-ignored.

| Variable | Used by | Purpose |
|---|---|---|
| `IRIS_AUTH_SECRET` | web, api | HS256 signing secret (≥ 32 chars). Web issues the session JWT; API verifies it |
| `IRIS_USERS` | web | `user\|ROLE\|password,...` (demo-grade credential store) |
| `NEXT_PUBLIC_API_URL` | web | Backend URL for the Settings connectivity check |
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

## Integration status (please read)

- The **web UI runs its own in-browser demo engine** (`apps/web/src/lib/engine`). It does not require the API.
- The **API contains a parallel Python engine** with the same fusion/quorum/dedup logic, REST and WebSocket endpoints, and tests. **The UI is not yet switched to consume it** — Settings only checks that it is reachable.
- Browser engine state lives in memory: a full page reload resets the demo. Navigate with in-app links during a presentation.
- Docker files and `docker-compose.yml` were written but **not executed** in the authoring environment (no Docker available).
- LoRaWAN, camera/vision inference, SMS/voice/CAP-SACHET dispatch and device key management are represented as simulated flows or documented integration points.

## Demo

See `docs/DEMO_GUIDE.md` (5–10 minute SIH flow). Deployment: `docs/DEPLOYMENT.md`.
