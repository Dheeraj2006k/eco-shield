# SIH demo guide (≈ 8 minutes)

**Before you start:** `npm run gen-env`, `npm run dev`, sign in as `admin` (password printed by gen-env / in `apps/web/.env.local`). Use in-app links only — a browser refresh resets the in-memory demo. Have Demo Control reachable from the sidebar.

Say once, up front: *"Everything on screen is simulated data, and ECO-SHIELD is decision support, not an autonomous emergency command."*

| Min | Do | Say / show |
|---|---|---|
| 0:00 | Landing page → **LAUNCH LIVE DASHBOARD** | ECO-SHIELD = Ecological + Smart Hazard Intelligence & Environmental Local Detection. Signal chain: sensor → LoRaWAN → edge AI → fusion → risk → alert |
| 0:45 | Dashboard | KPIs, gateway/battery/sensor health, live pipeline, system status OPERATIONAL, "Demo / simulated" tags |
| 1:15 | **Live Map** | GIS node network; toggle Risk heatmap, Water level, Critical infrastructure; hover a marker for the popup |
| 1:45 | Click **HYD-001** → *Open node detail* | Water level + rainfall trends, AI-0 indicators (anomaly score, baseline deviation, data quality), sensor pod + universal core |
| 2:30 | **AI Intelligence** | AI-0/1/2 columns; model cards; evidence-fusion formula; quorum cards; registry = real metrics on *synthetic* data |
| 3:15 | **Demo Control → SIMULATE FLOOD** | Watch the pipeline highlight stage by stage and the timeline tick off |
| 3:45 | Node table on the same page (~T+4–10 s) | HYD-001 goes **SUSPICIOUS** (single source, no incident) → AI-0 anomaly logged |
| 4:30 | (~T+12 s) | HYD-002 corroborates → **CONFIRMED**; risk + confidence appear (separate axes) |
| 5:00 | Red banner → **Alert detail** | Severity CRITICAL vs. confidence; evidence contribution bars; quorum status; recommended action + "decision support" label; de-duplication counter |
| 5:45 | Dissemination panel | SMS/voice/IVR → CAP/SACHET → geo-targeted (simulated); **local siren ACTIVE** — click **SIMULATE BACKHAUL OUTAGE** to show cloud channels QUEUED while siren stays live |
| 6:30 | **Maintenance** | Ticket workflow; **TRIGGER MAINTENANCE EVENT** on Demo Control, then watch the ticket move; node page shows the replaceable pod; proposed community/institutional O&M panel |
| 7:15 | **SIMULATE SENSOR FAILURE** (optional) | Neighbor cross-check → SUPPRESSED, no false alarm |
| 7:30 | **Architecture** → click *Evidence fusion* | Five zones + external + lifecycle; per-module status (DEMO-LIVE / SIMULATED / STAGED / PLANNED) |
| 8:00 | **Hardware** | Pods, universal core, Raspberry Pi 5 prototype, optional AI HAT+, Qualcomm Dragonwing IQ-8275 as high-compute/production target (not mandatory) |
| 8:20 | Wrap | Scalability: swap the pod, keep the core; add hazards as modules; gateways scale by district |

**Reset:** Demo Control → **NORMAL SYSTEM** (open incidents auto-resolve after ~9 s).

**Questions to be ready for**
- *Is this live data?* No — simulated; labelled everywhere.
- *Are the model scores real?* The registry metrics are real but computed on a synthetic task; vision models are not trained.
- *Does it send alerts?* No — dissemination is simulated; CAP/SACHET is an integration point.
- *Who maintains nodes?* A proposed community/institutional O&M model; no funding or ownership is assumed.

**Roles to show (optional):** log in as `viewer` (read-only, Demo Control blocked), `steward` (can service tickets), `authority` (can acknowledge alerts).
