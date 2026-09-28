import type { ModelCard } from '@iris/types';

export const MODEL_CARDS: ModelCard[] = [
  {
    id: 'ewma', name: 'EWMA / Kalman', tier: 'AI-0', family: 'Signal processing',
    purpose: 'Smooth noisy sensor streams and estimate a local baseline.',
    input: 'Raw sensor samples (ADC / I²C / UART)', output: 'Smoothed value, z-score vs. baseline',
    deployment: 'ESP32-S3 firmware (C++)', status: 'ACTIVE',
  },
  {
    id: 'cusum', name: 'CUSUM', tier: 'AI-0', family: 'Persistent shift detection',
    purpose: 'Detect small persistent shifts that a threshold would miss.',
    input: 'z-scores from EWMA', output: 'Shift flag + accumulated score',
    deployment: 'ESP32-S3 firmware (C++)', status: 'ACTIVE',
  },
  {
    id: 'tinyml', name: 'TinyML', tier: 'AI-0', family: 'Lightweight node anomaly classifier',
    purpose: 'Classify short windows as normal / anomalous / sensor-fault on the node itself.',
    input: '16-sample window of normalised readings + deltas', output: 'Anomaly class + score',
    deployment: 'ESP32-S3 (int8 TFLite-Micro) — export pending', status: 'STAGED',
  },
  {
    id: 'iforest', name: 'Isolation Forest', tier: 'AI-1', family: 'Unsupervised anomaly detection',
    purpose: 'Flag unusual multi-sensor combinations without labelled events.',
    input: 'Normalised multi-sensor feature vector', output: 'Anomaly score',
    deployment: 'Gateway — Raspberry Pi 5 (scikit-learn)', status: 'SHADOW',
  },
  {
    id: 'xgb', name: 'XGBoost', tier: 'AI-1', family: 'Hazard classification',
    purpose: 'Classify the feature vector as normal / flood / fire / air-pollution / sensor-fault.',
    input: 'Feature vector (values + slopes)', output: 'Hazard class probabilities',
    deployment: 'Gateway — Raspberry Pi 5 (CPU)', status: 'SHADOW',
  },
  {
    id: 'gru', name: 'GRU', tier: 'AI-1', family: 'Temporal escalation',
    purpose: 'Predict whether a rising series will cross the danger level within the horizon.',
    input: 'Last 16 samples (value + delta)', output: 'Escalation likelihood (demo score)',
    deployment: 'Gateway — Raspberry Pi 5 / IQ-8275 (PyTorch → ONNX)', status: 'SHADOW',
  },
  {
    id: 'rtmdet', name: 'RTMDet', tier: 'AI-1', family: 'Vision detection',
    purpose: 'Locate smoke / flame candidates in camera frames at the gateway.',
    input: 'Camera frame (local, never sent over LoRaWAN)', output: 'Bounding boxes + confidence',
    deployment: 'Optional Raspberry Pi AI HAT+ · production target Qualcomm Dragonwing IQ-8275', status: 'RESEARCH',
  },
  {
    id: 'mnv3', name: 'MobileNetV3-Small', tier: 'AI-1', family: 'Vision verification',
    purpose: 'Verify RTMDet candidates to reduce false positives before camera evidence is fused.',
    input: 'Cropped candidate regions', output: 'Verified / rejected + confidence',
    deployment: 'Optional Raspberry Pi AI HAT+ · production target Qualcomm Dragonwing IQ-8275', status: 'RESEARCH',
  },
];

export const AI2_CAPABILITIES: { name: string; text: string }[] = [
  { name: 'Regional risk aggregation', text: 'Combines validated incidents and node evidence across gateways into district-level risk layers.' },
  { name: 'Cross-gateway correlation', text: 'Links incidents across catchments (e.g. upstream → downstream propagation).' },
  { name: 'Analytics & reporting', text: 'Time-series analytics, uptime, reliability and response-time reporting for authorities.' },
  { name: 'Model registry & lifecycle', text: 'Versioned models, edge benchmarks, human approval before any safety-critical deployment.' },
  { name: 'Alert engine', text: 'Deduplicates incidents, manages the alert state machine and hands off to dissemination channels.' },
  { name: 'Fleet & maintenance intelligence', text: 'Predicts pod wear, battery and calibration needs and raises maintenance tickets.' },
];

export const LIFECYCLE = ['DATA', 'TRAIN', 'VALIDATE', 'CALIBRATE', 'OPTIMIZE', 'EDGE BENCHMARK', 'APPROVE', 'DEPLOY', 'MONITOR', 'RETRAIN'];
