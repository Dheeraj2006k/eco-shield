-- ECO-SHIELD database schema — PostgreSQL 15+ with the TimescaleDB extension.
-- All seeded/demo rows must set simulated = TRUE.

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE hazard_class   AS ENUM ('FLOOD','FIRE','AIR','LANDSLIDE','WATER_QUALITY','HEAT','INDUSTRIAL');
CREATE TYPE risk_level     AS ENUM ('NORMAL','WATCH','HIGH','CRITICAL');
CREATE TYPE node_health    AS ENUM ('HEALTHY','DEGRADED','OFFLINE','MAINTENANCE_REQUIRED');
CREATE TYPE sensor_health  AS ENUM ('HEALTHY','QUESTIONABLE','FAULT','CALIBRATION_REQUIRED');
CREATE TYPE quorum_status  AS ENUM ('NONE','SUSPICIOUS','CONFIRMED','SUPPRESSED');
CREATE TYPE incident_state AS ENUM ('WATCH','HIGH','CRITICAL','ACKNOWLEDGED','RESOLVED');
CREATE TYPE ticket_status  AS ENUM ('OPEN','ASSIGNED','IN_FIELD','SELF_TEST','RESOLVED');
CREATE TYPE user_role      AS ENUM ('ADMIN','AUTHORITY','OPERATOR','FIELD_STEWARD','VIEWER');

CREATE TABLE gateways (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  district      TEXT NOT NULL,
  location      GEOGRAPHY(Point, 4326),
  hardware      TEXT,
  simulated     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE nodes (
  id               TEXT PRIMARY KEY,               -- e.g. HYD-001
  node_type        TEXT NOT NULL,                  -- HYDRO_FLOOD_POD | FIRE_AIR_POD
  hazard           hazard_class NOT NULL,
  location         GEOGRAPHY(Point, 4326) NOT NULL,
  district         TEXT NOT NULL,
  region           TEXT NOT NULL,
  gateway_id       TEXT REFERENCES gateways(id),
  firmware_version TEXT,
  model_version    TEXT,
  installed_at     DATE,
  last_service     DATE,
  battery          REAL,
  solar            REAL,
  signal           REAL,
  last_seen        TIMESTAMPTZ,
  health_status    node_health NOT NULL DEFAULT 'HEALTHY',
  risk_level       risk_level  NOT NULL DEFAULT 'NORMAL',
  confidence       REAL,
  device_key_ref   TEXT,                           -- reference into a secret store / secure element; never the key itself
  simulated        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE installed_pods (
  id            TEXT PRIMARY KEY,
  node_id       TEXT NOT NULL REFERENCES nodes(id),
  pod_type      TEXT NOT NULL,
  serial        TEXT,
  installed_at  DATE NOT NULL,
  removed_at    DATE,
  removal_reason TEXT
);

CREATE TABLE sensors (
  id               TEXT PRIMARY KEY,
  node_id          TEXT NOT NULL REFERENCES nodes(id),
  sensor_type      TEXT NOT NULL,
  model            TEXT NOT NULL,
  unit             TEXT NOT NULL,
  health           sensor_health NOT NULL DEFAULT 'HEALTHY',
  calibration_date DATE,
  last_value       DOUBLE PRECISION,
  quality_score    REAL CHECK (quality_score BETWEEN 0 AND 1),
  base_reliability REAL CHECK (base_reliability BETWEEN 0 AND 1),
  relevance        REAL CHECK (relevance BETWEEN 0 AND 1)
);

-- Time-series telemetry
CREATE TABLE telemetry (
  ts         TIMESTAMPTZ NOT NULL,
  node_id    TEXT NOT NULL,
  sensor_id  TEXT NOT NULL,
  value      DOUBLE PRECISION NOT NULL,
  unit       TEXT NOT NULL,
  quality    REAL,
  battery    REAL,
  signal     REAL,
  simulated  BOOLEAN NOT NULL DEFAULT TRUE
);
SELECT create_hypertable('telemetry', 'ts', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX telemetry_node_ts ON telemetry (node_id, ts DESC);
SELECT add_retention_policy('telemetry', INTERVAL '180 days');

CREATE TABLE events (
  id              TEXT PRIMARY KEY,
  node_id         TEXT NOT NULL REFERENCES nodes(id),
  hazard          hazard_class NOT NULL,
  ts              TIMESTAMPTZ NOT NULL,
  severity        risk_level NOT NULL,
  confidence      REAL NOT NULL,
  evidence        JSONB NOT NULL,       -- per-source e_i, w_i, contribution
  sensor_health   JSONB NOT NULL,
  model_versions  JSONB NOT NULL,
  quorum          quorum_status NOT NULL
);
CREATE INDEX events_ts ON events (ts DESC);

CREATE TABLE incidents (
  id                 TEXT PRIMARY KEY,
  dedup_key          TEXT NOT NULL,     -- hazard + region: only one active incident per key
  hazard             hazard_class NOT NULL,
  severity           risk_level NOT NULL,          -- SEVERITY and CONFIDENCE are separate columns
  confidence         REAL NOT NULL,
  state              incident_state NOT NULL,
  location           TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  detections         INTEGER NOT NULL DEFAULT 1,
  duplicates_suppressed INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by    TEXT,
  acknowledged_at    TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  simulated          BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX one_active_incident_per_key ON incidents (dedup_key) WHERE state <> 'RESOLVED';

CREATE TABLE incident_events (
  incident_id TEXT REFERENCES incidents(id),
  event_id    TEXT REFERENCES events(id),
  PRIMARY KEY (incident_id, event_id)
);

CREATE TABLE maintenance_tickets (
  ticket_id       TEXT PRIMARY KEY,
  node_id         TEXT NOT NULL REFERENCES nodes(id),
  issue           TEXT NOT NULL,
  category        TEXT NOT NULL,
  priority        TEXT NOT NULL,
  assigned_to     TEXT,
  status          ticket_status NOT NULL DEFAULT 'OPEN',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  service_history JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE model_registry (
  name            TEXT NOT NULL,
  version         TEXT NOT NULL,
  trained_on      DATE,
  metrics         JSONB,
  target_platform TEXT,
  status          TEXT NOT NULL,
  deployment      TEXT NOT NULL DEFAULT 'NOT DEPLOYED',
  approved_by     TEXT,                 -- deployment requires a named human approver
  approved_at     TIMESTAMPTZ,
  PRIMARY KEY (name, version),
  CHECK (deployment <> 'DEPLOYED' OR approved_by IS NOT NULL)
);

CREATE TABLE audit_log (
  id        BIGSERIAL PRIMARY KEY,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor     TEXT NOT NULL,
  role      user_role,
  action    TEXT NOT NULL,
  target    TEXT,
  detail    JSONB
);
