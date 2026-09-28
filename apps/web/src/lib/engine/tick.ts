import { THRESHOLDS } from '@iris/config';
import type { IrisNode, NodeHealth, PipelineStage, Sensor, SensorType } from '@iris/types';
import { PRIMARY_SENSOR, cameraBucket, fuseNode } from './fusion';
import { updateIncidents } from './incidents';
import { clamp, gaussian } from './prng';
import { HISTORY_MAX, MAX_JUMP, SIGMA, SPEC_BY_ID, TICK_MS, noiseOf } from './seed';
import { stepScenario } from './scenarios';
import type { EngineData } from './types';
import { addLog } from './util';

const SPIKE_VALUE: Partial<Record<SensorType, number>> = { water_level: 445, rainfall: 120, pm25: 900, pm10: 1200, smoke: 1000, temperature: 95, humidity: 100 };

function baselineOf(nodeId: string, type: SensorType, tick: number): number {
  const off = SPEC_BY_ID[nodeId]?.offset[type] ?? 0;
  const diurnal = Math.sin(tick / 45) * SIGMA[type] * 0.25;
  return THRESHOLDS[type].base + off + diurnal;
}

function pushHistory(d: EngineData, nodeId: string, metric: string, value: number) {
  const arr = ((d.history[nodeId] ??= {})[metric] ??= []);
  arr.push({ timestamp: d.now, value });
  if (arr.length > HISTORY_MAX) arr.shift();
}

function updateSensor(d: EngineData, node: IrisNode, s: Sensor, online: boolean) {
  const rt = ((d.runtime[node.id] ??= {})[s.type] ??= { ewma: s.last_value, cusum: 0, z: 0, last: s.last_value });
  const base = baselineOf(node.id, s.type, d.tick);

  if (!online) {
    s.freshness = clamp(Math.exp(-(d.now - node.last_seen) / 40_000));
    s.weight = s.base_reliability * s.quality_score * s.freshness * s.relevance;
    return;
  }

  const forced = d.forcing[node.id]?.[s.type];
  const target = forced ?? base;
  const prev = s.last_value;
  let v: number;
  if (s.fault === 'SPIKE') v = (SPIKE_VALUE[s.type] ?? prev * 3) + gaussian() * noiseOf(s.type) * 0.3;
  else if (s.fault === 'STUCK') v = prev;
  else if (s.fault === 'DRIFT') v = prev + SIGMA[s.type] * 0.5;
  else v = prev + (target - prev) * (forced !== undefined ? 0.3 : 0.14) + gaussian() * noiseOf(s.type);

  v = s.type === 'humidity' ? clamp(v, 0, 100) : Math.max(0, v);
  s.last_value = v;

  // AI-0: EWMA smoothing, z-score vs. configured baseline, CUSUM persistent-shift detector
  rt.ewma = rt.ewma + 0.35 * (v - rt.ewma);
  rt.z = (rt.ewma - THRESHOLDS[s.type].base) / SIGMA[s.type];
  rt.cusum = clamp(Math.max(0, rt.cusum + Math.abs(rt.z) - 1), 0, 60);
  rt.last = v;

  // Data-quality: plausibility (rate-of-change) + fault flags
  const jump = Math.abs(v - prev) > MAX_JUMP[s.type];
  const degraded = node.health_status === 'DEGRADED' ? 0.06 : 0;
  const qTarget = s.fault ? 0.1 : jump ? 0.35 : s.health === 'CALIBRATION_REQUIRED' ? 0.62 : 0.96 - degraded;
  s.quality_score = clamp(s.quality_score + (qTarget - s.quality_score) * 0.5, 0.05, 0.99);
  s.freshness = 1;

  if (s.fault) s.health = 'FAULT';
  else if (s.health === 'CALIBRATION_REQUIRED') s.health = 'CALIBRATION_REQUIRED';
  else s.health = s.quality_score < 0.3 ? 'FAULT' : s.quality_score < 0.7 ? 'QUESTIONABLE' : 'HEALTHY';
  s.weight = s.base_reliability * s.quality_score * s.freshness * s.relevance;
}

function updateNode(d: EngineData, node: IrisNode) {
  const override = d.healthOverride[node.id];
  const offline = override === 'OFFLINE';
  const spec = SPEC_BY_ID[node.id];

  for (const s of node.sensors) updateSensor(d, node, s, !offline);

  if (!offline) {
    node.last_seen = d.now - Math.floor(Math.random() * 900);
    node.battery = clamp(node.battery - 0.0025, 0, 100);
    node.solar = Math.max(0, (node.id === 'AIR-003' ? 0.5 : 3.4) + Math.sin(d.tick / 30) * 1.6 + gaussian() * 0.15);
    node.signal = (spec?.signal ?? -100) + gaussian() * 1.4;
    node.snr = 8 + gaussian() * 0.6 - (spec ? Math.max(0, (-spec.signal - 95) / 6) : 0);
    node.storage = clamp(node.storage + 0.002, 0, 99);
    const gw = d.gateways.find((g) => g.id === node.gateway_id);
    node.buffered_msgs = gw && !gw.uplink_ok ? node.buffered_msgs + 1 : 0;
  }

  // AI-0 node-level indicators
  const primary = node.sensors.find((s) => s.type === PRIMARY_SENSOR[node.hazard]) ?? node.sensors[0];
  const rt = d.runtime[node.id]?.[primary.type];
  const hist = d.history[node.id]?.[primary.type] ?? [];
  const z = rt?.z ?? 0;
  const cusum = rt?.cusum ?? 0;
  const prevScore = node.anomaly.score;
  const score = clamp(0.5 * clamp(Math.abs(z) / 10) + 0.5 * clamp(cusum / 25));
  const slope = hist.length > 6 ? (primary.last_value - hist[hist.length - 6].value) / 5 : 0;
  const thr = SIGMA[primary.type] * 0.35;
  const relSum = node.sensors.reduce((a, s) => a + s.relevance, 0);
  node.anomaly = {
    score,
    baseline_deviation: z,
    trend: slope > thr ? 'RISING' : slope < -thr ? 'FALLING' : 'STABLE',
    trend_rate: slope,
    data_quality: node.sensors.reduce((a, s) => a + s.quality_score * s.relevance, 0) / relSum,
    sensor_reliability: node.sensors.reduce((a, s) => a + s.base_reliability * s.quality_score * s.relevance, 0) / relSum,
    cusum,
  };
  if (score >= 0.4 && prevScore < 0.4) {
    addLog(d, 'WARN', `AI-0 · ${node.id}`, `Anomaly detected on ${primary.label}: z=${z.toFixed(1)}, CUSUM=${cusum.toFixed(1)}, score ${score.toFixed(2)}`);
  }

  // Health state
  let health: NodeHealth;
  if (override) health = override;
  else if (node.battery < 25 || node.signal < -112 || node.sensors.some((s) => s.health === 'FAULT')) health = 'DEGRADED';
  else health = 'HEALTHY';
  node.health_status = health;

  for (const s of node.sensors) pushHistory(d, node.id, s.type, s.last_value);
  pushHistory(d, node.id, 'battery', node.battery);
  pushHistory(d, node.id, 'signal', node.signal);
}

function easeExternal(d: EngineData) {
  const keys = ['rainfall_forecast_mm', 'wind_kmh', 'humidity_pct', 'stagnation_index', 'temperature_c'] as const;
  const baseline = { rainfall_forecast_mm: 4, wind_kmh: 9, humidity_pct: 58, stagnation_index: 0.22, temperature_c: 29 };
  for (const k of keys) {
    const tgt = (d.externalTarget[k] as number | undefined) ?? baseline[k];
    d.external[k] += (tgt - d.external[k]) * 0.12;
  }
}

function updateCameras(d: EngineData) {
  for (const [id, cam] of Object.entries(d.camera)) {
    const node = d.nodes.find((n) => n.id === id)!;
    const online = node.health_status !== 'OFFLINE';
    const prev = cam.state;
    if (online) cam.confidence = clamp(cam.confidence + (cam.target - cam.confidence) * 0.25 + gaussian() * 0.01, 0.01, 0.99);
    cam.state = cameraBucket(cam.confidence);
    cam.label = cam.state === 'NORMAL' ? 'no smoke / fire detected' : cam.confidence >= 0.8 ? 'smoke plume + flame front' : 'smoke plume';
    cam.fps = online ? 9.2 + gaussian() * 0.4 : 0;
    if (cam.state !== prev && cam.state !== 'NORMAL') addLog(d, 'WARN', `VISION · ${id}`, `Camera event state ${prev} → ${cam.state} (${cam.label}, conf ${(cam.confidence * 100).toFixed(0)}%)`);
  }
}

function buildPipeline(d: EngineData): PipelineStage[] {
  const nodes = d.nodes;
  const online = nodes.filter((n) => n.health_status !== 'OFFLINE');
  const anomalyHot = nodes.some((n) => n.anomaly.score >= 0.4);
  const evidenceHot = Object.values(d.fusion).some((f) => f.E >= 0.3);
  const quorumHot = Object.values(d.fusion).some((f) => f.quorum !== 'NONE');
  const riskHot = nodes.some((n) => n.risk_level !== 'NORMAL');
  const activeInc = d.incidents.filter((i) => i.status !== 'RESOLVED');
  const outage = d.gateways.some((g) => !g.uplink_ok);
  const j = (a: number, b: number) => a + Math.random() * (b - a);
  const c = d.counters;
  const mk = (key: string, label: string, status: PipelineStage['status'], lat: number, events: number, hot: boolean, note?: string): PipelineStage => ({ key, label, status, latency_ms: Math.round(lat), events, hot, note });
  return [
    mk('sensing', 'SENSING', online.length ? 'ACTIVE' : 'DOWN', j(38, 62), c.readings, false, `${online.length}/${nodes.length} nodes reporting`),
    mk('node_ai', 'NODE AI (AI-0)', online.length ? 'ACTIVE' : 'DOWN', j(9, 18), c.anomalies, anomalyHot, 'EWMA · CUSUM · TinyML'),
    mk('lorawan', 'LoRaWAN', online.length < nodes.length ? 'DEGRADED' : 'ACTIVE', j(980, 1450), c.packets, anomalyHot, 'compact telemetry only — no raw video'),
    mk('edge_ai', 'EDGE AI (AI-1)', 'ACTIVE', j(48, 96), c.inferences, evidenceHot, 'XGBoost · GRU · IsoForest · RTMDet'),
    mk('evidence', 'EVIDENCE', 'ACTIVE', j(4, 12), c.fused, evidenceHot, 'reliability-weighted fusion'),
    mk('quorum', 'QUORUM', 'ACTIVE', j(2, 6), c.quorum, quorumHot, 'multi-source gate'),
    mk('risk', 'RISK', 'ACTIVE', j(2, 5), c.risk, riskHot, 'severity + confidence'),
    mk('alert', 'ALERT', 'ACTIVE', j(90, 150), c.alerts, activeInc.length > 0, `${activeInc.length} active incident(s)`),
    mk('dissemination', 'DISSEMINATION', outage ? 'DEGRADED' : 'ACTIVE', outage ? j(0, 0) : j(240, 520), c.messages, activeInc.some((i) => i.severity !== 'WATCH'), outage ? 'cloud channels queued · local path live' : 'SMS · voice · CAP · local siren'),
  ];
}

function computeSystem(d: EngineData) {
  const reasons: string[] = [];
  const offline = d.nodes.filter((n) => n.health_status === 'OFFLINE').length;
  const maint = d.nodes.filter((n) => n.health_status === 'MAINTENANCE_REQUIRED').length;
  const degraded = d.nodes.filter((n) => n.health_status === 'DEGRADED').length;
  const gwDown = d.gateways.filter((g) => !g.uplink_ok).length;
  let health: EngineData['system']['health'] = 'OPERATIONAL';
  if (offline === d.nodes.length) health = 'OFFLINE';
  else if (gwDown > 0) {
    health = 'PARTIAL_OUTAGE';
    reasons.push(`${gwDown} gateway uplink(s) down — cloud sync degraded, local response unaffected`);
  } else if (offline > 0 || maint > 0 || degraded >= 2) health = 'DEGRADED';
  if (offline) reasons.push(`${offline} node(s) offline`);
  if (maint) reasons.push(`${maint} node(s) need maintenance`);
  if (degraded) reasons.push(`${degraded} node(s) degraded`);
  d.system.health = health;
  d.system.reasons = reasons;
  d.system.backhaul_ok = gwDown === 0;
  if (d.gateways.some((g) => g.uplink_ok)) d.system.last_sync = d.now;
}

/** One engine step. Mutates `d`. */
export function tickEngine(d: EngineData, now: number) {
  d.now = now;
  d.tick++;
  stepScenario(d);
  easeExternal(d);

  for (const n of d.nodes) updateNode(d, n);
  updateCameras(d);

  // Evidence fusion + quorum for every node
  const ctx = { nodes: d.nodes, camera: d.camera, external: d.external };
  for (const n of d.nodes) {
    const f = fuseNode(n, ctx);
    const prev = n.quorum;
    d.fusion[n.id] = f;
    n.risk_level = f.severity;
    n.risk_score = f.E;
    n.confidence = f.confidence;
    n.confidence_level = f.confidence_level;
    n.quorum = f.quorum;
    if (prev !== f.quorum && f.quorum !== 'NONE') {
      const srcs = f.quorum_sources.length ? ` (${f.quorum_sources.join(' + ')})` : '';
      const lvl = f.quorum === 'CONFIRMED' ? 'ALERT' : 'WARN';
      const msg =
        f.quorum === 'SUSPICIOUS' ? `Single-source abnormality${srcs} — SUSPICIOUS, awaiting corroboration`
        : f.quorum === 'CONFIRMED' ? `Multi-source corroboration${srcs} — CONFIRMED · E=${f.E.toFixed(2)}`
        : 'Degraded sensor asserting abnormal reading — evidence DOWN-WEIGHTED / SUPPRESSED';
      addLog(d, lvl, `QUORUM · ${n.id}`, msg);
    }
  }

  // counters
  const onlineNodes = d.nodes.filter((n) => n.health_status !== 'OFFLINE');
  d.counters.readings += onlineNodes.reduce((a, n) => a + n.sensors.length, 0);
  d.counters.packets += onlineNodes.length;
  d.counters.inferences += onlineNodes.length;
  d.counters.anomalies += d.nodes.filter((n) => n.anomaly.score >= 0.4).length;
  d.counters.fused += d.nodes.length;
  d.counters.quorum += d.nodes.filter((n) => n.quorum !== 'NONE').length;
  d.counters.risk += d.nodes.filter((n) => n.risk_level !== 'NORMAL').length;

  const mx = (h: string) => Math.max(0, ...d.nodes.filter((n) => n.hazard === h).map((n) => n.risk_score));
  d.riskTrend.push({ t: now, FLOOD: mx('FLOOD'), FIRE: mx('FIRE'), AIR: mx('AIR') });
  if (d.riskTrend.length > 120) d.riskTrend.shift();

  updateIncidents(d);
  computeSystem(d);
  d.pipeline = buildPipeline(d);
}

export { TICK_MS };
