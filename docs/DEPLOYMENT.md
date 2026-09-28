# Deployment

> Docker artifacts in this repository were authored but **not executed** in the environment where the project was built (Docker unavailable there). Treat the first `docker compose up` as a validation step.

## Local (no Docker)

```bash
npm install && npm run gen-env && npm run dev                      # web :3000
pip install -r apps/api/requirements.txt
cd apps/api && uvicorn app.main:app --port 8000                    # api :8000
```

## Docker Compose

```bash
cp .env.example .env          # fill every value; compose fails fast if a required one is missing
# MQTT credentials (only if IRIS_MQTT_ENABLED=true): see infrastructure/mqtt/README.md
docker compose up --build
```

Services: `web` (Next.js standalone, :3000), `api` (FastAPI, :8000), `db` (TimescaleDB + PostGIS, schema auto-loaded), `cache` (Redis), `mqtt` (Mosquitto, :1883), `storage` (MinIO, console :9001).
Note: `mqtt` mounts `infrastructure/mqtt/passwd`, which you must create locally; comment out that mount and `allow_anonymous false` if you do not use MQTT.

## Production checklist

- Terminate **TLS** at a reverse proxy; unset `IRIS_INSECURE_COOKIES`; set `IRIS_CORS_ORIGINS` to the real origin.
- Rotate `IRIS_AUTH_SECRET`; store secrets in a secret manager, not `.env` files.
- Replace the env-var user list with an identity provider or hashed DB users; put login rate-limiting in a shared store (Redis).
- Enable MQTT TLS and per-device credentials or client certificates; provision device keys (secure element / provisioning service).
- Persist state: wire the API to PostgreSQL/TimescaleDB (`schema.sql` is ready; the in-memory engine is a demo stand-in) and run the alert engine as a single writer.
- Real dissemination requires agreements with SMS/voice providers and the national alerting authority for CAP/SACHET; none is implemented.
- Model deployment stays behind human approval (`model_registry.approved_by`).
- Gateways: Raspberry Pi 5 prototype units run the edge runtime locally; heavier vision sites can use Qualcomm Dragonwing IQ-8275.

## Scaling

Nodes are stateless devices; add gateways per catchment/district. The API scales horizontally once state lives in the database; WebSocket fan-out should move to Redis pub/sub at that point. Telemetry uses a TimescaleDB hypertable with a 180-day retention policy (adjustable).
