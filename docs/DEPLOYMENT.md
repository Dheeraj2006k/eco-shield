# Deployment

ECO-SHIELD has two deployable pieces:

| Piece | Where | Needed? |
|---|---|---|
| **Web app** (`apps/web`, Next.js) | **Vercel** | Yes — this alone is a complete demo (browser-side simulation) |
| **API** (`apps/api`, FastAPI + WebSocket) | Render / Railway / Fly / any Docker host — **not Vercel** (Vercel serverless can't hold a WebSocket or a long-running simulation loop) | Optional — enables the *Backend API* data source and server-side persistence |

## 1. Deploy the web app on Vercel

1. Push the repo to GitHub (already done: `Dheeraj2006k/eco-shield`).
2. Vercel dashboard → **Add New… → Project** → import the repo.
3. **Root Directory:** `apps/web`. Keep *Include source files outside of the Root Directory* **enabled** (the app imports `packages/*`).
4. Framework preset: **Next.js** (auto). Don't override the build/install commands. If the install fails to resolve `@iris/*`, set *Install Command* to `cd ../.. && npm ci` and leave the build command as `next build`.
5. **Environment Variables** (Production + Preview):

   | Name | Value |
   |---|---|
   | `IRIS_AUTH_SECRET` | ≥ 32 random chars — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `IRIS_USERS` | `admin\|ADMIN\|<strong-pass>,operator\|OPERATOR\|<pass>,steward\|FIELD_STEWARD\|<pass>,authority\|AUTHORITY\|<pass>,viewer\|VIEWER\|<pass>` |

   Do **not** set `IRIS_INSECURE_COOKIES` (Vercel is HTTPS). Values are never committed; use fresh passwords.
6. **Deploy** (~2 min).
7. **Verify:** open `https://<your-app>.vercel.app/api/health` → expect `{"status":"ok","auth_configured":true,…}`. `503 misconfigured` means a variable is missing or the secret is < 32 chars (redeploy after fixing — env changes only apply to new deployments). Then sign in as `admin` and run Demo Control → **SIMULATE FLOOD**.

Notes: the deployed demo runs its simulation in the visitor's browser (state resets on reload). The login throttle is per serverless instance, so it is not a hard lockout. The map uses OpenStreetMap's public tile server (fine for a demo).

## 2. (Optional) Host the API and connect the web app to it

### 2a. Deploy the API on Render

1. Render → **New → Blueprint**, pick this repo (it reads `render.yaml`), or create a **Web Service** with *Runtime: Docker*, Dockerfile `infrastructure/docker/api.Dockerfile`, context = repo root.
2. Set env vars on the service:
   - `IRIS_AUTH_SECRET` — **exactly the same value as in Vercel**
   - `IRIS_CORS_ORIGINS` — your Vercel origin, e.g. `https://eco-shield.vercel.app` (comma-separate to add a custom domain)
   - `IRIS_AUTH_REQUIRED=true` (default)
   - `IRIS_DB_PATH=/tmp/iris_state.db` (ephemeral) or `/data/iris_state.db` with a persistent disk mounted at `/data` (paid plan) so incidents/tickets survive redeploys
3. Health check path: `/api/health`. Render terminates TLS, so the API URL is `https://…onrender.com` and WebSockets are `wss://` automatically.
4. Free instances sleep after inactivity; the first request wakes them (~30–60 s). The simulation state restarts from baseline on each wake, but persisted incidents/tickets are restored if the disk survives.

### 2b. Point the web app at it

In Vercel add: `NEXT_PUBLIC_API_URL=https://<your-api>.onrender.com` (no trailing slash) and, optionally, `NEXT_PUBLIC_DEFAULT_SOURCE=remote`. Redeploy (`NEXT_PUBLIC_*` values are baked in at build time). Then sign in → **Settings → Data mode → Backend API**; the top bar shows *API live*. If the API is unreachable the UI shows a banner and offers to switch back to the local engine.

> The Docker/Render files were written but **not executed** in the authoring environment (no Docker available) — treat the first API deploy as a validation step. The API itself is tested (`cd apps/api && python -m pytest`) and was exercised end-to-end locally with the web app.

## Local

```bash
npm install && npm run gen-env && npm run dev                                   # web :3000
pip install -r apps/api/requirements.txt
cd apps/api && uvicorn app.main:app --port 8000                                  # api :8000 (reads IRIS_* from the environment)
```

`gen-env` writes `apps/api/.env` but `uvicorn` does not load it automatically — export the variables (or use `--env-file .env`).

## Docker Compose (self-host everything)

```bash
cp .env.example .env          # fill every value; compose fails fast if a required one is missing
docker compose up --build     # web :3000, api :8000, db, cache, mqtt, storage
```

Services: `web` (Next.js standalone), `api` (FastAPI), `db` (TimescaleDB + PostGIS, `schema.sql` auto-loaded — the API does not use it yet), `cache` (Redis), `mqtt` (Mosquitto; create `infrastructure/mqtt/passwd` first — see its README), `storage` (MinIO).

## Production checklist

- TLS everywhere; unset `IRIS_INSECURE_COOKIES`; restrict `IRIS_CORS_ORIGINS` to real origins.
- Rotate `IRIS_AUTH_SECRET`; use a secret manager. Replace the env-var user list with an identity provider or hashed DB users; move login throttling to a shared store (Redis).
- Move the WebSocket token from the query string to a subprotocol header or one-time ticket.
- **Database (Supabase or any PostgreSQL):**
  1. Create a Supabase project (or any Postgres instance).
  2. Open Supabase → SQL Editor → paste the contents of `infrastructure/database/supabase.sql` → Run. (The API also runs this itself on startup, so this step is a safety net, not a hard requirement.)
  3. Copy Project Settings → Database → Connection string → **URI** (the direct connection, not the pooler).
  4. On the API host (Render, etc.) set `DATABASE_URL` to that string. Persistence switches from SQLite to Postgres automatically — no code change, no redeploy of the web app needed.
  5. Verify: `curl https://<api>/api/health` → `"persistence":"postgresql"`.
  Run the alert engine as a single writer regardless of backend.
- MQTT: TLS + per-device credentials/client certificates; provision device keys (secure element / provisioning service).
- Real dissemination needs agreements with SMS/voice providers and the national alerting authority for CAP/SACHET; none is implemented.
- Model deployment stays behind human approval (`model_registry.approved_by`).
- Gateways: Raspberry Pi 5 prototype units run the edge runtime; heavier vision sites can use Qualcomm Dragonwing IQ-8275 (not required for every gateway).
