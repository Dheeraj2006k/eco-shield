-- ECO-SHIELD — Supabase (PostgreSQL) migration.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run (every statement is idempotent).
--
-- Scope: this persists the API's mutable operational state — incidents, maintenance
-- tickets and events — exactly as apps/api/app/storage.py's PgStorage writes them.
-- Nodes, sensors, gateways and telemetry are pure in-memory simulation state (regenerated
-- on API restart) and are NOT written here. The full fleet schema in schema.sql
-- (nodes/sensors/telemetry/model_registry/audit_log, TimescaleDB) is the target for a
-- later move off the demo engine to a real device fleet; skip it on Supabase for now —
-- Supabase does not offer the TimescaleDB extension that schema depends on.
--
-- This connects with the plain Postgres "connection string" (Project Settings → Database
-- → Connection string → URI), not the REST/anon key, so Row Level Security does not apply
-- and is intentionally left off these tables.

create extension if not exists pgcrypto;

do $$ begin
  create type hazard_class as enum ('FLOOD','FIRE','AIR','LANDSLIDE','WATER_QUALITY','HEAT','INDUSTRIAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type risk_level as enum ('NORMAL','WATCH','HIGH','CRITICAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type confidence_level as enum ('LOW','MEDIUM','HIGH');
exception when duplicate_object then null; end $$;

do $$ begin
  create type incident_state as enum ('WATCH','HIGH','CRITICAL','ACKNOWLEDGED','RESOLVED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type incident_status as enum ('ACTIVE','ACKNOWLEDGED','RESOLVED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('OPEN','ASSIGNED','IN_FIELD','SELF_TEST','RESOLVED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_priority as enum ('LOW','MEDIUM','HIGH','URGENT');
exception when duplicate_object then null; end $$;

-- One active incident per (hazard + region) "key" is enforced below with a partial
-- unique index — this is the database-level guarantee behind the app's de-duplication.
create table if not exists incidents (
  id                     text primary key,               -- e.g. INC-1007
  key                    text not null,                   -- "<hazard>:<region>" dedup key
  event_ids              jsonb not null default '[]',
  hazard                 hazard_class not null,
  severity               risk_level not null,             -- SEVERITY and CONFIDENCE are independent axes
  peak_severity          risk_level not null,
  confidence             double precision not null,
  confidence_level       confidence_level not null,
  state                  incident_state not null,
  location               text not null,
  district               text,
  lat                    double precision,
  lon                    double precision,
  node_ids               jsonb not null default '[]',
  primary_node_id        text,
  status                 incident_status not null,
  recommended_action     text not null,
  created_at             double precision not null,       -- epoch milliseconds (matches the engine)
  updated_at             double precision,
  acknowledged_at        double precision,
  acknowledged_by        text,
  resolved_at            double precision,
  detections             integer not null default 1,
  duplicates_suppressed  integer not null default 0,
  history                jsonb not null default '[]',
  fusion                 jsonb,
  dissemination          jsonb,
  simulated              boolean not null default true
);

create unique index if not exists incidents_one_active_per_key
  on incidents (key) where status <> 'RESOLVED';
create index if not exists incidents_created_at on incidents (created_at desc);

create table if not exists maintenance_tickets (
  ticket_id        text primary key,                      -- e.g. MT-1049
  node_id          text not null,
  issue            text not null,
  category         text not null,
  priority         ticket_priority not null,
  assigned_to      text,
  status           ticket_status not null,
  created_at       double precision not null,
  resolved_at      double precision,
  service_history  jsonb not null default '[]'
);
create index if not exists tickets_created_at on maintenance_tickets (created_at desc);

create table if not exists events (
  id              text primary key,                       -- e.g. EVT-42
  node_id         text not null,
  hazard          hazard_class not null,
  "timestamp"     double precision not null,
  severity        risk_level not null,
  confidence      double precision not null,
  evidence        jsonb not null default '[]',             -- per-source eᵢ, wᵢ, contribution
  sensor_health   jsonb not null default '{}',
  model_versions  jsonb not null default '{}'
);
create index if not exists events_timestamp on events ("timestamp" desc);

comment on table incidents is 'ECO-SHIELD demo incidents (all simulated). Mirrors apps/api/app/engine.py incident dicts 1:1.';
comment on table maintenance_tickets is 'ECO-SHIELD demo maintenance tickets (all simulated).';
comment on table events is 'ECO-SHIELD demo detection events feeding incidents (all simulated).';
