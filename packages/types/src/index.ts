/**
 * IRIS shared domain types.
 * Mirrors the Pydantic models in apps/api/app/models.py and the SQL schema in
 * infrastructure/database/schema.sql.
 */

export type HazardClass =
  | 'FLOOD'
  | 'FIRE'
  | 'AIR'
  | 'LANDSLIDE'
  | 'WATER_QUALITY'
  | 'HEAT'
  | 'INDUSTRIAL';

/** Severity and confidence are deliberately separate axes. */
export type RiskLevel = 'NORMAL' | 'WATCH' | 'HIGH' | 'CRITICAL';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type NodeHealth = 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE_REQUIRED';
export type SensorHealth = 'HEALTHY' | 'QUESTIONABLE' | 'FAULT' | 'CALIBRATION_REQUIRED';
export type SystemHealth = 'OPERATIONAL' | 'DEGRADED' | 'PARTIAL_OUTAGE' | 'OFFLINE';

/** NORMAL → WATCH → HIGH → CRITICAL → ACKNOWLEDGED → RESOLVED */
export type IncidentState = 'WATCH' | 'HIGH' | 'CRITICAL' | 'ACKNOWLEDGED' | 'RESOLVED';

export type QuorumStatus = 'NONE' | 'SUSPICIOUS' | 'CONFIRMED' | 'SUPPRESSED';

export type PodType = 'HYDRO_FLOOD_POD' | 'FIRE_AIR_POD';

export type SensorType =
  | 'water_level'
  | 'rainfall'
  | 'temperature'
  | 'humidity'
  | 'pm25'
  | 'pm10'
  | 'smoke';

export type Role = 'ADMIN' | 'AUTHORITY' | 'OPERATOR' | 'FIELD_STEWARD' | 'VIEWER';

export type Capability =
  | 'view'
  | 'ack_alerts'
  | 'manage_nodes'
  | 'simulate'
  | 'maintenance'
  | 'service_nodes'
  | 'gis'
  | 'analytics'
  | 'approve_models'
  | 'settings';

export interface Sensor {
  id: string;
  node_id: string;
  type: SensorType;
  label: string;
  model: string;
  unit: string;
  health: SensorHealth;
  calibration_date: string;
  last_value: number;
  quality_score: number; // 0..1
  freshness: number; // 0..1
  base_reliability: number; // 0..1 (configured demo value)
  relevance: number; // 0..1 (relevance to the node hazard)
  weight: number; // w = base × quality × freshness × relevance
  fault?: 'STUCK' | 'SPIKE' | 'DRIFT' | null;
}

export interface InstalledPod {
  id: string;
  type: PodType;
  name: string;
  serial: string;
  installed_at: string;
  last_calibration: string;
  health: number; // 0..100
  replacement_history: { date: string; reason: string; by: string }[];
}

export interface NodeAnomaly {
  score: number; // AI-0 anomaly score 0..1
  baseline_deviation: number; // z-score of primary sensor
  trend: 'RISING' | 'FALLING' | 'STABLE';
  trend_rate: number; // primary-sensor units per minute
  data_quality: number; // 0..1
  sensor_reliability: number; // 0..1
  cusum: number;
}

export interface IrisNode {
  id: string; // e.g. HYD-001
  code: string; // NODE-HYD-001
  type: PodType;
  hazard: HazardClass;
  location: { lat: number; lon: number; site: string; district: string; region: string };
  gateway_id: string;
  firmware_version: string;
  model_version: string;
  ai_profile: string;
  installed_at: string;
  last_service: string;
  battery: number; // %
  solar: number; // W
  signal: number; // RSSI dBm
  snr: number; // dB
  storage: number; // % used
  last_seen: number; // epoch ms
  health_status: NodeHealth;
  risk_level: RiskLevel;
  risk_score: number; // fused evidence E, 0..1
  confidence: number; // demo-configured, not a calibrated probability
  confidence_level: ConfidenceLevel;
  quorum: QuorumStatus;
  installed_pods: InstalledPod[];
  sensors: Sensor[];
  anomaly: NodeAnomaly;
  has_camera: boolean;
  buffered_msgs: number;
  maintenance_mode: boolean;
  simulated: true;
}

export interface TelemetryPoint {
  timestamp: number;
  value: number;
}

export interface Telemetry {
  timestamp: number;
  node_id: string;
  sensor_id: string;
  value: number;
  unit: string;
  quality: number;
  battery: number;
  signal: number;
}

export interface EvidenceItem {
  key: 'sensor' | 'model' | 'camera' | 'neighbor' | 'weather';
  label: string;
  value: number; // e_i 0..1
  weight: number; // w_i
  contribution: number; // w_i × e_i / Σw
  detail: string;
  abnormal: boolean;
  available: boolean;
}

export interface FusionResult {
  node_id: string;
  E: number;
  evidence: EvidenceItem[];
  quorum: QuorumStatus;
  quorum_sources: string[];
  severity: RiskLevel;
  confidence: number;
  confidence_level: ConfidenceLevel;
  sensor_health_factor: number;
  data_quality: number;
}

export interface IrisEvent {
  id: string;
  node_id: string;
  hazard: HazardClass;
  timestamp: number;
  severity: RiskLevel;
  confidence: number;
  evidence: EvidenceItem[];
  sensor_health: Record<string, SensorHealth>;
  model_versions: Record<string, string>;
}

export interface DisseminationStatus {
  channels: { key: string; label: string; status: 'PENDING' | 'SENT' | 'QUEUED'; at?: number }[];
  cap_sachet: 'PENDING' | 'HANDED_OFF' | 'QUEUED';
  geo_target: string;
  local_siren: 'STANDBY' | 'ACTIVE';
  local_board: 'STANDBY' | 'ACTIVE';
  backhaul_ok: boolean;
}

export interface Incident {
  id: string;
  key: string; // dedup key: hazard + district
  event_ids: string[];
  hazard: HazardClass;
  severity: RiskLevel;
  peak_severity: RiskLevel;
  confidence: number;
  confidence_level: ConfidenceLevel;
  state: IncidentState;
  location: string;
  district: string;
  lat: number;
  lon: number;
  node_ids: string[];
  primary_node_id: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  recommended_action: string;
  created_at: number;
  updated_at: number;
  acknowledged_at?: number;
  acknowledged_by?: string;
  resolved_at?: number;
  detections: number; // total detections folded into this incident (dedup)
  duplicates_suppressed: number;
  history: { at: number; state: IncidentState; note: string }[];
  fusion: FusionResult;
  dissemination: DisseminationStatus;
  simulated: true;
}

export type TicketStatus = 'OPEN' | 'ASSIGNED' | 'IN_FIELD' | 'SELF_TEST' | 'RESOLVED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface ServiceRecord {
  at: number;
  action: string;
  by: string;
}

export interface MaintenanceTicket {
  ticket_id: string;
  node_id: string;
  issue: string;
  category:
    | 'SENSOR_REPLACEMENT'
    | 'BATTERY'
    | 'CLEANING'
    | 'CALIBRATION'
    | 'SOLAR'
    | 'TAMPER'
    | 'CONNECTIVITY'
    | 'OTHER';
  priority: TicketPriority;
  assigned_to: string;
  status: TicketStatus;
  created_at: number;
  resolved_at?: number;
  service_history: ServiceRecord[];
}

export interface PipelineStage {
  key: string;
  label: string;
  status: 'ACTIVE' | 'IDLE' | 'DEGRADED' | 'DOWN';
  latency_ms: number;
  events: number;
  hot: boolean; // abnormal traffic flowing through this stage right now
  note?: string;
}

export interface LogEntry {
  id: string;
  at: number;
  level: 'INFO' | 'WARN' | 'ALERT' | 'OK';
  source: string;
  message: string;
}

export interface Notification {
  id: string;
  at: number;
  level: 'info' | 'warn' | 'critical' | 'ok';
  title: string;
  body: string;
  href?: string;
  read: boolean;
}

export interface Gateway {
  id: string;
  name: string;
  district: string;
  lat: number;
  lon: number;
  online: boolean;
  uplink_ok: boolean;
  hardware: string;
}

export interface ExternalContext {
  rainfall_forecast_mm: number; // next 6 h
  wind_kmh: number;
  wind_dir: string;
  temperature_c: number;
  humidity_pct: number;
  stagnation_index: number; // 0..1
  source: string;
}

export type ScenarioKind =
  | 'NORMAL'
  | 'FLOOD'
  | 'FIRE'
  | 'POLLUTION'
  | 'SENSOR_FAILURE'
  | 'NODE_OFFLINE'
  | 'BACKHAUL_OUTAGE'
  | 'MAINTENANCE'
  | 'LANDSLIDE';

export interface ScenarioStep {
  at: number; // seconds after start
  label: string;
  stage: string; // pipeline stage highlighted
  done: boolean;
}

export interface ScenarioRun {
  kind: ScenarioKind;
  started_at: number;
  steps: ScenarioStep[];
}

export interface ModelCard {
  id: string;
  name: string;
  tier: 'AI-0' | 'AI-1' | 'AI-2';
  family: string;
  purpose: string;
  input: string;
  output: string;
  deployment: string;
  status: 'ACTIVE' | 'STAGED' | 'SHADOW' | 'RESEARCH';
}

export interface Region {
  id: string;
  name: string;
  polygon: [number, number][];
  population: number;
  critical_infrastructure: string[];
  risk: Record<'FLOOD' | 'FIRE' | 'AIR' | 'LANDSLIDE' | 'COMPOSITE', number>;
}
