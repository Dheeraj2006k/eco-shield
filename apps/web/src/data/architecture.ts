export type ModuleStatus = 'DEMO-LIVE' | 'SIMULATED' | 'STAGED' | 'PLANNED';

export interface ArchModule {
  id: string;
  zone: string;
  name: string;
  purpose: string;
  inputs: string;
  outputs: string;
  tech: string;
  layer: string;
  status: ModuleStatus;
}

export const ZONES = [
  { id: 'field', title: 'FIELD / SENSOR', sub: 'Replaceable sensor pods' },
  { id: 'ai0', title: 'UNIVERSAL NODE — AI-0', sub: 'Node intelligence' },
  { id: 'ai1', title: 'EDGE AI GATEWAY — AI-1', sub: 'Edge intelligence' },
  { id: 'ai2', title: 'CLOUD / DATA — AI-2', sub: 'Regional intelligence' },
  { id: 'alert', title: 'ALERT & INTEGRATION', sub: 'Actionable warning' },
] as const;

export const MODULES: ArchModule[] = [
  { id: 'hydro', zone: 'field', name: 'Hydro / Flood pod', purpose: 'Measure water level, rainfall, temperature and humidity at the river reach.', inputs: 'Physical environment', outputs: 'Raw samples (UART / I²C / pulse)', tech: 'DFRobot A02YYUW · DFRobot SEN0575 · DHT22 / SHT31', layer: 'Field', status: 'SIMULATED' },
  { id: 'fireair', zone: 'field', name: 'Fire / Air pod', purpose: 'Measure particulates, smoke / combustible gas, temperature and humidity.', inputs: 'Physical environment', outputs: 'Raw samples (UART / analog / I²C)', tech: 'Sensirion SPS30 · MQ-2 · DHT22 / SHT31', layer: 'Field', status: 'SIMULATED' },
  { id: 'camera', zone: 'field', name: 'Camera (optional)', purpose: 'Visual verification of smoke / fire, processed locally.', inputs: 'Scene', outputs: 'Frames → local gateway only', tech: 'Camera module · optional Raspberry Pi AI HAT+', layer: 'Field / edge network', status: 'SIMULATED' },
  { id: 'mcu', zone: 'ai0', name: 'ESP32-S3 core', purpose: 'Sample sensors, run AI-0, package compact telemetry, manage power.', inputs: 'Sensor samples', outputs: 'Filtered values + health flags', tech: 'ESP32-S3 WROOM-1 / N16R8', layer: 'Node', status: 'SIMULATED' },
  { id: 'ai0', zone: 'ai0', name: 'AI-0 node intelligence', purpose: 'Local smoothing, persistent-shift detection, plausibility and health checks; works offline.', inputs: 'Filtered samples', outputs: 'Anomaly score, data quality, trend', tech: 'EWMA / Kalman · CUSUM · TinyML', layer: 'Node (MCU)', status: 'DEMO-LIVE' },
  { id: 'radio', zone: 'ai0', name: 'LoRaWAN radio', purpose: 'Low-power long-range uplink of compact telemetry to the gateway.', inputs: 'Telemetry frames', outputs: 'LoRaWAN uplinks', tech: 'Seeed Wio-E5 · LoRaWAN (star-of-stars, not a self-healing mesh)', layer: 'Node', status: 'SIMULATED' },
  { id: 'power', zone: 'ai0', name: 'Power & enclosure', purpose: 'Solar-charged storage in a weather-proof housing with a replaceable pod interface.', inputs: 'Solar', outputs: 'Regulated supply', tech: 'LiFePO4 IFR26650 · Solar 6V/9V 5–10 W · TP5000 · IP65', layer: 'Node', status: 'SIMULATED' },
  { id: 'rx', zone: 'ai1', name: 'LoRa receiver / packet forwarder', purpose: 'Receive node uplinks and hand them to the edge runtime.', inputs: 'LoRaWAN uplinks', outputs: 'Decoded telemetry', tech: 'Raspberry Pi 4/5 + LoRa concentrator', layer: 'Gateway', status: 'SIMULATED' },
  { id: 'models', zone: 'ai1', name: 'Multi-model inference', purpose: 'Run complementary models: anomaly, hazard class, temporal escalation, vision.', inputs: 'Telemetry features · camera frames', outputs: 'Model evidence eᵢ', tech: 'Isolation Forest · XGBoost · GRU · RTMDet · MobileNetV3-Small', layer: 'Gateway', status: 'DEMO-LIVE' },
  { id: 'fusion', zone: 'ai1', name: 'Evidence fusion', purpose: 'Combine sensor, model, camera, neighbor and weather evidence with reliability weights.', inputs: 'eᵢ, wᵢ per source', outputs: 'Fused evidence E', tech: 'E = Σ(wᵢ × eᵢ) / Σwᵢ', layer: 'Gateway', status: 'DEMO-LIVE' },
  { id: 'quorum', zone: 'ai1', name: 'Quorum-gated validation', purpose: 'Require multi-source corroboration; suppress single faulty sensors.', inputs: 'Per-source abnormality', outputs: 'SUSPICIOUS / CONFIRMED / SUPPRESSED', tech: 'Rule engine', layer: 'Gateway', status: 'DEMO-LIVE' },
  { id: 'risk', zone: 'ai1', name: 'Risk + confidence', purpose: 'Publish severity and confidence as separate axes.', inputs: 'E, quorum', outputs: 'Severity (Watch/High/Critical) + confidence', tech: 'Threshold policy (demo-configured)', layer: 'Gateway', status: 'DEMO-LIVE' },
  { id: 'local', zone: 'ai1', name: 'Local response', purpose: 'Trigger siren / notice board without any cloud connectivity.', inputs: 'Confirmed CRITICAL / HIGH risk', outputs: 'Local siren, notice board', tech: 'GPIO / relay', layer: 'Gateway', status: 'SIMULATED' },
  { id: 'ingest', zone: 'ai2', name: 'Ingest & storage', purpose: 'Receive events and telemetry from gateways; store time-series and incidents.', inputs: 'MQTT / REST from gateways', outputs: 'Persisted telemetry and events', tech: 'FastAPI · MQTT broker · PostgreSQL + TimescaleDB · object storage', layer: 'Cloud', status: 'DEMO-LIVE' },
  { id: 'regional', zone: 'ai2', name: 'Regional intelligence', purpose: 'Aggregate risk across gateways and districts; correlate propagation.', inputs: 'Validated incidents, node evidence', outputs: 'Regional risk layers', tech: 'Python · Pandas · scikit-learn', layer: 'Cloud', status: 'DEMO-LIVE' },
  { id: 'engine', zone: 'ai2', name: 'Alert engine', purpose: 'Deduplicate incidents, run the alert state machine, escalate.', inputs: 'Validated risk', outputs: 'Incidents, alerts', tech: 'State machine (Watch → High → Critical → Acknowledged → Resolved)', layer: 'Cloud', status: 'DEMO-LIVE' },
  { id: 'registry', zone: 'ai2', name: 'Model registry & lifecycle', purpose: 'Version, validate, benchmark and approve models before deployment.', inputs: 'Training runs', outputs: 'Approved model packages', tech: 'Registry + human approval gate', layer: 'Cloud', status: 'STAGED' },
  { id: 'channels', zone: 'alert', name: 'SMS / Voice / IVR / Dashboard', purpose: 'Notify authorities and responders.', inputs: 'Incident + recommended action', outputs: 'Messages', tech: 'Gateway to telecom / SMS providers (integration point)', layer: 'Integration', status: 'SIMULATED' },
  { id: 'cap', zone: 'alert', name: 'C-DOT CAP / SACHET', purpose: 'Hand off a Common Alerting Protocol message for public dissemination.', inputs: 'Approved alert', outputs: 'CAP message', tech: 'CAP v1.2 (integration point)', layer: 'Integration', status: 'PLANNED' },
  { id: 'geo', zone: 'alert', name: 'Geo-targeted public dissemination', purpose: 'Reach people in the affected polygon only.', inputs: 'CAP + geofence', outputs: 'Public warning', tech: 'Via national alerting infrastructure', layer: 'Integration', status: 'PLANNED' },
];

export const EXTERNAL: ArchModule[] = [
  { id: 'wx', zone: 'external', name: 'Weather context', purpose: 'Forecast rainfall, wind, humidity as contextual evidence.', inputs: 'Weather services', outputs: 'Context evidence (not quorum-eligible)', tech: 'External API (optional)', layer: 'External', status: 'SIMULATED' },
  { id: 'sat', zone: 'external', name: 'Satellite / remote sensing', purpose: 'Optional contextual layers (fire hotspots, land cover).', inputs: 'Public datasets', outputs: 'Context layers', tech: 'Optional', layer: 'External', status: 'PLANNED' },
  { id: 'geo-ctx', zone: 'external', name: 'Population & infrastructure layers', purpose: 'Exposure context for prioritisation.', inputs: 'GIS datasets', outputs: 'Exposure layers', tech: 'GeoJSON / PostGIS', layer: 'External', status: 'SIMULATED' },
];

export const LIFECYCLE_MODULES: ArchModule[] = [
  { id: 'health', zone: 'lifecycle', name: 'Fleet health monitoring', purpose: 'Track battery, signal, sensor quality and freshness.', inputs: 'Node health telemetry', outputs: 'Degradation flags', tech: 'AI-0 + AI-2', layer: 'Node + Cloud', status: 'DEMO-LIVE' },
  { id: 'ticket', zone: 'lifecycle', name: 'Maintenance ticketing', purpose: 'Turn degradation into tickets with priority.', inputs: 'Flags', outputs: 'Tickets', tech: 'Maintenance API', layer: 'Cloud', status: 'DEMO-LIVE' },
  { id: 'steward', zone: 'lifecycle', name: 'Local steward / authority', purpose: 'Field service by a trained local steward or institution (proposed model).', inputs: 'Tickets', outputs: 'Service actions', tech: 'Community / institutional O&M', layer: 'Field', status: 'PLANNED' },
  { id: 'podswap', zone: 'lifecycle', name: 'Pod replacement + calibration', purpose: 'Swap the replaceable pod, self-test, calibrate, return online.', inputs: 'Spare pod', outputs: 'Node back online', tech: 'Universal core + pod interface', layer: 'Field', status: 'DEMO-LIVE' },
];
