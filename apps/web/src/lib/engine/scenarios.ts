import type { ScenarioKind, ScenarioRun, SensorType } from '@iris/types';
import { baselineValue } from './seed';
import { advanceTicket, createTicket } from './tickets';
import type { EngineData } from './types';
import { addLog, notify } from './util';

interface StepDef {
  at: number;
  label: string;
  stage: string;
  run?: (d: EngineData) => void;
}

const force = (d: EngineData, node: string, type: SensorType, value: number) => {
  (d.forcing[node] ??= {})[type] = value;
};

const camTarget = (d: EngineData, node: string, v: number) => {
  if (d.camera[node]) d.camera[node].target = v;
};

export const SCENARIO_META: Record<ScenarioKind, { label: string; blurb: string }> = {
  NORMAL: { label: 'Normal system', blurb: 'Return every node, gateway and sensor to baseline; open incidents auto-resolve.' },
  FLOOD: { label: 'Simulate flood', blurb: 'Upstream rain → HYD-001 rises (suspicious) → HYD-002 corroborates (confirmed) → CRITICAL incident → siren + geo-targeted alerts.' },
  FIRE: { label: 'Simulate fire', blurb: 'Smoke + heat at FIR-001, camera verification, neighbor corroboration, smoke drift toward the airshed.' },
  POLLUTION: { label: 'Simulate pollution', blurb: 'Stagnant air: PM2.5/PM10 rise across the Doon Valley airshed nodes.' },
  SENSOR_FAILURE: { label: 'Simulate sensor failure', blurb: 'HYD-002 water-level sensor spikes; plausibility + neighbor cross-check down-weight it and suppress the alert.' },
  NODE_OFFLINE: { label: 'Simulate node offline', blurb: 'HYD-003 stops reporting; freshness decays, maintenance ticket opened.' },
  BACKHAUL_OUTAGE: { label: 'Simulate backhaul outage', blurb: 'GW-HRD-01 uplink fails: cloud channels queue while edge inference and local siren keep working.' },
  MAINTENANCE: { label: 'Trigger maintenance event', blurb: 'AIR-001 pod degrades → ticket → steward → pod replacement → self-test + calibration → back online.' },
  LANDSLIDE: { label: 'Landslide (sandbox only)', blurb: 'No landslide pod is deployed in the demo network; use the Simulation sandbox.' },
};

function clearHazardForcing(d: EngineData, prefix: string) {
  for (const n of d.nodes) if (n.id.startsWith(prefix)) delete d.forcing[n.id];
}

export function resetToNormal(d: EngineData, note = true) {
  d.forcing = {};
  d.healthOverride = {};
  d.externalTarget = {};
  for (const cam of Object.values(d.camera)) cam.target = 0.03;
  for (const g of d.gateways) g.uplink_ok = true;
  for (const n of d.nodes) {
    n.maintenance_mode = false;
    for (const s of n.sensors) {
      if (s.fault) s.last_value = baselineValue(n.id, s.type);
      s.fault = null;
      if (s.health === 'CALIBRATION_REQUIRED' && !d.tickets.some((t) => t.node_id === n.id && t.status !== 'RESOLVED')) s.health = 'HEALTHY';
    }
  }
  d.scenarioActive = {};
  if (note) addLog(d, 'OK', 'SCENARIO', 'Returned to NORMAL — forcing cleared, faults cleared, uplinks restored. Open incidents auto-resolve once evidence stays clear.');
}

export function restoreBackhaul(d: EngineData) {
  for (const g of d.gateways) g.uplink_ok = true;
  addLog(d, 'OK', 'BACKHAUL', 'Backhaul restored — queued cloud alerts and buffered telemetry are being released.');
  notify(d, 'ok', 'Backhaul restored', 'Queued messages released.');
}

function build(d: EngineData, kind: ScenarioKind): StepDef[] {
  switch (kind) {
    case 'FLOOD':
      clearHazardForcing(d, 'HYD');
      return [
        { at: 0, stage: 'sensing', label: 'Heavy rainfall upstream — rain gauges HYD-001 / HYD-002 rising', run: (x) => { x.externalTarget.rainfall_forecast_mm = 52; force(x, 'HYD-001', 'rainfall', 34); force(x, 'HYD-002', 'rainfall', 24); force(x, 'HYD-003', 'rainfall', 9); } },
        { at: 3, stage: 'node_ai', label: 'HYD-001 water level climbing — AI-0 EWMA/CUSUM raises anomaly', run: (x) => force(x, 'HYD-001', 'water_level', 305) },
        { at: 6, stage: 'lorawan', label: 'Compact anomaly packets uplinked over LoRaWAN → GW-HRD-01', run: (x) => addLog(x, 'INFO', 'LoRaWAN', 'Anomaly packets from HYD-001 received at GW-HRD-01 (RSSI/SNR nominal).') },
        { at: 8, stage: 'evidence', label: 'HYD-002 corroborates — neighbor evidence rises', run: (x) => force(x, 'HYD-002', 'water_level', 290) },
        { at: 12, stage: 'quorum', label: 'AI-1 quorum gate: single-source SUSPICIOUS → multi-source CONFIRMED', run: (x) => addLog(x, 'INFO', 'AI-1', 'Edge models (XGBoost, GRU, IsoForest) agree with sensor + neighbor evidence.') },
        { at: 14, stage: 'risk', label: 'Levels exceed danger thresholds — risk escalates', run: (x) => { force(x, 'HYD-001', 'water_level', 352); force(x, 'HYD-002', 'water_level', 338); force(x, 'HYD-003', 'water_level', 255); } },
        { at: 20, stage: 'alert', label: 'Rise propagating downstream — HYD-003 corroborates', run: (x) => force(x, 'HYD-003', 'water_level', 325) },
        { at: 26, stage: 'dissemination', label: 'Geo-targeted alert cascade + local siren (edge-triggered)', run: (x) => addLog(x, 'INFO', 'DISSEMINATION', 'Decision support issued to authority; downstream zone geofence selected. (SIMULATED)') },
      ];
    case 'FIRE':
      clearHazardForcing(d, 'FIR');
      return [
        { at: 0, stage: 'sensing', label: 'Smoke + heat rising near FIR-001; dry, windy conditions', run: (x) => { x.externalTarget.humidity_pct = 24; x.externalTarget.wind_kmh = 30; force(x, 'FIR-001', 'smoke', 430); force(x, 'FIR-001', 'temperature', 48); force(x, 'FIR-001', 'pm25', 170); force(x, 'FIR-001', 'humidity', 20); } },
        { at: 4, stage: 'node_ai', label: 'AI-0 smoke-slope anomaly on FIR-001', run: (x) => addLog(x, 'INFO', 'AI-0', 'FIR-001 smoke slope + temperature persist above EWMA baseline.') },
        { at: 6, stage: 'edge_ai', label: 'Camera verification — RTMDet + MobileNetV3-Small detect smoke plume', run: (x) => camTarget(x, 'FIR-001', 0.66) },
        { at: 11, stage: 'evidence', label: 'FIR-002 corroborates (smoke + temperature)', run: (x) => { force(x, 'FIR-002', 'smoke', 320); force(x, 'FIR-002', 'temperature', 43); force(x, 'FIR-002', 'pm25', 120); } },
        { at: 15, stage: 'risk', label: 'Camera confirms flame front; smoke intensifies', run: (x) => { camTarget(x, 'FIR-001', 0.92); force(x, 'FIR-001', 'smoke', 660); force(x, 'FIR-001', 'temperature', 57); force(x, 'FIR-002', 'smoke', 520); } },
        { at: 20, stage: 'alert', label: 'Smoke drifting into the airshed — AIR-002 PM2.5 rising', run: (x) => { force(x, 'AIR-002', 'pm25', 150); force(x, 'AIR-002', 'pm10', 240); } },
      ];
    case 'POLLUTION':
      clearHazardForcing(d, 'AIR');
      return [
        { at: 0, stage: 'sensing', label: 'Stagnant conditions — PM2.5 rising at AIR-002', run: (x) => { x.externalTarget.stagnation_index = 0.9; force(x, 'AIR-002', 'pm25', 190); force(x, 'AIR-002', 'pm10', 330); } },
        { at: 4, stage: 'node_ai', label: 'AI-0 flags PM drift persistence at AIR-002' },
        { at: 6, stage: 'evidence', label: 'AIR-001 corroborates', run: (x) => { force(x, 'AIR-001', 'pm25', 200); force(x, 'AIR-001', 'pm10', 340); } },
        { at: 10, stage: 'quorum', label: 'Quorum: multiple airshed nodes agree', run: (x) => { force(x, 'AIR-003', 'pm25', 175); force(x, 'AIR-003', 'pm10', 305); } },
        { at: 16, stage: 'risk', label: 'Concentrations climb further', run: (x) => { force(x, 'AIR-001', 'pm25', 265); force(x, 'AIR-002', 'pm25', 280); force(x, 'AIR-003', 'pm25', 235); force(x, 'AIR-002', 'pm10', 430); } },
      ];
    case 'SENSOR_FAILURE': {
      return [
        {
          at: 0, stage: 'node_ai', label: 'HYD-002 water-level sensor reports an implausible spike',
          run: (x) => {
            const s = x.nodes.find((n) => n.id === 'HYD-002')!.sensors.find((q) => q.type === 'water_level')!;
            s.fault = 'SPIKE';
            addLog(x, 'WARN', 'AI-0 · HYD-002', 'Plausibility check FAILED on water_level: rate-of-change exceeds physical limit → data quality collapsed.');
          },
        },
        { at: 4, stage: 'evidence', label: 'Neighbor cross-check disagrees — HYD-001 / HYD-003 normal; sensor evidence down-weighted', run: (x) => addLog(x, 'INFO', 'AI-1', 'HYD-002 sensor weight reduced (quality × freshness). Neighbor nodes contradict the reading.') },
        { at: 7, stage: 'quorum', label: 'Quorum: DOWN-WEIGHT / SUPPRESS — no false flood alert raised' },
        { at: 9, stage: 'alert', label: 'Maintenance ticket opened for sensor replacement', run: (x) => { createTicket(x, { node_id: 'HYD-002', issue: 'Water-level sensor (A02YYUW) fault — implausible readings', category: 'SENSOR_REPLACEMENT', priority: 'HIGH' }); } },
      ];
    }
    case 'NODE_OFFLINE':
      return [
        {
          at: 0, stage: 'lorawan', label: 'HYD-003 stops reporting',
          run: (x) => {
            x.healthOverride['HYD-003'] = 'OFFLINE';
            addLog(x, 'WARN', 'LoRaWAN', 'HYD-003: no uplink — gateway GW-TEH-01 missed heartbeat.');
          },
        },
        { at: 4, stage: 'evidence', label: 'Freshness decays; HYD-003 excluded from neighbor evidence', run: (x) => addLog(x, 'INFO', 'AI-1', 'HYD-003 evidence weight → 0 (freshness). Regional coverage reduced.') },
        { at: 6, stage: 'alert', label: 'Connectivity ticket opened', run: (x) => { createTicket(x, { node_id: 'HYD-003', issue: 'Node offline — no LoRaWAN heartbeat', category: 'CONNECTIVITY', priority: 'URGENT' }); notify(x, 'warn', 'HYD-003 offline', 'Node not reporting.', '/nodes/HYD-003'); } },
      ];
    case 'BACKHAUL_OUTAGE':
      return [
        {
          at: 0, stage: 'dissemination', label: 'GW-HRD-01 uplink fails — edge keeps operating',
          run: (x) => {
            const g = x.gateways.find((q) => q.id === 'GW-HRD-01')!;
            g.uplink_ok = false;
            addLog(x, 'WARN', 'BACKHAUL', 'GW-HRD-01 uplink DOWN. Edge inference continues; telemetry buffering locally.');
            notify(x, 'warn', 'Backhaul outage', 'GW-HRD-01 uplink down — local response unaffected.');
          },
        },
        { at: 3, stage: 'alert', label: 'Cloud channels (SMS, voice, CAP/SACHET) queue; local siren path stays live', run: (x) => addLog(x, 'INFO', 'AI-2', 'Regional analytics stale for nodes behind GW-HRD-01.') },
      ];
    case 'MAINTENANCE': {
      let tid = '';
      const adv = (x: EngineData) => { advanceTicket(x, tid, 'Local steward (demo)'); };
      return [
        {
          at: 0, stage: 'node_ai', label: 'AIR-001 pod degradation detected — ticket opened',
          run: (x) => {
            const n = x.nodes.find((q) => q.id === 'AIR-001')!;
            x.healthOverride['AIR-001'] = 'MAINTENANCE_REQUIRED';
            for (const s of n.sensors) if (s.type === 'pm25' || s.type === 'pm10') s.health = 'CALIBRATION_REQUIRED';
            tid = createTicket(x, { node_id: 'AIR-001', issue: 'SPS30 drift beyond tolerance — pod replacement + calibration', category: 'SENSOR_REPLACEMENT', priority: 'HIGH', assigned_to: 'Municipal ULB steward (demo)' }).ticket_id;
          },
        },
        { at: 4, stage: 'alert', label: 'Steward assigned', run: adv },
        { at: 9, stage: 'dissemination', label: 'Field service — replaceable sensor pod swapped', run: adv },
        { at: 14, stage: 'risk', label: 'Self-test + calibration', run: adv },
        { at: 18, stage: 'sensing', label: 'Node back online', run: adv },
      ];
    }
    default:
      return [];
  }
}

// Step closures can't survive structuredClone, so they live at module level, keyed by run start time.
let current: { startedAt: number; defs: StepDef[] } | null = null;

export function startScenario(d: EngineData, kind: ScenarioKind) {
  if (kind === 'NORMAL') {
    resetToNormal(d);
    d.scenario = { kind, started_at: d.now, steps: [{ at: 0, label: 'System returned to baseline', stage: 'sensing', done: true }] };
    return;
  }
  // restart semantics: re-triggering a hazard scenario restarts it
  const defs = build(d, kind);
  const run: ScenarioRun = {
    kind,
    started_at: d.now,
    steps: defs.map((s) => ({ at: s.at, label: s.label, stage: s.stage, done: false })),
  };
  current = { startedAt: run.started_at, defs };
  d.scenario = run;
  d.scenarioActive[kind] = true;
  addLog(d, 'INFO', 'SCENARIO', `${SCENARIO_META[kind].label} started (SIMULATED).`);
  stepScenario(d);
}

export function stepScenario(d: EngineData) {
  const run = d.scenario;
  if (!run) return;
  if (!current || current.startedAt !== run.started_at) return;
  const defs = current.defs;
  const elapsed = (d.now - run.started_at) / 1000;
  defs.forEach((def, i) => {
    const st = run.steps[i];
    if (!st.done && elapsed >= def.at) {
      st.done = true;
      def.run?.(d);
      addLog(d, 'INFO', 'SCENARIO', def.label);
    }
  });
}
