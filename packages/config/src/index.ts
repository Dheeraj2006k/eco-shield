import type {
  Capability,
  ConfidenceLevel,
  HazardClass,
  NodeHealth,
  RiskLevel,
  Role,
  SensorHealth,
  SensorType,
} from '@iris/types';

/* ---------- Sensor thresholds (DEMO-CONFIGURED, not calibrated field values) ---------- */

export interface Threshold {
  base: number;
  warn: number;
  danger: number;
  unit: string;
  label: string;
  decimals: number;
}

export const THRESHOLDS: Record<SensorType, Threshold> = {
  water_level: { base: 140, warn: 220, danger: 300, unit: 'cm', label: 'Water Level', decimals: 0 },
  rainfall: { base: 0.5, warn: 15, danger: 40, unit: 'mm/h', label: 'Rainfall', decimals: 1 },
  temperature: { base: 28, warn: 42, danger: 55, unit: '°C', label: 'Temperature', decimals: 1 },
  humidity: { base: 60, warn: 30, danger: 15, unit: '%', label: 'Humidity', decimals: 0 },
  pm25: { base: 45, warn: 120, danger: 250, unit: 'µg/m³', label: 'PM2.5', decimals: 0 },
  pm10: { base: 90, warn: 250, danger: 430, unit: 'µg/m³', label: 'PM10', decimals: 0 },
  smoke: { base: 40, warn: 250, danger: 600, unit: 'idx', label: 'Smoke / Gas (MQ-2)', decimals: 0 },
};

/** Fused-evidence thresholds → severity. E is a demo score, not a calibrated probability. */
export const SEVERITY_THRESHOLDS = { WATCH: 0.3, HIGH: 0.55, CRITICAL: 0.75 } as const;

/** An evidence source counts as "abnormal" above this level. */
export const ABNORMAL_EVIDENCE = 0.38;

/* ---------- Status metadata (colour + label — never colour alone) ---------- */

export const RISK_META: Record<RiskLevel, { label: string; color: string; bg: string; ring: string; hex: string; rank: number }> = {
  NORMAL: { label: 'Normal', color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200', hex: '#16a34a', rank: 0 },
  WATCH: { label: 'Watch', color: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200', hex: '#eab308', rank: 1 },
  HIGH: { label: 'High', color: 'text-orange-700', bg: 'bg-orange-50', ring: 'ring-orange-200', hex: '#ea580c', rank: 2 },
  CRITICAL: { label: 'Critical', color: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-200', hex: '#dc2626', rank: 3 },
};

export const OFFLINE_HEX = '#94a3b8';

export const HEALTH_META: Record<NodeHealth, { label: string; tone: 'ok' | 'warn' | 'bad' | 'off' | 'maint' }> = {
  HEALTHY: { label: 'Healthy', tone: 'ok' },
  DEGRADED: { label: 'Degraded', tone: 'warn' },
  OFFLINE: { label: 'Offline', tone: 'off' },
  MAINTENANCE_REQUIRED: { label: 'Maintenance Required', tone: 'maint' },
};

export const SENSOR_HEALTH_META: Record<SensorHealth, { label: string; tone: 'ok' | 'warn' | 'bad' | 'maint' }> = {
  HEALTHY: { label: 'Healthy', tone: 'ok' },
  QUESTIONABLE: { label: 'Questionable', tone: 'warn' },
  FAULT: { label: 'Fault', tone: 'bad' },
  CALIBRATION_REQUIRED: { label: 'Calibration Required', tone: 'maint' },
};

export const CONFIDENCE_META: Record<ConfidenceLevel, { label: string }> = {
  LOW: { label: 'Low' },
  MEDIUM: { label: 'Medium' },
  HIGH: { label: 'High' },
};

export const HAZARD_META: Record<HazardClass, { label: string; short: string; hex: string; primary: boolean }> = {
  FLOOD: { label: 'Flood / Flash Flood', short: 'Flood', hex: '#2563eb', primary: true },
  FIRE: { label: 'Forest Fire / Smoke', short: 'Fire', hex: '#ea580c', primary: true },
  AIR: { label: 'Air Pollution', short: 'Air', hex: '#7c3aed', primary: true },
  LANDSLIDE: { label: 'Landslide / Terrain', short: 'Landslide', hex: '#92400e', primary: false },
  WATER_QUALITY: { label: 'Water Quality', short: 'Water Quality', hex: '#0891b2', primary: false },
  HEAT: { label: 'Extreme Heat', short: 'Heat', hex: '#dc2626', primary: false },
  INDUSTRIAL: { label: 'Industrial Events', short: 'Industrial', hex: '#475569', primary: false },
};

export const RECOMMENDED_ACTIONS: Record<HazardClass, Record<Exclude<RiskLevel, 'NORMAL'>, string>> = {
  FLOOD: {
    WATCH: 'Increase monitoring cadence; notify duty officer of rising water levels.',
    HIGH: 'Alert local authority; prepare downstream flood-prone areas for possible evacuation.',
    CRITICAL: 'Notify downstream flood-prone areas and local authority.',
  },
  FIRE: {
    WATCH: 'Dispatch patrol to verify; review fire-weather conditions.',
    HIGH: 'Alert Forest Department control room; pre-position response crews.',
    CRITICAL: 'Notify Forest Department and nearby settlements; begin fire-response coordination.',
  },
  AIR: {
    WATCH: 'Publish air-quality advisory for sensitive groups.',
    HIGH: 'Issue health advisory; notify municipal authority to review emission controls.',
    CRITICAL: 'Issue severe-pollution alert; notify municipal and health authorities.',
  },
  LANDSLIDE: {
    WATCH: 'Inspect slope; review rainfall accumulation.',
    HIGH: 'Alert road and district authority; restrict vulnerable corridors.',
    CRITICAL: 'Notify district authority and downslope settlements.',
  },
  WATER_QUALITY: { WATCH: 'Sample and verify.', HIGH: 'Advise against consumption pending test.', CRITICAL: 'Issue do-not-use advisory.' },
  HEAT: { WATCH: 'Publish heat advisory.', HIGH: 'Activate heat-action plan.', CRITICAL: 'Issue extreme-heat warning.' },
  INDUSTRIAL: { WATCH: 'Notify site operator.', HIGH: 'Notify regulator.', CRITICAL: 'Notify emergency services and regulator.' },
};

/* ---------- RBAC ---------- */

export const ROLES: Role[] = ['ADMIN', 'AUTHORITY', 'OPERATOR', 'FIELD_STEWARD', 'VIEWER'];

export const ROLE_META: Record<Role, { label: string; description: string }> = {
  ADMIN: { label: 'Administrator', description: 'Full access to every capability.' },
  AUTHORITY: { label: 'Authority', description: 'Alerts, regional monitoring, GIS, incidents and analytics.' },
  OPERATOR: { label: 'Operator', description: 'Nodes, alerts, AI and live monitoring; can run simulations.' },
  FIELD_STEWARD: { label: 'Field Steward', description: 'Maintenance, node service, pod replacement and calibration.' },
  VIEWER: { label: 'Viewer', description: 'Read-only access.' },
};

export const ROLE_CAPS: Record<Role, Capability[]> = {
  ADMIN: ['view', 'ack_alerts', 'manage_nodes', 'simulate', 'maintenance', 'service_nodes', 'gis', 'analytics', 'approve_models', 'settings'],
  AUTHORITY: ['view', 'ack_alerts', 'gis', 'analytics'],
  OPERATOR: ['view', 'ack_alerts', 'manage_nodes', 'simulate'],
  FIELD_STEWARD: ['view', 'maintenance', 'service_nodes'],
  VIEWER: ['view'],
};

export function can(role: Role | undefined | null, cap: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPS[role]?.includes(cap) ?? false;
}

/** Route prefix → capability required to open the route. Longest prefix wins. */
export const ROUTE_CAPS: { prefix: string; cap: Capability }[] = [
  { prefix: '/settings', cap: 'settings' },
  { prefix: '/demo', cap: 'simulate' },
  { prefix: '/dashboard', cap: 'view' },
  { prefix: '/map', cap: 'view' },
  { prefix: '/nodes', cap: 'view' },
  { prefix: '/alerts', cap: 'view' },
  { prefix: '/ai', cap: 'view' },
  { prefix: '/analytics', cap: 'view' },
  { prefix: '/insights', cap: 'view' },
  { prefix: '/maintenance', cap: 'view' },
  { prefix: '/simulation', cap: 'view' },
  { prefix: '/vision', cap: 'view' },
  { prefix: '/architecture', cap: 'view' },
  { prefix: '/hardware', cap: 'view' },
];

export function requiredCapForPath(path: string): Capability | null {
  const hit = ROUTE_CAPS.filter((r) => path === r.prefix || path.startsWith(r.prefix + '/')).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
  return hit ? hit.cap : null;
}

export const SESSION_COOKIE = 'iris_session';
