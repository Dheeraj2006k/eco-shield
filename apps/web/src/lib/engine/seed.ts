import { RECOMMENDED_ACTIONS, THRESHOLDS } from '@iris/config';
import type {
  Gateway,
  HazardClass,
  Incident,
  InstalledPod,
  IrisNode,
  MaintenanceTicket,
  PodType,
  RiskLevel,
  Sensor,
  SensorType,
  TelemetryPoint,
} from '@iris/types';
import { HAZARD_SENSORS, fuseNode, severityFromE } from './fusion';
import { clamp, gaussian, mulberry32 } from './prng';
import type { CameraRuntime, EngineData } from './types';

export const TICK_MS = 1500;
export const HISTORY_MAX = 240;
export const HISTORY_SEED = 120;

const DAY = 86_400_000;

/* ------------------------------------------------------------------ */
/* Gateways — DEMO sites, not real deployments                         */
/* ------------------------------------------------------------------ */

export const GATEWAYS: Gateway[] = [
  { id: 'GW-HRD-01', name: 'Haridwar Edge Gateway', district: 'Haridwar', lat: 29.975, lon: 78.185, online: true, uplink_ok: true, hardware: 'Raspberry Pi 5 + LoRa concentrator' },
  { id: 'GW-DDN-01', name: 'Dehradun Edge Gateway', district: 'Dehradun', lat: 30.305, lon: 78.035, online: true, uplink_ok: true, hardware: 'Raspberry Pi 5 + AI HAT+ (optional)' },
  { id: 'GW-TEH-01', name: 'Tehri Edge Gateway', district: 'Tehri Garhwal', lat: 30.2, lon: 78.5, online: true, uplink_ok: true, hardware: 'Raspberry Pi 5 + LoRa concentrator' },
];

/* ------------------------------------------------------------------ */
/* Sensor + pod builders                                               */
/* ------------------------------------------------------------------ */

const NOISE: Record<SensorType, number> = { water_level: 1.1, rainfall: 0.25, temperature: 0.25, humidity: 0.7, pm25: 1.6, pm10: 3, smoke: 3 };
export const SIGMA: Record<SensorType, number> = { water_level: 6, rainfall: 1.5, temperature: 1.5, humidity: 4, pm25: 8, pm10: 15, smoke: 12 };
export const MAX_JUMP: Record<SensorType, number> = { water_level: 70, rainfall: 40, temperature: 8, humidity: 25, pm25: 200, pm10: 300, smoke: 400 };
export function noiseOf(t: SensorType) {
  return NOISE[t];
}

interface SensorSpec {
  type: SensorType;
  model: string;
  base: number;
  relevance: number;
}

const HYDRO_SENSORS: SensorSpec[] = [
  { type: 'water_level', model: 'DFRobot A02YYUW', base: 0.9, relevance: 1 },
  { type: 'rainfall', model: 'DFRobot SEN0575', base: 0.85, relevance: 0.85 },
  { type: 'temperature', model: 'SHT31', base: 0.9, relevance: 0.3 },
  { type: 'humidity', model: 'SHT31', base: 0.9, relevance: 0.3 },
];

const AIR_SENSORS: SensorSpec[] = [
  { type: 'pm25', model: 'Sensirion SPS30', base: 0.92, relevance: 1 },
  { type: 'pm10', model: 'Sensirion SPS30', base: 0.92, relevance: 0.9 },
  { type: 'smoke', model: 'MQ-2', base: 0.7, relevance: 0.5 },
  { type: 'temperature', model: 'SHT31', base: 0.9, relevance: 0.3 },
  { type: 'humidity', model: 'SHT31', base: 0.9, relevance: 0.3 },
];

const FIRE_SENSORS: SensorSpec[] = [
  { type: 'smoke', model: 'MQ-2', base: 0.7, relevance: 1 },
  { type: 'temperature', model: 'SHT31', base: 0.9, relevance: 0.8 },
  { type: 'pm25', model: 'Sensirion SPS30', base: 0.92, relevance: 0.7 },
  { type: 'pm10', model: 'Sensirion SPS30', base: 0.92, relevance: 0.4 },
  { type: 'humidity', model: 'SHT31', base: 0.9, relevance: 0.6 },
];

function makeSensors(nodeId: string, specs: SensorSpec[], now: number, offset: Partial<Record<SensorType, number>>): Sensor[] {
  return specs.map((sp) => {
    const th = THRESHOLDS[sp.type];
    const v = th.base + (offset[sp.type] ?? 0);
    return {
      id: `${nodeId}-${sp.type}`,
      node_id: nodeId,
      type: sp.type,
      label: th.label,
      model: sp.model,
      unit: th.unit,
      health: 'HEALTHY',
      calibration_date: new Date(now - 62 * DAY).toISOString().slice(0, 10),
      last_value: v,
      quality_score: 0.96,
      freshness: 1,
      base_reliability: sp.base,
      relevance: sp.relevance,
      weight: sp.base * 0.96 * sp.relevance,
      fault: null,
    };
  });
}

function makePod(nodeId: string, type: PodType, now: number, ageDays: number): InstalledPod {
  return {
    id: `POD-${nodeId}`,
    type,
    name: type === 'HYDRO_FLOOD_POD' ? 'HYDRO / FLOOD POD' : 'FIRE / AIR POD',
    serial: `${type === 'HYDRO_FLOOD_POD' ? 'HFP' : 'FAP'}-${nodeId.slice(-3)}-${(2400 + ageDays).toString(16).toUpperCase()}`,
    installed_at: new Date(now - ageDays * DAY).toISOString().slice(0, 10),
    last_calibration: new Date(now - 62 * DAY).toISOString().slice(0, 10),
    health: 96,
    replacement_history:
      ageDays > 200
        ? [{ date: new Date(now - (ageDays - 5) * DAY).toISOString().slice(0, 10), reason: 'Scheduled pod swap — dust-clogged optical channel', by: 'Field Steward (demo)' }]
        : [],
  };
}

interface NodeSpec {
  id: string;
  type: PodType;
  hazard: HazardClass;
  site: string;
  district: string;
  region: string;
  lat: number;
  lon: number;
  gateway: string;
  camera?: boolean;
  battery: number;
  signal: number;
  ageDays: number;
  offset: Partial<Record<SensorType, number>>;
}

const NODE_SPECS: NodeSpec[] = [
  { id: 'HYD-001', type: 'HYDRO_FLOOD_POD', hazard: 'FLOOD', site: 'Riverbank reach A (demo site)', district: 'Haridwar', region: 'Upper Ganga Corridor', lat: 29.955, lon: 78.17, gateway: 'GW-HRD-01', battery: 92, signal: -92, ageDays: 240, offset: { water_level: 3 } },
  { id: 'HYD-002', type: 'HYDRO_FLOOD_POD', hazard: 'FLOOD', site: 'Riverbank reach B (demo site)', district: 'Dehradun', region: 'Upper Ganga Corridor', lat: 30.126, lon: 78.325, gateway: 'GW-HRD-01', battery: 88, signal: -98, ageDays: 210, offset: { water_level: -4 } },
  { id: 'HYD-003', type: 'HYDRO_FLOOD_POD', hazard: 'FLOOD', site: 'Confluence reach C (demo site)', district: 'Tehri Garhwal', region: 'Upper Ganga Corridor', lat: 30.146, lon: 78.598, gateway: 'GW-TEH-01', battery: 81, signal: -104, ageDays: 150, offset: { water_level: 6 } },
  { id: 'AIR-001', type: 'FIRE_AIR_POD', hazard: 'AIR', site: 'Urban core station (demo site)', district: 'Dehradun', region: 'Doon Valley Airshed', lat: 30.324, lon: 78.042, gateway: 'GW-DDN-01', battery: 95, signal: -84, ageDays: 190, offset: { pm25: 5, pm10: 10 } },
  { id: 'AIR-002', type: 'FIRE_AIR_POD', hazard: 'AIR', site: 'Transport junction station (demo site)', district: 'Dehradun', region: 'Doon Valley Airshed', lat: 30.288, lon: 77.999, gateway: 'GW-DDN-01', battery: 90, signal: -89, ageDays: 190, offset: { pm25: 12, pm10: 22 } },
  { id: 'AIR-003', type: 'FIRE_AIR_POD', hazard: 'AIR', site: 'Industrial estate station (demo site)', district: 'Dehradun', region: 'Doon Valley Airshed', lat: 30.176, lon: 78.116, gateway: 'GW-DDN-01', battery: 22, signal: -109, ageDays: 320, offset: { pm25: 8, pm10: 16 } },
  { id: 'FIR-001', type: 'FIRE_AIR_POD', hazard: 'FIRE', site: 'Forest range north (demo site)', district: 'Dehradun', region: 'Rajaji–Mussoorie Forest Belt', lat: 30.045, lon: 78.18, gateway: 'GW-DDN-01', camera: true, battery: 86, signal: -101, ageDays: 120, offset: { smoke: 4, temperature: 1 } },
  { id: 'FIR-002', type: 'FIRE_AIR_POD', hazard: 'FIRE', site: 'Hill slope station (demo site)', district: 'Dehradun', region: 'Rajaji–Mussoorie Forest Belt', lat: 30.42, lon: 78.09, gateway: 'GW-DDN-01', battery: 47, signal: -106, ageDays: 120, offset: { smoke: -3, temperature: -1 } },
];

export const SPEC_BY_ID: Record<string, NodeSpec> = Object.fromEntries(NODE_SPECS.map((x) => [x.id, x]));

export function baselineValue(nodeId: string, type: SensorType): number {
  return THRESHOLDS[type].base + (SPEC_BY_ID[nodeId]?.offset[type] ?? 0);
}

export const BASELINE_HEALTH: Record<string, 'HEALTHY' | 'DEGRADED'> = { 'AIR-003': 'DEGRADED' };

export function buildNode(spec: NodeSpec, now: number): IrisNode {
  const specs = spec.type === 'HYDRO_FLOOD_POD' ? HYDRO_SENSORS : spec.hazard === 'FIRE' ? FIRE_SENSORS : AIR_SENSORS;
  return {
    id: spec.id,
    code: `NODE-${spec.id}`,
    type: spec.type,
    hazard: spec.hazard,
    location: { lat: spec.lat, lon: spec.lon, site: spec.site, district: spec.district, region: spec.region },
    gateway_id: spec.gateway,
    firmware_version: 'iris-fw 0.9.3-demo',
    model_version: spec.hazard === 'FLOOD' ? 'flood-xgb 0.4.2 · gru 0.3.1' : spec.hazard === 'FIRE' ? 'fire-xgb 0.4.0 · rtmdet 0.2.0' : 'air-xgb 0.3.8',
    ai_profile: spec.hazard === 'FLOOD' ? 'AI-0: EWMA + CUSUM + TinyML' : spec.hazard === 'FIRE' ? 'AI-0: EWMA + CUSUM + smoke-slope TinyML' : 'AI-0: EWMA + CUSUM + PM drift check',
    installed_at: new Date(now - spec.ageDays * DAY).toISOString().slice(0, 10),
    last_service: new Date(now - 47 * DAY).toISOString().slice(0, 10),
    battery: spec.battery,
    solar: 3.2,
    signal: spec.signal,
    snr: 8,
    storage: 18 + (spec.ageDays % 13),
    last_seen: now,
    health_status: BASELINE_HEALTH[spec.id] ?? 'HEALTHY',
    risk_level: 'NORMAL',
    risk_score: 0,
    confidence: 0.9,
    confidence_level: 'HIGH',
    quorum: 'NONE',
    installed_pods: [makePod(spec.id, spec.type, now, spec.ageDays)],
    sensors: makeSensors(spec.id, specs, now, spec.offset),
    anomaly: { score: 0.03, baseline_deviation: 0, trend: 'STABLE', trend_rate: 0, data_quality: 0.96, sensor_reliability: 0.9, cusum: 0 },
    has_camera: !!spec.camera,
    buffered_msgs: 0,
    maintenance_mode: false,
    simulated: true,
  };
}

export const EXTERNAL_BASELINE = {
  rainfall_forecast_mm: 4,
  wind_kmh: 9,
  wind_dir: 'WSW',
  temperature_c: 29,
  humidity_pct: 58,
  stagnation_index: 0.22,
  source: 'DEMO weather context (simulated — not a live weather feed)',
};

/* ------------------------------------------------------------------ */
/* Maintenance tickets (seed history — simulated)                      */
/* ------------------------------------------------------------------ */

function seedTickets(now: number): MaintenanceTicket[] {
  const h = (d: number, action: string, by: string) => ({ at: now - d * DAY, action, by });
  return [
    { ticket_id: 'MT-1048', node_id: 'AIR-003', issue: 'Battery below 25% — solar panel shading suspected', category: 'SOLAR', priority: 'HIGH', assigned_to: 'Steward · R. Negi (demo)', status: 'ASSIGNED', created_at: now - 1.2 * DAY, service_history: [h(1.2, 'Ticket created from AI-0 battery-trend rule', 'ECO-SHIELD AI-0'), h(1.1, 'Assigned to local steward', 'Duty operator')] },
    { ticket_id: 'MT-1047', node_id: 'FIR-002', issue: 'Scheduled cleaning of PM optical inlet', category: 'CLEANING', priority: 'LOW', assigned_to: 'Forest Dept. steward (demo)', status: 'OPEN', created_at: now - 2.4 * DAY, service_history: [h(2.4, 'Ticket created by schedule', 'ECO-SHIELD scheduler')] },
    { ticket_id: 'MT-1046', node_id: 'HYD-003', issue: 'Rain-gauge tipping bucket calibration due', category: 'CALIBRATION', priority: 'MEDIUM', assigned_to: 'Panchayat technician (demo)', status: 'IN_FIELD', created_at: now - 3.1 * DAY, service_history: [h(3.1, 'Calibration window reached (90 days)', 'ECO-SHIELD scheduler'), h(2.9, 'Assigned', 'Duty operator'), h(0.4, 'Technician en route', 'Steward')] },
    { ticket_id: 'MT-1041', node_id: 'HYD-001', issue: 'Enclosure tamper switch triggered', category: 'TAMPER', priority: 'HIGH', assigned_to: 'Municipal ULB steward (demo)', status: 'RESOLVED', created_at: now - 9 * DAY, resolved_at: now - 8.5 * DAY, service_history: [h(9, 'Tamper event received', 'ECO-SHIELD AI-0'), h(8.7, 'Site inspected — false trigger, gasket re-seated', 'Steward'), h(8.5, 'Closed', 'Steward')] },
    { ticket_id: 'MT-1036', node_id: 'AIR-002', issue: 'SPS30 fan-speed warning — pod replaced', category: 'SENSOR_REPLACEMENT', priority: 'MEDIUM', assigned_to: 'Municipal ULB steward (demo)', status: 'RESOLVED', created_at: now - 21 * DAY, resolved_at: now - 19 * DAY, service_history: [h(21, 'Fan-speed drift detected', 'ECO-SHIELD AI-0'), h(20, 'Pod swapped, self-test passed', 'Steward'), h(19, 'Calibration verified — node online', 'Steward')] },
  ];
}

/* ------------------------------------------------------------------ */
/* Telemetry history back-fill (simulated)                             */
/* ------------------------------------------------------------------ */

function backfill(nodes: IrisNode[], now: number) {
  const rand = mulberry32(2026);
  const history: EngineData['history'] = {};
  for (const n of nodes) {
    history[n.id] = {};
    for (const s of n.sensors) {
      const pts: TelemetryPoint[] = [];
      let v = s.last_value;
      for (let i = HISTORY_SEED; i > 0; i--) {
        v = v + (s.last_value - v) * 0.1 + gaussian(rand) * NOISE[s.type];
        pts.push({ timestamp: now - i * TICK_MS, value: Math.max(0, v) });
      }
      history[n.id][s.type] = pts;
    }
    for (const m of ['battery', 'signal'] as const) {
      const base = m === 'battery' ? n.battery : n.signal;
      const pts: TelemetryPoint[] = [];
      for (let i = HISTORY_SEED; i > 0; i--) {
        const drift = m === 'battery' ? i * 0.0025 : gaussian(rand) * 1.2;
        pts.push({ timestamp: now - i * TICK_MS, value: base + drift });
      }
      history[n.id][m] = pts;
    }
  }
  return history;
}

/* ------------------------------------------------------------------ */
/* Historic incidents (simulated, RESOLVED)                            */
/* ------------------------------------------------------------------ */

function seedIncidents(nodes: IrisNode[], now: number): Incident[] {
  const defs: { n: number; hazard: HazardClass; node: string; sev: RiskLevel; daysAgo: number; durH: number; E: number }[] = [
    { n: 1006, hazard: 'AIR', node: 'AIR-002', sev: 'HIGH', daysAgo: 2.3, durH: 5, E: 0.63 },
    { n: 1005, hazard: 'FLOOD', node: 'HYD-001', sev: 'HIGH', daysAgo: 5.1, durH: 9, E: 0.68 },
    { n: 1004, hazard: 'FIRE', node: 'FIR-001', sev: 'WATCH', daysAgo: 8.4, durH: 2, E: 0.42 },
    { n: 1003, hazard: 'AIR', node: 'AIR-001', sev: 'WATCH', daysAgo: 13, durH: 7, E: 0.36 },
    { n: 1002, hazard: 'FLOOD', node: 'HYD-002', sev: 'CRITICAL', daysAgo: 22, durH: 14, E: 0.81 },
    { n: 1001, hazard: 'FIRE', node: 'FIR-002', sev: 'HIGH', daysAgo: 31, durH: 6, E: 0.6 },
  ];
  return defs.map((d) => {
    const node = nodes.find((x) => x.id === d.node)!;
    const created = now - d.daysAgo * DAY;
    const fusion = fuseNode(node, { nodes, camera: {}, external: EXTERNAL_BASELINE });
    fusion.E = d.E;
    fusion.severity = d.sev;
    fusion.quorum = 'CONFIRMED';
    fusion.confidence = 0.86;
    fusion.confidence_level = 'HIGH';
    fusion.quorum_sources = ['Sensor evidence', 'Neighbor corroboration'];
    fusion.evidence = fusion.evidence.map((e) => ({
      ...e,
      value: e.key === 'weather' ? 0.4 : d.E,
      abnormal: e.key === 'sensor' || e.key === 'neighbor',
      contribution: (e.weight * (e.key === 'weather' ? 0.4 : d.E)) / 3.2,
    }));
    return {
      id: `INC-${d.n}`,
      key: `${d.hazard}:${node.location.region}`,
      event_ids: [`EVT-${d.n}A`],
      hazard: d.hazard,
      severity: d.sev,
      peak_severity: d.sev,
      confidence: 0.86,
      confidence_level: 'HIGH' as const,
      state: 'RESOLVED' as const,
      location: `${node.location.region} · ${node.location.district}`,
      district: node.location.district,
      lat: node.location.lat,
      lon: node.location.lon,
      node_ids: [d.node],
      primary_node_id: d.node,
      status: 'RESOLVED' as const,
      recommended_action: RECOMMENDED_ACTIONS[d.hazard][d.sev as 'WATCH' | 'HIGH' | 'CRITICAL'],
      created_at: created,
      updated_at: created + d.durH * 3_600_000,
      acknowledged_at: created + 600_000,
      acknowledged_by: 'duty.operator (demo)',
      resolved_at: created + d.durH * 3_600_000,
      detections: 20 + d.n % 17,
      duplicates_suppressed: 19 + d.n % 17,
      history: [
        { at: created, state: d.sev as Incident['state'], note: 'Quorum confirmed — incident created' },
        { at: created + 600_000, state: 'ACKNOWLEDGED' as const, note: 'Acknowledged by duty operator (demo)' },
        { at: created + d.durH * 3_600_000, state: 'RESOLVED' as const, note: 'Evidence returned to baseline' },
      ],
      fusion,
      dissemination: {
        channels: [
          { key: 'sms', label: 'SMS', status: 'SENT' as const },
          { key: 'voice', label: 'Voice / IVR', status: 'SENT' as const },
          { key: 'dash', label: 'Authority dashboard', status: 'SENT' as const },
        ],
        cap_sachet: 'HANDED_OFF' as const,
        geo_target: 'Historic demo incident',
        local_siren: 'STANDBY' as const,
        local_board: 'STANDBY' as const,
        backhaul_ok: true,
      },
      simulated: true as const,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Assemble initial engine data                                        */
/* ------------------------------------------------------------------ */

export function createInitialData(now: number): EngineData {
  const nodes = NODE_SPECS.map((s) => buildNode(s, now));
  const camera: Record<string, CameraRuntime> = {};
  for (const n of nodes) if (n.has_camera) camera[n.id] = { state: 'NORMAL', confidence: 0.03, target: 0.03, label: 'no smoke / fire detected', fps: 9.4 };

  const runtime: EngineData['runtime'] = {};
  for (const n of nodes) {
    runtime[n.id] = {};
    for (const s of n.sensors) runtime[n.id][s.type] = { ewma: s.last_value, cusum: 0, z: 0, last: s.last_value };
  }

  const healthOverride: EngineData['healthOverride'] = {};
  const data: EngineData = {
    now,
    tick: 0,
    nodes,
    gateways: structuredClone(GATEWAYS),
    history: backfill(nodes, now),
    runtime,
    forcing: {},
    healthOverride,
    fusion: {},
    events: [],
    incidents: seedIncidents(nodes, now),
    clearTicks: {},
    tickets: seedTickets(now),
    externalTarget: {},
    log: [],
    notifications: [],
    external: { ...EXTERNAL_BASELINE },
    camera,
    pipeline: [],
    riskTrend: Array.from({ length: 60 }, (_, i) => ({ t: now - (60 - i) * TICK_MS, FLOOD: 0.08 + 0.02 * Math.sin(i / 5), FIRE: 0.03, AIR: 0.12 + 0.02 * Math.cos(i / 6) })),
    counters: { readings: 0, anomalies: 0, packets: 0, inferences: 0, fused: 0, quorum: 0, risk: 0, alerts: 0, messages: 0 },
    system: { health: 'OPERATIONAL', last_sync: now, backhaul_ok: true, reasons: [] },
    scenario: null,
    scenarioActive: {},
    seq: { incident: 1007, event: 1, ticket: 1049, log: 1, notif: 1 },
  };
  data.log.push({ id: 'L0', at: now, level: 'INFO', source: 'SYSTEM', message: 'ECO-SHIELD demo engine started — all telemetry is SIMULATED.' });
  return data;
}

export const NODE_IDS = NODE_SPECS.map((s) => s.id);
export const HAZARD_SENSOR_DEFS = HAZARD_SENSORS;
export { severityFromE, clamp };

/* ------------------------------------------------------------------ */
/* Static geography (DEMO)                                             */
/* ------------------------------------------------------------------ */

export const INFRASTRUCTURE: { id: string; name: string; kind: 'HOSPITAL' | 'SCHOOL' | 'BRIDGE' | 'SUBSTATION' | 'WATER_PLANT' | 'SHELTER'; lat: number; lon: number; hazards: HazardClass[] }[] = [
  { id: 'CI-01', name: 'District Hospital (demo)', kind: 'HOSPITAL', lat: 29.945, lon: 78.155, hazards: ['FLOOD'] },
  { id: 'CI-02', name: 'Riverside Primary School (demo)', kind: 'SCHOOL', lat: 29.962, lon: 78.185, hazards: ['FLOOD'] },
  { id: 'CI-03', name: 'Barrage Road Bridge (demo)', kind: 'BRIDGE', lat: 30.0, lon: 78.2, hazards: ['FLOOD'] },
  { id: 'CI-04', name: 'Pilgrim Relief Shelter (demo)', kind: 'SHELTER', lat: 30.105, lon: 78.29, hazards: ['FLOOD'] },
  { id: 'CI-05', name: 'Water Treatment Plant (demo)', kind: 'WATER_PLANT', lat: 30.135, lon: 78.33, hazards: ['FLOOD'] },
  { id: 'CI-06', name: 'Forest Range Office (demo)', kind: 'SHELTER', lat: 30.06, lon: 78.17, hazards: ['FIRE'] },
  { id: 'CI-07', name: 'Hill Settlement School (demo)', kind: 'SCHOOL', lat: 30.41, lon: 78.08, hazards: ['FIRE'] },
  { id: 'CI-08', name: 'Sub-station 33 kV (demo)', kind: 'SUBSTATION', lat: 30.05, lon: 78.2, hazards: ['FIRE'] },
  { id: 'CI-09', name: 'City Hospital (demo)', kind: 'HOSPITAL', lat: 30.32, lon: 78.05, hazards: ['AIR'] },
  { id: 'CI-10', name: 'Central School (demo)', kind: 'SCHOOL', lat: 30.3, lon: 78.02, hazards: ['AIR'] },
];

export const REGIONS: import('@iris/types').Region[] = [
  {
    id: 'R-HRD', name: 'Haridwar (demo)', population: 120_000,
    polygon: [[29.86, 78.02], [29.86, 78.3], [30.03, 78.3], [30.03, 78.02]],
    critical_infrastructure: ['District Hospital (demo)', 'Riverside Primary School (demo)', 'Barrage Road Bridge (demo)'],
    risk: { FLOOD: 0, FIRE: 0, AIR: 0, LANDSLIDE: 0, COMPOSITE: 0 },
  },
  {
    id: 'R-DDN', name: 'Dehradun (demo)', population: 280_000,
    polygon: [[30.03, 77.95], [30.03, 78.3], [30.46, 78.3], [30.46, 77.95]],
    critical_infrastructure: ['City Hospital (demo)', 'Central School (demo)', 'Forest Range Office (demo)', 'Sub-station 33 kV (demo)'],
    risk: { FLOOD: 0, FIRE: 0, AIR: 0, LANDSLIDE: 0, COMPOSITE: 0 },
  },
  {
    id: 'R-TEH', name: 'Tehri Garhwal (demo)', population: 65_000,
    polygon: [[30.03, 78.3], [30.03, 78.75], [30.35, 78.75], [30.35, 78.3]],
    critical_infrastructure: ['Water Treatment Plant (demo)', 'Pilgrim Relief Shelter (demo)'],
    risk: { FLOOD: 0, FIRE: 0, AIR: 0, LANDSLIDE: 0, COMPOSITE: 0 },
  },
];

/** River centre-line used by map + digital twin, upstream → downstream. */
export const RIVER_PATH: [number, number][] = [
  [30.146, 78.598], [30.13, 78.45], [30.126, 78.325], [30.09, 78.28], [30.03, 78.22], [29.955, 78.17], [29.9, 78.14],
];

/** Static, illustrative baseline for hazards without live nodes (landslide). */
export const LANDSLIDE_BASELINE: Record<string, number> = { 'R-HRD': 0.08, 'R-DDN': 0.22, 'R-TEH': 0.34 };
export { clamp as _clamp };
