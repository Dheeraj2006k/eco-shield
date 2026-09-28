import { ABNORMAL_EVIDENCE, SEVERITY_THRESHOLDS, THRESHOLDS } from '@iris/config';
import type {
  ConfidenceLevel,
  EvidenceItem,
  FusionResult,
  HazardClass,
  IrisNode,
  QuorumStatus,
  RiskLevel,
  SensorType,
} from '@iris/types';
import type { CameraRuntime } from './types';
import { clamp, distanceKm } from './prng';

/** Normalise a reading to 0..1 between its configured baseline and danger level. */
export function norm(type: SensorType, v: number): number {
  const t = THRESHOLDS[type];
  return clamp((v - t.base) / (t.danger - t.base));
}

/** Which sensors feed which hazard, and how much each matters. */
export const HAZARD_SENSORS: Partial<Record<HazardClass, { type: SensorType; importance: number }[]>> = {
  FLOOD: [
    { type: 'water_level', importance: 0.7 },
    { type: 'rainfall', importance: 0.3 },
  ],
  FIRE: [
    { type: 'smoke', importance: 0.4 },
    { type: 'temperature', importance: 0.25 },
    { type: 'pm25', importance: 0.2 },
    { type: 'humidity', importance: 0.15 },
  ],
  AIR: [
    { type: 'pm25', importance: 0.55 },
    { type: 'pm10', importance: 0.35 },
    { type: 'smoke', importance: 0.1 },
  ],
};

export const PRIMARY_SENSOR: Record<string, SensorType> = { FLOOD: 'water_level', FIRE: 'smoke', AIR: 'pm25' };

export const NEIGHBOR_RADIUS_KM = 60;

export function severityFromE(E: number): RiskLevel {
  if (E >= SEVERITY_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (E >= SEVERITY_THRESHOLDS.HIGH) return 'HIGH';
  if (E >= SEVERITY_THRESHOLDS.WATCH) return 'WATCH';
  return 'NORMAL';
}

export function confidenceLevel(c: number): ConfidenceLevel {
  return c >= 0.75 ? 'HIGH' : c >= 0.5 ? 'MEDIUM' : 'LOW';
}

export interface SensorEvidence {
  e: number; // reliability-weighted local hazard score
  raw: number; // un-weighted local hazard score
  w: number; // mean reliability weight of contributing sensors
  badClaim: boolean; // a degraded sensor is asserting an abnormal reading
  available: boolean;
}

/** Local sensor evidence. A faulty sensor contributes little to e and reduces w. */
export function sensorEvidence(node: IrisNode): SensorEvidence {
  const defs = HAZARD_SENSORS[node.hazard];
  if (!defs || node.health_status === 'OFFLINE' || node.maintenance_mode) {
    return { e: 0, raw: 0, w: 0, badClaim: false, available: false };
  }
  let num = 0;
  let den = 0;
  let rawNum = 0;
  let impSum = 0;
  let wNum = 0;
  let badClaim = false;
  for (const d of defs) {
    const s = node.sensors.find((x) => x.type === d.type);
    if (!s) continue;
    const score = norm(d.type, s.last_value);
    num += d.importance * s.weight * score;
    den += d.importance * s.weight;
    rawNum += d.importance * score;
    impSum += d.importance;
    wNum += d.importance * s.weight;
    if ((s.health === 'FAULT' || s.quality_score < 0.5) && score > 0.5) badClaim = true;
  }
  if (impSum === 0) return { e: 0, raw: 0, w: 0, badClaim: false, available: false };
  return {
    e: den > 0.001 ? num / den : 0,
    raw: rawNum / impSum,
    w: wNum / impSum,
    badClaim,
    available: den > 0.001,
  };
}

export function weatherEvidence(hazard: HazardClass, ctx: { rainfall_forecast_mm: number; wind_kmh: number; humidity_pct: number; stagnation_index: number }) {
  switch (hazard) {
    case 'FLOOD':
      return { e: clamp(ctx.rainfall_forecast_mm / 60), detail: `${ctx.rainfall_forecast_mm.toFixed(0)} mm forecast (next 6 h)` };
    case 'FIRE': {
      const dry = clamp((45 - ctx.humidity_pct) / 30);
      const wind = clamp((ctx.wind_kmh - 8) / 30);
      return { e: clamp(0.55 * dry + 0.45 * wind), detail: `RH ${ctx.humidity_pct.toFixed(0)}%, wind ${ctx.wind_kmh.toFixed(0)} km/h` };
    }
    case 'AIR':
      return { e: clamp(ctx.stagnation_index), detail: `Stagnation index ${ctx.stagnation_index.toFixed(2)}` };
    default:
      return { e: 0, detail: 'n/a' };
  }
}

export function cameraBucket(conf: number): CameraRuntime['state'] {
  return conf >= 0.8 ? 'CONFIRMED' : conf >= 0.55 ? 'SUSPECTED' : conf >= 0.3 ? 'WATCH' : 'NORMAL';
}

export interface FusionContext {
  nodes: IrisNode[];
  camera: Record<string, CameraRuntime>;
  external: { rainfall_forecast_mm: number; wind_kmh: number; humidity_pct: number; stagnation_index: number };
}

/**
 * Reliability-weighted evidence fusion:  E = Σ(wᵢ × eᵢ) / Σwᵢ
 * followed by quorum gating: a single abnormal source is only SUSPICIOUS;
 * two or more independent sources (own sensor, neighbour nodes, camera) → CONFIRMED;
 * a degraded sensor asserting an abnormal reading is SUPPRESSED (down-weighted).
 */
export function fuseNode(node: IrisNode, ctx: FusionContext): FusionResult {
  const items: EvidenceItem[] = [];
  const se = sensorEvidence(node);
  const primary = PRIMARY_SENSOR[node.hazard];
  const primarySensor = node.sensors.find((s) => s.type === primary);
  const dataQuality = node.anomaly.data_quality;
  const hasFault = node.sensors.some((s) => s.health === 'FAULT');

  // 1. Sensor evidence
  items.push({
    key: 'sensor',
    label: 'Sensor evidence',
    value: se.e,
    weight: se.w,
    contribution: 0,
    detail: se.available ? `Local ${node.hazard.toLowerCase()} score from ${primarySensor?.label ?? 'sensors'}` : 'Node offline / in maintenance',
    abnormal: se.available && se.e >= ABNORMAL_EVIDENCE && se.w >= 0.2,
    available: se.available,
  });

  // 2. Model evidence (AI-1 ensemble consumes the node feature vector + AI-0 anomaly)
  const anomalyPart = hasFault ? 0 : node.anomaly.score;
  const eModel = se.available ? clamp(0.6 * se.e + 0.4 * anomalyPart) : 0;
  const wModel = se.available ? 0.85 * dataQuality : 0;
  items.push({
    key: 'model',
    label: 'Model evidence',
    value: eModel,
    weight: wModel,
    contribution: 0,
    detail: `AI-1 ensemble (XGBoost + GRU + IsoForest) · anomaly ${node.anomaly.score.toFixed(2)}`,
    abnormal: false,
    available: se.available,
  });

  // 3. Camera evidence (only nodes with an attached camera)
  const cam = ctx.camera[node.id];
  if (cam && node.has_camera) {
    const camOnline = node.health_status !== 'OFFLINE' && !node.maintenance_mode;
    const e = camOnline ? cam.confidence : 0;
    const w = camOnline ? 0.9 : 0;
    items.push({
      key: 'camera',
      label: 'Camera evidence',
      value: e,
      weight: w,
      contribution: 0,
      detail: `RTMDet + MobileNetV3-Small · ${cam.state}${cam.state !== 'NORMAL' ? ` (${cam.label})` : ''}`,
      abnormal: camOnline && cam.state !== 'NORMAL' && cam.confidence >= ABNORMAL_EVIDENCE,
      available: camOnline,
    });
  }

  // 4. Neighbour corroboration
  const neighbors = ctx.nodes.filter(
    (n) =>
      n.id !== node.id &&
      n.hazard === node.hazard &&
      n.health_status !== 'OFFLINE' &&
      !n.maintenance_mode &&
      distanceKm(n.location, node.location) <= NEIGHBOR_RADIUS_KM,
  );
  let nbNum = 0;
  let nbDen = 0;
  let nbW = 0;
  const nbNames: string[] = [];
  for (const n of neighbors) {
    const ev = sensorEvidence(n);
    if (!ev.available) continue;
    nbNum += ev.w * ev.e;
    nbDen += ev.w;
    nbW += ev.w;
    nbNames.push(n.id);
  }
  const nbAvail = nbDen > 0.05;
  const eNb = nbAvail ? nbNum / nbDen : 0;
  const wNb = nbAvail ? 0.85 * (nbW / nbNames.length) : 0;
  items.push({
    key: 'neighbor',
    label: 'Neighbor corroboration',
    value: eNb,
    weight: wNb,
    contribution: 0,
    detail: nbAvail ? `${nbNames.join(', ')} within ${NEIGHBOR_RADIUS_KM} km` : 'No healthy neighbor nodes in range',
    abnormal: nbAvail && eNb >= ABNORMAL_EVIDENCE && wNb >= 0.2,
    available: nbAvail,
  });

  // 5. External weather context (contextual, not quorum-eligible)
  const wx = weatherEvidence(node.hazard, ctx.external);
  items.push({
    key: 'weather',
    label: 'External weather',
    value: wx.e,
    weight: 0.5,
    contribution: 0,
    detail: wx.detail,
    abnormal: false,
    available: true,
  });

  // Fusion: E = Σ(w·e) / Σw
  const sumW = items.reduce((a, i) => a + (i.available ? i.weight : 0), 0);
  const E = sumW > 0 ? items.reduce((a, i) => a + (i.available ? i.weight * i.value : 0), 0) / sumW : 0;
  for (const i of items) i.contribution = i.available && sumW > 0 ? (i.weight * i.value) / sumW : 0;

  // Quorum gating (own sensor, neighbours, camera are the independent, quorum-eligible sources)
  const eligible = items.filter((i) => i.key === 'sensor' || i.key === 'neighbor' || i.key === 'camera');
  const abnormalSources = eligible.filter((i) => i.abnormal);
  const ownAbnormal = eligible.some((i) => (i.key === 'sensor' || i.key === 'camera') && i.abnormal);

  let quorum: QuorumStatus = 'NONE';
  if (se.badClaim) quorum = 'SUPPRESSED';
  else if (!ownAbnormal) quorum = 'NONE';
  else if (abnormalSources.length >= 2) quorum = 'CONFIRMED';
  else quorum = 'SUSPICIOUS';

  const sev = severityFromE(E);
  let severity: RiskLevel = 'NORMAL';
  if (quorum === 'CONFIRMED') severity = sev;
  else if (quorum === 'SUSPICIOUS') severity = 'WATCH';

  // Confidence: demo-configured formula, deliberately independent of severity.
  let confidence: number;
  if (quorum === 'CONFIRMED') confidence = clamp(0.5 + 0.15 * (abnormalSources.length - 2) + 0.28 * dataQuality, 0, 0.97);
  else if (quorum === 'SUSPICIOUS') confidence = clamp(0.22 + 0.12 * dataQuality, 0, 0.45);
  else if (quorum === 'SUPPRESSED') confidence = 0.18;
  else confidence = clamp(0.85 * dataQuality, 0, 0.95);

  return {
    node_id: node.id,
    E,
    evidence: items,
    quorum,
    quorum_sources: abnormalSources.map((s) => s.label),
    severity,
    confidence,
    confidence_level: confidenceLevel(confidence),
    sensor_health_factor: se.w,
    data_quality: dataQuality,
  };
}
