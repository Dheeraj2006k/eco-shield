import type {
  ExternalContext,
  FusionResult,
  Gateway,
  Incident,
  IrisEvent,
  IrisNode,
  LogEntry,
  MaintenanceTicket,
  NodeHealth,
  Notification,
  PipelineStage,
  ScenarioKind,
  ScenarioRun,
  SensorType,
  SystemHealth,
  TelemetryPoint,
} from '@iris/types';

export type CameraState = 'NORMAL' | 'WATCH' | 'SUSPECTED' | 'CONFIRMED';

export interface CameraRuntime {
  state: CameraState;
  confidence: number; // detector confidence 0..1
  target: number;
  label: string;
  fps: number;
}

export interface SensorRuntime {
  ewma: number;
  cusum: number;
  z: number;
  last: number;
}

export interface Counters {
  readings: number;
  anomalies: number;
  packets: number;
  inferences: number;
  fused: number;
  quorum: number;
  risk: number;
  alerts: number;
  messages: number;
}

export interface EngineData {
  now: number;
  tick: number;
  nodes: IrisNode[];
  gateways: Gateway[];
  /** nodeId → metric (SensorType | 'battery' | 'signal') → points */
  history: Record<string, Record<string, TelemetryPoint[]>>;
  runtime: Record<string, Partial<Record<SensorType, SensorRuntime>>>;
  /** target values the physical process is being driven toward (scenario forcing) */
  forcing: Record<string, Partial<Record<SensorType, number>>>;
  healthOverride: Record<string, NodeHealth | undefined>;
  fusion: Record<string, FusionResult>;
  events: IrisEvent[];
  incidents: Incident[];
  clearTicks: Record<string, number>;
  tickets: MaintenanceTicket[];
  externalTarget: Partial<ExternalContext>;
  log: LogEntry[];
  notifications: Notification[];
  external: ExternalContext;
  camera: Record<string, CameraRuntime>;
  pipeline: PipelineStage[];
  riskTrend: { t: number; FLOOD: number; FIRE: number; AIR: number }[];
  counters: Counters;
  system: { health: SystemHealth; last_sync: number; backhaul_ok: boolean; reasons: string[] };
  scenario: ScenarioRun | null;
  scenarioActive: Partial<Record<ScenarioKind, boolean>>;
  seq: { incident: number; event: number; ticket: number; log: number; notif: number };
}
