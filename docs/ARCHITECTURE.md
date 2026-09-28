# Architecture

ECO-SHIELD has five horizontal stages, external intelligence above, lifecycle operations below:

```
                 EXTERNAL INTELLIGENCE (optional contextual evidence)
                                     │
FIELD/SENSOR ─► UNIVERSAL NODE AI-0 ─LoRaWAN─► EDGE GATEWAY AI-1 ─► CLOUD/DATA AI-2 ─► ALERT & INTEGRATION
 sensor pods     ESP32-S3 + Wio-E5             multi-model, fusion,     regional intel,     SMS/voice/IVR, CAP/SACHET,
                                               quorum, risk+confidence  analytics, alerts   geo-targeted dissemination
                                     │
                 LIFECYCLE & COMMUNITY OPERATIONS (health → ticket → steward → pod swap → calibration → online)
```

Main flow: FIELD → AI-0 → LoRaWAN → AI-1 → EVIDENCE FUSION → QUORUM VALIDATION → RISK + CONFIDENCE → AI-2 → ALERT ENGINE → ACTION / DISSEMINATION.

LoRaWAN is a star-of-stars network, **not** a self-healing mesh. Raw camera video never travels over LoRaWAN; frames stay on the gateway's local network.

## AI-0 — node intelligence (ESP32-S3)

EWMA / Kalman smoothing, z-score against a baseline, CUSUM persistent-shift detector, rate-of-change plausibility gate, TinyML anomaly classifier (staged). Produces anomaly score, data quality, trend, sensor health. Runs with no connectivity. Reference code: `services/ml/iris_ml/signal.py`; live implementation in the demo engine: `apps/web/src/lib/engine/tick.ts`.

## AI-1 — gateway intelligence

Prototype hardware is a Raspberry Pi 5 (optional Raspberry Pi AI HAT+). Qualcomm Dragonwing IQ-8275 is the high-compute / production target for heavier vision workloads; it is **not** required for every gateway.

Models: Isolation Forest (unsupervised anomaly), XGBoost (hazard class), GRU (temporal escalation), RTMDet (vision detection), MobileNetV3-Small (vision verification). Isolation Forest, XGBoost and the GRU have reference training code (`services/ml/train.py`) evaluated on **synthetic** data. RTMDet / MobileNetV3-Small are listed as `RESEARCH` — no vision model is trained here.

### Reliability-weighted evidence fusion

```
E  = Σ(wᵢ × eᵢ) / Σwᵢ
wᵢ = base reliability × data quality × freshness × relevance
```

Sources: sensor, model, camera (where present), neighbor nodes (≤ 60 km, same hazard), external weather. Sensor health and data quality act through the weights, so a faulty sensor loses influence. Values are demo-configured scores, **not calibrated probabilities**.

### Quorum-gated validation

| Situation | Result |
|---|---|
| One quorum-eligible source abnormal (own sensor or camera, nobody else) | `SUSPICIOUS` — node shows WATCH, **no incident** |
| ≥ 2 independent sources abnormal (own sensor / camera / neighbors) | `CONFIRMED` — severity from E, incident created |
| Degraded sensor asserts an abnormal reading | `SUPPRESSED` — down-weighted, no alert, maintenance ticket |

Weather is contextual and not quorum-eligible.

### Severity vs. confidence

Different axes. Severity = f(E) with thresholds Watch ≥ 0.30, High ≥ 0.55, Critical ≥ 0.75. Confidence depends on the number of corroborating sources and data quality. A CRITICAL incident can have LOW confidence and vice-versa.

## AI-2 — cloud / regional intelligence

Ingest (MQTT/REST), TimescaleDB storage, regional risk aggregation, analytics, alert engine, model registry.

### Alert state machine

`NORMAL → WATCH → HIGH → CRITICAL → ACKNOWLEDGED → RESOLVED`.
- **De-duplication:** at most one active incident per `hazard + region` key; repeat detections increment `detections` and `duplicates_suppressed` (database enforces this with a partial unique index).
- **Escalation:** severity can rise; an acknowledged incident that escalates re-opens at the higher level.
- **Auto-resolve:** after evidence stays clear for 6 consecutive ticks.

## Data flow / event flow

1. Sensors sample → AI-0 filters, scores, packages compact telemetry.
2. Wio-E5 uplinks over LoRaWAN → gateway receiver.
3. AI-1 runs models, fuses evidence, applies quorum, publishes severity + confidence.
4. Confirmed events become incidents (de-duplicated) → alert engine.
5. Dissemination: authority dashboard, SMS, voice/IVR, C-DOT CAP/SACHET hand-off (geo-targeted). In parallel, a **local** path (siren / notice board) is triggered at the edge and works with the backhaul down.
6. In this demo, step 5 is **simulated** — nothing is transmitted.

## Maintenance flow

Node health/degradation → ticket → local steward/authority → field service → replaceable sensor pod → self-test + calibration → node back online. Resolving a ticket changes real engine state: faults clear, calibration dates and pod replacement history update, the node returns online. Stewardship (Panchayat/VWSC where appropriate, Forest Department, Municipality/ULB, industrial operator, critical-facility authority, trained local technician) is a **proposed** model; no government ownership or funding is assumed.

## Model lifecycle

DATA → TRAIN → VALIDATE → CALIBRATE → OPTIMIZE → EDGE BENCHMARK → APPROVE → DEPLOY → MONITOR → RETRAIN.
Safety-critical models are never auto-deployed: the registry table has a `CHECK` requiring a named approver before `DEPLOYED`, and the UI "Approve" button only records intent.

## Security

Signed HS256 session JWT (httpOnly cookie), secrets from env only, Next.js middleware route protection, RBAC re-checked in the API, Pydantic validation on all inputs, login throttling, security headers. Device identity/key management is designed (`nodes.device_key_ref`, MQTT ACL, per-device credentials) but not implemented end-to-end.
