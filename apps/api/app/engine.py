"""Server-side demo engine: simulated telemetry → AI-0 indicators → evidence fusion → quorum → incidents.

All data produced here is SIMULATED. It mirrors apps/web/src/lib/engine (TypeScript) so that the web UI can
run against this backend (remote mode) and see exactly the same state shape via `snapshot()`.
All timestamps are epoch MILLISECONDS (matching the UI).
"""

from __future__ import annotations

import math
import random
import threading
import time
from collections import deque
from typing import Callable

TICK_S = 1.5
HISTORY = 240
DAY = 86_400_000

TH = {  # baseline, warn, danger, unit, label
    "water_level": (140.0, 220.0, 300.0, "cm", "Water Level"),
    "rainfall": (0.5, 15.0, 40.0, "mm/h", "Rainfall"),
    "temperature": (28.0, 42.0, 55.0, "°C", "Temperature"),
    "humidity": (60.0, 30.0, 15.0, "%", "Humidity"),
    "pm25": (45.0, 120.0, 250.0, "µg/m³", "PM2.5"),
    "pm10": (90.0, 250.0, 430.0, "µg/m³", "PM10"),
    "smoke": (40.0, 250.0, 600.0, "idx", "Smoke / Gas (MQ-2)"),
}
SIGMA = {"water_level": 6, "rainfall": 1.5, "temperature": 1.5, "humidity": 4, "pm25": 8, "pm10": 15, "smoke": 12}
NOISE = {"water_level": 1.1, "rainfall": 0.25, "temperature": 0.25, "humidity": 0.7, "pm25": 1.6, "pm10": 3, "smoke": 3}
MAX_JUMP = {"water_level": 70, "rainfall": 40, "temperature": 8, "humidity": 25, "pm25": 200, "pm10": 300, "smoke": 400}
SPIKE = {"water_level": 445, "rainfall": 120, "pm25": 900, "pm10": 1200, "smoke": 1000, "temperature": 95, "humidity": 100}
HAZARD_SENSORS = {
    "FLOOD": [("water_level", 0.7), ("rainfall", 0.3)],
    "FIRE": [("smoke", 0.4), ("temperature", 0.25), ("pm25", 0.2), ("humidity", 0.15)],
    "AIR": [("pm25", 0.55), ("pm10", 0.35), ("smoke", 0.1)],
}
PRIMARY = {"FLOOD": "water_level", "FIRE": "smoke", "AIR": "pm25"}
RANK = {"NORMAL": 0, "WATCH": 1, "HIGH": 2, "CRITICAL": 3}
ABNORMAL = 0.38
ACTIONS = {
    "FLOOD": {"WATCH": "Increase monitoring cadence; notify duty officer of rising water levels.", "HIGH": "Alert local authority; prepare downstream flood-prone areas for possible evacuation.", "CRITICAL": "Notify downstream flood-prone areas and local authority."},
    "FIRE": {"WATCH": "Dispatch patrol to verify; review fire-weather conditions.", "HIGH": "Alert Forest Department control room; pre-position response crews.", "CRITICAL": "Notify Forest Department and nearby settlements; begin fire-response coordination."},
    "AIR": {"WATCH": "Publish air-quality advisory for sensitive groups.", "HIGH": "Issue health advisory; notify municipal authority to review emission controls.", "CRITICAL": "Issue severe-pollution alert; notify municipal and health authorities."},
}

# relevance of each sensor to the node's hazard
RELEVANCE = {
    "FLOOD": {"water_level": 1.0, "rainfall": 0.85, "temperature": 0.3, "humidity": 0.3},
    "AIR": {"pm25": 1.0, "pm10": 0.9, "smoke": 0.5, "temperature": 0.3, "humidity": 0.3},
    "FIRE": {"smoke": 1.0, "temperature": 0.8, "pm25": 0.7, "pm10": 0.4, "humidity": 0.6},
}
SENSOR_SPECS = {  # type -> (model, base reliability)
    "water_level": ("DFRobot A02YYUW", 0.9), "rainfall": ("DFRobot SEN0575", 0.85), "temperature": ("SHT31", 0.9), "humidity": ("SHT31", 0.9),
    "pm25": ("Sensirion SPS30", 0.92), "pm10": ("Sensirion SPS30", 0.92), "smoke": ("MQ-2", 0.7),
}

# id, hazard, pod, site, district, region, lat, lon, gateway, camera, battery, signal, ageDays, offsets
SPECS = [
    ("HYD-001", "FLOOD", "HYDRO_FLOOD_POD", "Riverbank reach A (demo site)", "Haridwar", "Upper Ganga Corridor", 29.955, 78.170, "GW-HRD-01", False, 92, -92, 240, {"water_level": 3}),
    ("HYD-002", "FLOOD", "HYDRO_FLOOD_POD", "Riverbank reach B (demo site)", "Dehradun", "Upper Ganga Corridor", 30.126, 78.325, "GW-HRD-01", False, 88, -98, 210, {"water_level": -4}),
    ("HYD-003", "FLOOD", "HYDRO_FLOOD_POD", "Confluence reach C (demo site)", "Tehri Garhwal", "Upper Ganga Corridor", 30.146, 78.598, "GW-TEH-01", False, 81, -104, 150, {"water_level": 6}),
    ("AIR-001", "AIR", "FIRE_AIR_POD", "Urban core station (demo site)", "Dehradun", "Doon Valley Airshed", 30.324, 78.042, "GW-DDN-01", False, 95, -84, 190, {"pm25": 5, "pm10": 10}),
    ("AIR-002", "AIR", "FIRE_AIR_POD", "Transport junction station (demo site)", "Dehradun", "Doon Valley Airshed", 30.288, 77.999, "GW-DDN-01", False, 90, -89, 190, {"pm25": 12, "pm10": 22}),
    ("AIR-003", "AIR", "FIRE_AIR_POD", "Industrial estate station (demo site)", "Dehradun", "Doon Valley Airshed", 30.176, 78.116, "GW-DDN-01", False, 22, -109, 320, {"pm25": 8, "pm10": 16}),
    ("FIR-001", "FIRE", "FIRE_AIR_POD", "Forest range north (demo site)", "Dehradun", "Rajaji–Mussoorie Forest Belt", 30.045, 78.180, "GW-DDN-01", True, 86, -101, 120, {"smoke": 4, "temperature": 1}),
    ("FIR-002", "FIRE", "FIRE_AIR_POD", "Hill slope station (demo site)", "Dehradun", "Rajaji–Mussoorie Forest Belt", 30.420, 78.090, "GW-DDN-01", False, 47, -106, 120, {"smoke": -3, "temperature": -1}),
]
SENSORS_BY = {
    "HYDRO_FLOOD_POD": ["water_level", "rainfall", "temperature", "humidity"],
    "AIR": ["pm25", "pm10", "smoke", "temperature", "humidity"],
    "FIRE": ["smoke", "temperature", "pm25", "pm10", "humidity"],
}
GATEWAYS = [
    {"id": "GW-HRD-01", "name": "Haridwar Edge Gateway", "district": "Haridwar", "lat": 29.975, "lon": 78.185, "online": True, "uplink_ok": True, "hardware": "Raspberry Pi 5 + LoRa concentrator"},
    {"id": "GW-DDN-01", "name": "Dehradun Edge Gateway", "district": "Dehradun", "lat": 30.305, "lon": 78.035, "online": True, "uplink_ok": True, "hardware": "Raspberry Pi 5 + AI HAT+ (optional)"},
    {"id": "GW-TEH-01", "name": "Tehri Edge Gateway", "district": "Tehri Garhwal", "lat": 30.2, "lon": 78.5, "online": True, "uplink_ok": True, "hardware": "Raspberry Pi 5 + LoRa concentrator"},
]
EXTERNAL_BASE = {"rainfall_forecast_mm": 4.0, "wind_kmh": 9.0, "humidity_pct": 58.0, "stagnation_index": 0.22, "temperature_c": 29.0}
TICKET_FLOW = [("OPEN", "Ticket created"), ("ASSIGNED", "Local steward / authority assigned"), ("IN_FIELD", "Field service / pod replacement"), ("SELF_TEST", "Self-test + calibration"), ("RESOLVED", "Node back online")]
ORDER = [s for s, _ in TICKET_FLOW]


def clamp(x: float, a: float = 0.0, b: float = 1.0) -> float:
    return min(b, max(a, x))


def norm(t: str, v: float) -> float:
    b, _, d = TH[t][:3]
    return clamp((v - b) / (d - b))


def sev_from_e(e: float) -> str:
    return "CRITICAL" if e >= 0.75 else "HIGH" if e >= 0.55 else "WATCH" if e >= 0.30 else "NORMAL"


def conf_level(c: float) -> str:
    return "HIGH" if c >= 0.75 else "MEDIUM" if c >= 0.5 else "LOW"


def dist_km(a, b) -> float:
    dl = math.radians(b["lat"] - a["lat"])
    dn = math.radians(b["lon"] - a["lon"])
    h = math.sin(dl / 2) ** 2 + math.cos(math.radians(a["lat"])) * math.cos(math.radians(b["lat"])) * math.sin(dn / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def now_ms() -> float:
    return time.time() * 1000


def iso(ms: float) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ms / 1000))


class Engine:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.rand = random.Random(2026)
        self.reset_all()

    # ------------------------------------------------------------ setup
    def reset_all(self, keep_persisted: bool = False) -> None:
        now = now_ms()
        self.now = now
        self.tick_n = 0
        self.forcing: dict[str, dict[str, float]] = {}
        self.override: dict[str, str] = {}
        self.gateways = [dict(g) for g in GATEWAYS]
        self.run: dict | None = None
        self.log: deque[dict] = deque(maxlen=200)
        self.new_log: list[dict] = []
        self.notifications: deque[dict] = deque(maxlen=40)
        self.incidents: list[dict] = []
        self.events: deque[dict] = deque(maxlen=100)
        self.tickets: list[dict] = []
        self.clear_ticks: dict[str, int] = {}
        self.seq = {"inc": 1007, "evt": 1, "tkt": 1049, "log": 1, "notif": 1}
        self.history: dict[str, dict[str, deque]] = {}
        self.fusion: dict[str, dict] = {}
        self.risk_trend: deque[dict] = deque(maxlen=120)
        self.external = {**EXTERNAL_BASE, "wind_dir": "WSW", "source": "DEMO weather context (simulated — not a live weather feed)"}
        self.ext_target: dict[str, float] = {}
        self.camera = {"FIR-001": {"state": "NORMAL", "confidence": 0.03, "target": 0.03, "label": "no smoke / fire detected", "fps": 9.4}}
        self.counters = dict(readings=0, anomalies=0, packets=0, inferences=0, fused=0, quorum=0, risk=0, alerts=0, messages=0)
        self.system = {"health": "OPERATIONAL", "last_sync": now, "backhaul_ok": True, "reasons": []}
        self.pipeline: list[dict] = []
        self.nodes: dict[str, dict] = {}
        for (nid, hz, pod, site, dist, region, lat, lon, gw, cam, bat, sig, age, offs) in SPECS:
            kind = "HYDRO_FLOOD_POD" if pod == "HYDRO_FLOOD_POD" else hz
            sensors = {}
            for t in SENSORS_BY[kind]:
                model, base_rel = SENSOR_SPECS[t]
                rel = RELEVANCE[hz][t]
                v = TH[t][0] + offs.get(t, 0)
                sensors[t] = {"id": f"{nid}-{t}", "type": t, "label": TH[t][4], "model": model, "unit": TH[t][3], "value": v, "quality": 0.96, "fresh": 1.0, "base": base_rel, "rel": rel, "health": "HEALTHY", "fault": None, "cal": iso(now - 62 * DAY), "offset": offs.get(t, 0), "ewma": v, "cusum": 0.0, "z": 0.0}
            self.nodes[nid] = {
                "id": nid, "pod": pod, "hazard": hz, "site": site, "district": dist, "region": region, "lat": lat, "lon": lon, "gw": gw, "cam": cam, "age": age,
                "battery": float(bat), "sig_base": sig, "signal": float(sig), "snr": 8.0, "solar": 3.2, "storage": 18.0 + age % 13, "last_seen": now, "buffered": 0, "sensors": sensors,
                "anomaly": {"score": 0.03, "baseline_deviation": 0.0, "trend": "STABLE", "trend_rate": 0.0, "data_quality": 0.96, "sensor_reliability": 0.9, "cusum": 0.0},
                "risk": "NORMAL", "E": 0.0, "confidence": 0.9, "quorum": "NONE", "health": "DEGRADED" if bat < 25 else "HEALTHY", "maint": False,
                "last_service": iso(now - 47 * DAY), "replacements": [],
            }
            self.history[nid] = {t: deque(maxlen=HISTORY) for t in list(sensors) + ["battery", "signal"]}
            for i in range(120, 0, -1):
                ts = now - i * TICK_S * 1000
                for t, s in sensors.items():
                    self.history[nid][t].append((ts, s["value"] + self.rand.gauss(0, NOISE[t])))
                self.history[nid]["battery"].append((ts, bat + i * 0.0025))
                self.history[nid]["signal"].append((ts, sig + self.rand.gauss(0, 1.2)))
        for i in range(60):
            self.risk_trend.append({"t": now - (60 - i) * TICK_S * 1000, "FLOOD": 0.08 + 0.02 * math.sin(i / 5), "FIRE": 0.03, "AIR": 0.12 + 0.02 * math.cos(i / 6)})
        if not keep_persisted:
            self._seed_history()
        self._log("INFO", "SYSTEM", "ECO-SHIELD API engine started — all telemetry is SIMULATED.")

    def _seed_history(self) -> None:
        now = self.now
        h = lambda d, a, by: {"at": now - d * DAY, "action": a, "by": by}  # noqa: E731
        self.tickets = [
            {"ticket_id": "MT-1048", "node_id": "AIR-003", "issue": "Battery below 25% — solar panel shading suspected", "category": "SOLAR", "priority": "HIGH", "assigned_to": "Steward · R. Negi (demo)", "status": "ASSIGNED", "created_at": now - 1.2 * DAY, "service_history": [h(1.2, "Ticket created from AI-0 battery-trend rule", "ECO-SHIELD AI-0"), h(1.1, "Assigned to local steward", "Duty operator")]},
            {"ticket_id": "MT-1047", "node_id": "FIR-002", "issue": "Scheduled cleaning of PM optical inlet", "category": "CLEANING", "priority": "LOW", "assigned_to": "Forest Dept. steward (demo)", "status": "OPEN", "created_at": now - 2.4 * DAY, "service_history": [h(2.4, "Ticket created by schedule", "ECO-SHIELD scheduler")]},
            {"ticket_id": "MT-1046", "node_id": "HYD-003", "issue": "Rain-gauge tipping bucket calibration due", "category": "CALIBRATION", "priority": "MEDIUM", "assigned_to": "Panchayat technician (demo)", "status": "IN_FIELD", "created_at": now - 3.1 * DAY, "service_history": [h(3.1, "Calibration window reached (90 days)", "ECO-SHIELD scheduler"), h(2.9, "Assigned", "Duty operator"), h(0.4, "Technician en route", "Steward")]},
            {"ticket_id": "MT-1041", "node_id": "HYD-001", "issue": "Enclosure tamper switch triggered", "category": "TAMPER", "priority": "HIGH", "assigned_to": "Municipal ULB steward (demo)", "status": "RESOLVED", "created_at": now - 9 * DAY, "resolved_at": now - 8.5 * DAY, "service_history": [h(9, "Tamper event received", "ECO-SHIELD AI-0"), h(8.7, "Site inspected — false trigger, gasket re-seated", "Steward"), h(8.5, "Closed", "Steward")]},
            {"ticket_id": "MT-1036", "node_id": "AIR-002", "issue": "SPS30 fan-speed warning — pod replaced", "category": "SENSOR_REPLACEMENT", "priority": "MEDIUM", "assigned_to": "Municipal ULB steward (demo)", "status": "RESOLVED", "created_at": now - 21 * DAY, "resolved_at": now - 19 * DAY, "service_history": [h(21, "Fan-speed drift detected", "ECO-SHIELD AI-0"), h(20, "Pod swapped, self-test passed", "Steward"), h(19, "Calibration verified — node online", "Steward")]},
        ]
        defs = [(1006, "AIR", "AIR-002", "HIGH", 2.3, 5, 0.63), (1005, "FLOOD", "HYD-001", "HIGH", 5.1, 9, 0.68), (1004, "FIRE", "FIR-001", "WATCH", 8.4, 2, 0.42), (1003, "AIR", "AIR-001", "WATCH", 13, 7, 0.36), (1002, "FLOOD", "HYD-002", "CRITICAL", 22, 14, 0.81), (1001, "FIRE", "FIR-002", "HIGH", 31, 6, 0.6)]
        for (num, hz, nid, sev, ago, dur, e) in defs:
            n = self.nodes[nid]
            created = now - ago * DAY
            fusion = self._fuse(n)
            fusion.update(E=e, severity=sev, quorum="CONFIRMED", confidence=0.86, confidence_level="HIGH", quorum_sources=["Sensor evidence", "Neighbor corroboration"])
            self.incidents.append({
                "id": f"INC-{num}", "key": f"{hz}:{n['region']}", "event_ids": [f"EVT-{num}A"], "hazard": hz, "severity": sev, "peak_severity": sev, "confidence": 0.86, "confidence_level": "HIGH", "state": "RESOLVED",
                "location": f"{n['region']} · {n['district']}", "district": n["district"], "lat": n["lat"], "lon": n["lon"], "node_ids": [nid], "primary_node_id": nid, "status": "RESOLVED",
                "recommended_action": ACTIONS[hz][sev], "created_at": created, "updated_at": created + dur * 3_600_000, "acknowledged_at": created + 600_000, "acknowledged_by": "duty.operator (demo)", "resolved_at": created + dur * 3_600_000,
                "detections": 20 + num % 17, "duplicates_suppressed": 19 + num % 17,
                "history": [{"at": created, "state": sev, "note": "Quorum confirmed — incident created"}, {"at": created + 600_000, "state": "ACKNOWLEDGED", "note": "Acknowledged by duty operator (demo)"}, {"at": created + dur * 3_600_000, "state": "RESOLVED", "note": "Evidence returned to baseline"}],
                "fusion": fusion,
                "dissemination": {"channels": [{"key": "sms", "label": "SMS", "status": "SENT"}, {"key": "voice", "label": "Voice / IVR", "status": "SENT"}, {"key": "dash", "label": "Authority dashboard", "status": "SENT"}], "cap_sachet": "HANDED_OFF", "geo_target": "Historic demo incident", "local_siren": "STANDBY", "local_board": "STANDBY", "backhaul_ok": True},
                "simulated": True,
            })
        self.incidents.sort(key=lambda i: -i["created_at"])

    def _log(self, level: str, source: str, message: str) -> None:
        e = {"id": f"L{self.seq['log']}", "at": self.now, "level": level, "source": source, "message": message}
        self.seq["log"] += 1
        self.log.appendleft(e)
        self.new_log.append(e)

    def _notify(self, level: str, title: str, body: str, href: str | None = None) -> None:
        self.notifications.appendleft({"id": f"N{self.seq['notif']}", "at": self.now, "level": level, "title": title, "body": body, "href": href, "read": False})
        self.seq["notif"] += 1

    # ------------------------------------------------------------ physics + AI-0
    def _update_sensor(self, n: dict, s: dict, online: bool) -> None:
        t = s["type"]
        if not online:
            s["fresh"] = clamp(math.exp(-(self.now - n["last_seen"]) / 40_000))
            return
        base = TH[t][0] + s["offset"]
        forced = self.forcing.get(n["id"], {}).get(t)
        target = base if forced is None else forced
        prev = s["value"]
        if s["fault"] == "SPIKE":
            v = SPIKE.get(t, prev * 3) + self.rand.gauss(0, NOISE[t] * 0.3)
        elif s["fault"] == "STUCK":
            v = prev
        else:
            v = prev + (target - prev) * (0.3 if forced is not None else 0.14) + self.rand.gauss(0, NOISE[t])
        v = clamp(v, 0, 100) if t == "humidity" else max(0.0, v)
        s["value"] = v
        s["ewma"] += 0.35 * (v - s["ewma"])
        s["z"] = (s["ewma"] - TH[t][0]) / SIGMA[t]
        s["cusum"] = clamp(max(0.0, s["cusum"] + abs(s["z"]) - 1), 0, 60)
        jump = abs(v - prev) > MAX_JUMP[t]
        degraded = 0.06 if n["health"] == "DEGRADED" else 0.0
        qt = 0.1 if s["fault"] else 0.35 if jump else 0.62 if s["health"] == "CALIBRATION_REQUIRED" else 0.96 - degraded
        s["quality"] = clamp(s["quality"] + (qt - s["quality"]) * 0.5, 0.05, 0.99)
        s["fresh"] = 1.0
        if s["fault"]:
            s["health"] = "FAULT"
        elif s["health"] != "CALIBRATION_REQUIRED":
            s["health"] = "FAULT" if s["quality"] < 0.3 else "QUESTIONABLE" if s["quality"] < 0.7 else "HEALTHY"

    @staticmethod
    def weight(s: dict) -> float:
        return s["base"] * s["quality"] * s["fresh"] * s["rel"]

    def _update_node(self, n: dict) -> None:
        offline = self.override.get(n["id"]) == "OFFLINE"
        for s in n["sensors"].values():
            self._update_sensor(n, s, not offline)
        if not offline:
            n["last_seen"] = self.now - self.rand.random() * 900
            n["battery"] = max(0.0, n["battery"] - 0.0025)
            n["solar"] = max(0.0, (0.5 if n["id"] == "AIR-003" else 3.4) + math.sin(self.tick_n / 30) * 1.6 + self.rand.gauss(0, 0.15))
            n["signal"] = n["sig_base"] + self.rand.gauss(0, 1.4)
            n["snr"] = 8 + self.rand.gauss(0, 0.6) - max(0.0, (-n["sig_base"] - 95) / 6)
            n["storage"] = clamp(n["storage"] + 0.002, 0, 99)
            gw = next(g for g in self.gateways if g["id"] == n["gw"])
            n["buffered"] = 0 if gw["uplink_ok"] else n["buffered"] + 1
        primary = n["sensors"][PRIMARY[n["hazard"]]]
        hist = self.history[n["id"]][primary["type"]]
        prev_score = n["anomaly"]["score"]
        score = clamp(0.5 * clamp(abs(primary["z"]) / 10) + 0.5 * clamp(primary["cusum"] / 25))
        slope = (primary["value"] - hist[-6][1]) / 5 if len(hist) > 6 else 0.0
        thr = SIGMA[primary["type"]] * 0.35
        rel_sum = sum(s["rel"] for s in n["sensors"].values())
        n["anomaly"] = {
            "score": score, "baseline_deviation": primary["z"], "trend": "RISING" if slope > thr else "FALLING" if slope < -thr else "STABLE", "trend_rate": slope,
            "data_quality": sum(s["quality"] * s["rel"] for s in n["sensors"].values()) / rel_sum,
            "sensor_reliability": sum(s["base"] * s["quality"] * s["rel"] for s in n["sensors"].values()) / rel_sum, "cusum": primary["cusum"],
        }
        if score >= 0.4 > prev_score:
            self._log("WARN", f"AI-0 · {n['id']}", f"Anomaly detected on {primary['label']}: z={primary['z']:.1f}, CUSUM={primary['cusum']:.1f}, score {score:.2f}")
        ov = self.override.get(n["id"])
        n["health"] = ov or ("DEGRADED" if (n["battery"] < 25 or n["signal"] < -112 or any(s["health"] == "FAULT" for s in n["sensors"].values())) else "HEALTHY")
        for t, s in n["sensors"].items():
            self.history[n["id"]][t].append((self.now, s["value"]))
        self.history[n["id"]]["battery"].append((self.now, n["battery"]))
        self.history[n["id"]]["signal"].append((self.now, n["signal"]))

    # ------------------------------------------------------------ fusion
    def _sensor_evidence(self, n: dict) -> tuple[float, float, bool, bool]:
        defs = HAZARD_SENSORS.get(n["hazard"])
        if not defs or n["health"] == "OFFLINE" or n["maint"]:
            return 0.0, 0.0, False, False
        num = den = wsum = imp_sum = 0.0
        bad = False
        for t, imp in defs:
            s = n["sensors"].get(t)
            if not s:
                continue
            sc = norm(t, s["value"])
            w = self.weight(s)
            num += imp * w * sc
            den += imp * w
            wsum += imp * w
            imp_sum += imp
            if (s["health"] == "FAULT" or s["quality"] < 0.5) and sc > 0.5:
                bad = True
        return (num / den if den > 0.001 else 0.0), (wsum / imp_sum if imp_sum else 0.0), bad, den > 0.001

    def _fuse(self, n: dict) -> dict:
        e_s, w_s, bad, avail = self._sensor_evidence(n)
        quality = n["anomaly"]["data_quality"]
        fault = any(s["health"] == "FAULT" for s in n["sensors"].values())
        prim = n["sensors"][PRIMARY[n["hazard"]]]
        items = [{"key": "sensor", "label": "Sensor evidence", "value": e_s, "weight": w_s, "available": avail, "abnormal": avail and e_s >= ABNORMAL and w_s >= 0.2, "detail": f"Local {n['hazard'].lower()} score from {prim['label']}" if avail else "Node offline / in maintenance"}]
        e_m = clamp(0.6 * e_s + 0.4 * (0 if fault else n["anomaly"]["score"])) if avail else 0.0
        items.append({"key": "model", "label": "Model evidence", "value": e_m, "weight": 0.85 * quality if avail else 0.0, "available": avail, "abnormal": False, "detail": f"AI-1 ensemble (XGBoost + GRU + IsoForest) · anomaly {n['anomaly']['score']:.2f}"})
        cam = self.camera.get(n["id"])
        if cam and n["cam"]:
            up = n["health"] != "OFFLINE" and not n["maint"]
            items.append({"key": "camera", "label": "Camera evidence", "value": cam["confidence"] if up else 0.0, "weight": 0.9 if up else 0.0, "available": up, "abnormal": up and cam["state"] != "NORMAL" and cam["confidence"] >= ABNORMAL, "detail": f"RTMDet + MobileNetV3-Small · {cam['state']}" + (f" ({cam['label']})" if cam["state"] != "NORMAL" else "")})
        nb_num = nb_den = nb_w = 0.0
        names: list[str] = []
        for m in self.nodes.values():
            if m["id"] != n["id"] and m["hazard"] == n["hazard"] and m["health"] != "OFFLINE" and not m["maint"] and dist_km(m, n) <= 60:
                e2, w2, _b, a2 = self._sensor_evidence(m)
                if a2:
                    nb_num += w2 * e2
                    nb_den += w2
                    nb_w += w2
                    names.append(m["id"])
        nb_ok = nb_den > 0.05
        e_nb = nb_num / nb_den if nb_ok else 0.0
        w_nb = 0.85 * nb_w / len(names) if nb_ok else 0.0
        items.append({"key": "neighbor", "label": "Neighbor corroboration", "value": e_nb, "weight": w_nb, "available": nb_ok, "abnormal": nb_ok and e_nb >= ABNORMAL and w_nb >= 0.2, "detail": f"{', '.join(names)} within 60 km" if nb_ok else "No healthy neighbor nodes in range"})
        x = self.external
        if n["hazard"] == "FLOOD":
            wx, wd = clamp(x["rainfall_forecast_mm"] / 60), f"{x['rainfall_forecast_mm']:.0f} mm forecast (next 6 h)"
        elif n["hazard"] == "FIRE":
            wx, wd = clamp(0.55 * clamp((45 - x["humidity_pct"]) / 30) + 0.45 * clamp((x["wind_kmh"] - 8) / 30)), f"RH {x['humidity_pct']:.0f}%, wind {x['wind_kmh']:.0f} km/h"
        else:
            wx, wd = clamp(x["stagnation_index"]), f"Stagnation index {x['stagnation_index']:.2f}"
        items.append({"key": "weather", "label": "External weather", "value": wx, "weight": 0.5, "available": True, "abnormal": False, "detail": wd})
        sum_w = sum(i["weight"] for i in items if i["available"])
        E = sum(i["weight"] * i["value"] for i in items if i["available"]) / sum_w if sum_w else 0.0
        for i in items:
            i["contribution"] = (i["weight"] * i["value"] / sum_w) if (i["available"] and sum_w) else 0.0
        elig = [i for i in items if i["key"] in ("sensor", "neighbor", "camera")]
        abn = [i for i in elig if i["abnormal"]]
        own = any(i["abnormal"] for i in elig if i["key"] in ("sensor", "camera"))
        quorum = "SUPPRESSED" if bad else "NONE" if not own else "CONFIRMED" if len(abn) >= 2 else "SUSPICIOUS"
        sev = sev_from_e(E) if quorum == "CONFIRMED" else "WATCH" if quorum == "SUSPICIOUS" else "NORMAL"
        if quorum == "CONFIRMED":
            conf = clamp(0.5 + 0.15 * (len(abn) - 2) + 0.28 * quality, 0, 0.97)
        elif quorum == "SUSPICIOUS":
            conf = clamp(0.22 + 0.12 * quality, 0, 0.45)
        elif quorum == "SUPPRESSED":
            conf = 0.18
        else:
            conf = clamp(0.85 * quality, 0, 0.95)
        return {"node_id": n["id"], "E": E, "evidence": items, "quorum": quorum, "quorum_sources": [i["label"] for i in abn], "severity": sev, "confidence": conf, "confidence_level": conf_level(conf), "sensor_health_factor": w_s, "data_quality": quality}

    # ------------------------------------------------------------ tick
    def tick(self) -> None:
        with self.lock:
            self.now = now_ms()
            self.tick_n += 1
            self._step_scenario()
            for k, base in EXTERNAL_BASE.items():
                self.external[k] += (self.ext_target.get(k, base) - self.external[k]) * 0.12
            for nid, c in self.camera.items():
                up = self.nodes[nid]["health"] != "OFFLINE"
                prev = c["state"]
                if up:
                    c["confidence"] = clamp(c["confidence"] + (c["target"] - c["confidence"]) * 0.25 + self.rand.gauss(0, 0.01), 0.01, 0.99)
                cf = c["confidence"]
                c["state"] = "CONFIRMED" if cf >= 0.8 else "SUSPECTED" if cf >= 0.55 else "WATCH" if cf >= 0.3 else "NORMAL"
                c["label"] = "no smoke / fire detected" if c["state"] == "NORMAL" else "smoke plume + flame front" if cf >= 0.8 else "smoke plume"
                c["fps"] = 9.2 + self.rand.gauss(0, 0.4) if up else 0.0
                if c["state"] != prev and c["state"] != "NORMAL":
                    self._log("WARN", f"VISION · {nid}", f"Camera event state {prev} → {c['state']} ({c['label']}, conf {cf * 100:.0f}%)")
            for n in self.nodes.values():
                self._update_node(n)
            for n in self.nodes.values():
                f = self.fusion[n["id"]] = self._fuse(n)
                prev = n["quorum"]
                n["risk"], n["E"], n["confidence"], n["quorum"] = f["severity"], f["E"], f["confidence"], f["quorum"]
                if prev != f["quorum"] and f["quorum"] != "NONE":
                    srcs = f" ({' + '.join(f['quorum_sources'])})" if f["quorum_sources"] else ""
                    msg = {"SUSPICIOUS": f"Single-source abnormality{srcs} — SUSPICIOUS, awaiting corroboration", "CONFIRMED": f"Multi-source corroboration{srcs} — CONFIRMED · E={f['E']:.2f}", "SUPPRESSED": "Degraded sensor asserting abnormal reading — evidence DOWN-WEIGHTED / SUPPRESSED"}[f["quorum"]]
                    self._log("ALERT" if f["quorum"] == "CONFIRMED" else "WARN", f"QUORUM · {n['id']}", msg)
            online = [n for n in self.nodes.values() if n["health"] != "OFFLINE"]
            c = self.counters
            c["readings"] += sum(len(n["sensors"]) for n in online)
            c["packets"] += len(online)
            c["inferences"] += len(online)
            c["anomalies"] += sum(1 for n in self.nodes.values() if n["anomaly"]["score"] >= 0.4)
            c["fused"] += len(self.nodes)
            c["quorum"] += sum(1 for n in self.nodes.values() if n["quorum"] != "NONE")
            c["risk"] += sum(1 for n in self.nodes.values() if n["risk"] != "NORMAL")
            mx = lambda h: max([0.0] + [n["E"] for n in self.nodes.values() if n["hazard"] == h])  # noqa: E731
            self.risk_trend.append({"t": self.now, "FLOOD": mx("FLOOD"), "FIRE": mx("FIRE"), "AIR": mx("AIR")})
            self._incidents()
            self._system()
            self._pipeline()

    # ------------------------------------------------------------ incidents
    def _gw_ok(self, n: dict) -> bool:
        return next(g for g in self.gateways if g["id"] == n["gw"])["uplink_ok"]

    def _geo(self, n: dict) -> str:
        if n["hazard"] == "FLOOD":
            return f"Downstream flood-prone zones · {n['district']} · ~12 km reach (demo geofence)"
        if n["hazard"] == "FIRE":
            return f"Settlements within 8 km of {n['id']} · {n['district']} (demo geofence)"
        return f"Urban wards in {n['region']} (demo geofence)"

    def _ensure_channels(self, diss: dict, sev: str) -> None:
        if RANK[sev] >= RANK["HIGH"]:
            for key, label in (("sms", "SMS"), ("voice", "Voice"), ("ivr", "IVR")):
                if not any(c["key"] == key for c in diss["channels"]):
                    diss["channels"].append({"key": key, "label": label, "status": "PENDING"})

    def _event(self, n: dict, f: dict) -> dict:
        e = {"id": f"EVT-{self.seq['evt']}", "node_id": n["id"], "hazard": n["hazard"], "timestamp": self.now, "severity": f["severity"], "confidence": f["confidence"], "evidence": [dict(i) for i in f["evidence"]], "sensor_health": {t: s["health"] for t, s in n["sensors"].items()}, "model_versions": {"node": "demo-0.4.2", "firmware": "iris-fw 0.9.3-demo"}}
        self.seq["evt"] += 1
        self.events.appendleft(e)
        return e

    def _incidents(self) -> None:
        groups: dict[str, list[dict]] = {}
        for n in self.nodes.values():
            f = self.fusion[n["id"]]
            if n["hazard"] in HAZARD_SENSORS and f["quorum"] == "CONFIRMED" and f["severity"] != "NORMAL":
                groups.setdefault(f"{n['hazard']}:{n['region']}", []).append(n)
        for key, nodes in groups.items():
            primary = max(nodes, key=lambda x: self.fusion[x["id"]]["E"])
            pf = self.fusion[primary["id"]]
            sev = max((self.fusion[x["id"]]["severity"] for x in nodes), key=lambda r: RANK[r])
            conf = max(self.fusion[x["id"]]["confidence"] for x in nodes)
            self.clear_ticks[key] = 0
            ex = next((i for i in self.incidents if i["key"] == key and i["status"] != "RESOLVED"), None)
            if ex is None:
                evt = self._event(primary, pf)
                diss = {"channels": [{"key": "dash", "label": "Authority dashboard", "status": "PENDING"}], "cap_sachet": "PENDING", "geo_target": self._geo(primary), "local_siren": "STANDBY", "local_board": "STANDBY", "backhaul_ok": self._gw_ok(primary)}
                self._ensure_channels(diss, sev)
                inc = {"id": f"INC-{self.seq['inc']}", "key": key, "event_ids": [evt["id"]], "hazard": primary["hazard"], "severity": sev, "peak_severity": sev, "confidence": conf, "confidence_level": pf["confidence_level"], "state": sev,
                       "location": f"{primary['region']} · {primary['district']}", "district": primary["district"], "lat": primary["lat"], "lon": primary["lon"], "node_ids": [x["id"] for x in nodes], "primary_node_id": primary["id"], "status": "ACTIVE",
                       "recommended_action": ACTIONS[primary["hazard"]][sev], "created_at": self.now, "updated_at": self.now, "detections": 1, "duplicates_suppressed": 0,
                       "history": [{"at": self.now, "state": sev, "note": f"Quorum confirmed ({' + '.join(pf['quorum_sources'])}) — incident created"}], "fusion": pf, "dissemination": diss, "simulated": True}
                self.seq["inc"] += 1
                self.incidents.insert(0, inc)
                self.counters["alerts"] += 1
                self._log("ALERT", "ALERT ENGINE", f"{inc['id']} created · {primary['hazard']} · {sev} · confidence {conf * 100:.0f}% · {inc['location']}")
                self._notify("critical" if sev == "CRITICAL" else "warn", f"{sev} {primary['hazard'].lower()} incident", f"{inc['location']} — {inc['id']}", f"/alerts/{inc['id']}")
                continue
            ex["detections"] += 1
            ex["updated_at"] = self.now
            ex["fusion"] = pf
            ex["confidence"] = conf
            ex["confidence_level"] = pf["confidence_level"]
            ex["primary_node_id"] = primary["id"]
            ex["node_ids"] = sorted(set(ex["node_ids"]) | {x["id"] for x in nodes})
            if RANK[sev] > RANK[ex["severity"]]:
                was_ack = ex["status"] == "ACKNOWLEDGED"
                ex.update(severity=sev, peak_severity=sev, status="ACTIVE", state=sev, recommended_action=ACTIONS[primary["hazard"]][sev])
                ex["event_ids"].append(self._event(primary, pf)["id"])
                self._ensure_channels(ex["dissemination"], sev)
                ex["history"].append({"at": self.now, "state": sev, "note": "Escalated after acknowledgement" if was_ack else "Escalated — evidence strengthened"})
                self._log("ALERT", "ALERT ENGINE", f"{ex['id']} ESCALATED to {sev}" + (" (re-opened after ack)" if was_ack else ""))
                self._notify("critical" if sev == "CRITICAL" else "warn", f"{ex['id']} escalated to {sev}", ex["location"], f"/alerts/{ex['id']}")
            else:
                ex["duplicates_suppressed"] += 1  # de-duplication: never a second incident for the same key
        for inc in self.incidents:
            if inc["status"] == "RESOLVED" or inc["key"] in groups:
                continue
            self.clear_ticks[inc["key"]] = self.clear_ticks.get(inc["key"], 0) + 1
            if self.clear_ticks[inc["key"]] >= 6:
                inc.update(status="RESOLVED", state="RESOLVED", resolved_at=self.now, updated_at=self.now)
                inc["dissemination"]["local_siren"] = "STANDBY"
                inc["dissemination"]["local_board"] = "STANDBY"
                inc["history"].append({"at": self.now, "state": "RESOLVED", "note": "Evidence returned to baseline — auto-resolved"})
                self._log("OK", "ALERT ENGINE", f"{inc['id']} auto-resolved — evidence returned to baseline.")
                self._notify("ok", f"{inc['id']} resolved", inc["location"], f"/alerts/{inc['id']}")
        self._disseminate()

    def _disseminate(self) -> None:
        sched = {"dash": 0, "sms": 1500, "voice": 3000, "ivr": 3000}
        for inc in self.incidents:
            if inc["status"] == "RESOLVED":
                continue
            node = self.nodes[inc["primary_node_id"]]
            bh = self._gw_ok(node)
            d = inc["dissemination"]
            d["backhaul_ok"] = bh
            age = self.now - inc["created_at"]
            for ch in d["channels"]:
                if ch["status"] == "SENT" or age < sched.get(ch["key"], 0):
                    continue
                if bh:
                    ch["status"], ch["at"] = "SENT", self.now
                    self.counters["messages"] += 1
                    self._log("INFO", "DISSEMINATION", f"{ch['label']} dispatched for {inc['id']} (SIMULATED — no real message sent)")
                elif ch["status"] != "QUEUED":
                    ch["status"] = "QUEUED"
                    self._log("WARN", "DISSEMINATION", f"{ch['label']} for {inc['id']} QUEUED — backhaul unavailable")
            if RANK[inc["severity"]] >= RANK["HIGH"] and d["cap_sachet"] != "HANDED_OFF" and age >= 4500:
                if bh:
                    d["cap_sachet"] = "HANDED_OFF"
                    self.counters["messages"] += 1
                    self._log("INFO", "DISSEMINATION", f"{inc['id']} handed to C-DOT CAP / SACHET for geo-targeted dissemination (SIMULATED handoff)")
                else:
                    d["cap_sachet"] = "QUEUED"
            if RANK[inc["severity"]] >= RANK["HIGH"] and d["local_board"] != "ACTIVE":
                d["local_board"] = "ACTIVE"
                self._log("ALERT", "LOCAL RESPONSE", f"Local notice board ACTIVE at {node['id']} (edge-triggered, backhaul-independent)")
            if inc["severity"] == "CRITICAL" and d["local_siren"] != "ACTIVE":
                d["local_siren"] = "ACTIVE"
                self._log("ALERT", "LOCAL RESPONSE", f"Local siren ACTIVE at {node['id']} (edge-triggered, backhaul-independent)")

    def _system(self) -> None:
        offline = sum(1 for n in self.nodes.values() if n["health"] == "OFFLINE")
        maint = sum(1 for n in self.nodes.values() if n["health"] == "MAINTENANCE_REQUIRED")
        degraded = sum(1 for n in self.nodes.values() if n["health"] == "DEGRADED")
        gw_down = sum(1 for g in self.gateways if not g["uplink_ok"])
        reasons: list[str] = []
        health = "OPERATIONAL"
        if offline == len(self.nodes):
            health = "OFFLINE"
        elif gw_down:
            health = "PARTIAL_OUTAGE"
            reasons.append(f"{gw_down} gateway uplink(s) down — cloud sync degraded, local response unaffected")
        elif offline or maint or degraded >= 2:
            health = "DEGRADED"
        if offline:
            reasons.append(f"{offline} node(s) offline")
        if maint:
            reasons.append(f"{maint} node(s) need maintenance")
        if degraded:
            reasons.append(f"{degraded} node(s) degraded")
        self.system.update(health=health, reasons=reasons, backhaul_ok=gw_down == 0)
        if any(g["uplink_ok"] for g in self.gateways):
            self.system["last_sync"] = self.now

    def _pipeline(self) -> None:
        nodes = list(self.nodes.values())
        online = [n for n in nodes if n["health"] != "OFFLINE"]
        a_hot = any(n["anomaly"]["score"] >= 0.4 for n in nodes)
        e_hot = any(f["E"] >= 0.3 for f in self.fusion.values())
        q_hot = any(f["quorum"] != "NONE" for f in self.fusion.values())
        r_hot = any(n["risk"] != "NORMAL" for n in nodes)
        active = [i for i in self.incidents if i["status"] != "RESOLVED"]
        outage = any(not g["uplink_ok"] for g in self.gateways)
        j = self.rand.uniform
        c = self.counters

        def mk(key, label, status, lat, events, hot, note):
            return {"key": key, "label": label, "status": status, "latency_ms": round(lat), "events": events, "hot": hot, "note": note}

        self.pipeline = [
            mk("sensing", "SENSING", "ACTIVE" if online else "DOWN", j(38, 62), c["readings"], False, f"{len(online)}/{len(nodes)} nodes reporting"),
            mk("node_ai", "NODE AI (AI-0)", "ACTIVE" if online else "DOWN", j(9, 18), c["anomalies"], a_hot, "EWMA · CUSUM · TinyML"),
            mk("lorawan", "LoRaWAN", "DEGRADED" if len(online) < len(nodes) else "ACTIVE", j(980, 1450), c["packets"], a_hot, "compact telemetry only — no raw video"),
            mk("edge_ai", "EDGE AI (AI-1)", "ACTIVE", j(48, 96), c["inferences"], e_hot, "XGBoost · GRU · IsoForest · RTMDet"),
            mk("evidence", "EVIDENCE", "ACTIVE", j(4, 12), c["fused"], e_hot, "reliability-weighted fusion"),
            mk("quorum", "QUORUM", "ACTIVE", j(2, 6), c["quorum"], q_hot, "multi-source gate"),
            mk("risk", "RISK", "ACTIVE", j(2, 5), c["risk"], r_hot, "severity + confidence"),
            mk("alert", "ALERT", "ACTIVE", j(90, 150), c["alerts"], bool(active), f"{len(active)} active incident(s)"),
            mk("dissemination", "DISSEMINATION", "DEGRADED" if outage else "ACTIVE", 0 if outage else j(240, 520), c["messages"], any(i["severity"] != "WATCH" for i in active), "cloud channels queued · local path live" if outage else "SMS · voice · CAP · local siren"),
        ]

    # ------------------------------------------------------------ scenarios
    def _force(self, node: str, t: str, v: float) -> None:
        self.forcing.setdefault(node, {})[t] = v

    def _cam(self, node: str, v: float) -> None:
        if node in self.camera:
            self.camera[node]["target"] = v

    def _step_scenario(self) -> None:
        if not self.run:
            return
        el = (self.now - self.run["started_at"]) / 1000
        for st in self.run["steps"]:
            if not st["done"] and el >= st["at"]:
                st["done"] = True
                fn = st.get("fn")
                if fn:
                    fn()
                self._log("INFO", "SCENARIO", st["label"])

    def _reset_normal(self) -> None:
        self.forcing.clear()
        self.override.clear()
        self.ext_target.clear()
        for c in self.camera.values():
            c["target"] = 0.03
        for g in self.gateways:
            g["uplink_ok"] = True
        for n in self.nodes.values():
            n["maint"] = False
            for s in n["sensors"].values():
                if s["fault"]:
                    s["value"] = TH[s["type"]][0] + s["offset"]
                s["fault"] = None
                if s["health"] == "CALIBRATION_REQUIRED" and not any(t["node_id"] == n["id"] and t["status"] != "RESOLVED" for t in self.tickets):
                    s["health"] = "HEALTHY"

    LABELS = {
        "normal": "Normal system", "flood": "Simulate flood", "fire": "Simulate fire", "pollution": "Simulate pollution", "sensor-failure": "Simulate sensor failure",
        "node-offline": "Simulate node offline", "backhaul-outage": "Simulate backhaul outage", "maintenance-event": "Trigger maintenance event",
    }
    KINDS = {"normal": "NORMAL", "flood": "FLOOD", "fire": "FIRE", "pollution": "POLLUTION", "sensor-failure": "SENSOR_FAILURE", "node-offline": "NODE_OFFLINE", "backhaul-outage": "BACKHAUL_OUTAGE", "maintenance-event": "MAINTENANCE"}

    def scenario(self, slug: str) -> list[str]:
        with self.lock:
            self.now = now_ms()
            f, S = self._force, []  # noqa: N806

            def step(at, stage, label, fn=None):
                S.append({"at": at, "stage": stage, "label": label, "done": False, "fn": fn})

            if slug == "restore-backhaul":
                for g in self.gateways:
                    g["uplink_ok"] = True
                self._log("OK", "BACKHAUL", "Backhaul restored — queued cloud alerts and buffered telemetry are being released.")
                self._notify("ok", "Backhaul restored", "Queued messages released.")
                return ["restored"]
            if slug == "normal":
                self._reset_normal()
                self._log("OK", "SCENARIO", "Returned to NORMAL — forcing cleared, faults cleared, uplinks restored. Open incidents auto-resolve once evidence stays clear.")
                self.run = {"kind": "NORMAL", "started_at": self.now, "steps": [{"at": 0, "label": "System returned to baseline", "stage": "sensing", "done": True}]}
                return ["Returned to baseline"]
            if slug == "flood":
                for k in [k for k in self.forcing if k.startswith("HYD")]:
                    del self.forcing[k]

                def s0():
                    self.ext_target["rainfall_forecast_mm"] = 52
                    f("HYD-001", "rainfall", 34); f("HYD-002", "rainfall", 24); f("HYD-003", "rainfall", 9)

                step(0, "sensing", "Heavy rainfall upstream — rain gauges HYD-001 / HYD-002 rising", s0)
                step(3, "node_ai", "HYD-001 water level climbing — AI-0 EWMA/CUSUM raises anomaly", lambda: f("HYD-001", "water_level", 305))
                step(6, "lorawan", "Compact anomaly packets uplinked over LoRaWAN → GW-HRD-01", lambda: self._log("INFO", "LoRaWAN", "Anomaly packets from HYD-001 received at GW-HRD-01 (RSSI/SNR nominal)."))
                step(8, "evidence", "HYD-002 corroborates — neighbor evidence rises", lambda: f("HYD-002", "water_level", 290))
                step(12, "quorum", "AI-1 quorum gate: single-source SUSPICIOUS → multi-source CONFIRMED", lambda: self._log("INFO", "AI-1", "Edge models (XGBoost, GRU, IsoForest) agree with sensor + neighbor evidence."))
                step(14, "risk", "Levels exceed danger thresholds — risk escalates", lambda: (f("HYD-001", "water_level", 352), f("HYD-002", "water_level", 338), f("HYD-003", "water_level", 255)))
                step(20, "alert", "Rise propagating downstream — HYD-003 corroborates", lambda: f("HYD-003", "water_level", 325))
                step(26, "dissemination", "Geo-targeted alert cascade + local siren (edge-triggered)", lambda: self._log("INFO", "DISSEMINATION", "Decision support issued to authority; downstream zone geofence selected. (SIMULATED)"))
            elif slug == "fire":
                for k in [k for k in self.forcing if k.startswith("FIR")]:
                    del self.forcing[k]

                def s0():
                    self.ext_target.update(humidity_pct=24, wind_kmh=30)
                    for t, v in (("smoke", 430), ("temperature", 48), ("pm25", 170), ("humidity", 20)):
                        f("FIR-001", t, v)

                step(0, "sensing", "Smoke + heat rising near FIR-001; dry, windy conditions", s0)
                step(4, "node_ai", "AI-0 smoke-slope anomaly on FIR-001", lambda: self._log("INFO", "AI-0", "FIR-001 smoke slope + temperature persist above EWMA baseline."))
                step(6, "edge_ai", "Camera verification — RTMDet + MobileNetV3-Small detect smoke plume", lambda: self._cam("FIR-001", 0.66))
                step(11, "evidence", "FIR-002 corroborates (smoke + temperature)", lambda: [f("FIR-002", "smoke", 320), f("FIR-002", "temperature", 43), f("FIR-002", "pm25", 120)])
                step(15, "risk", "Camera confirms flame front; smoke intensifies", lambda: (self._cam("FIR-001", 0.92), f("FIR-001", "smoke", 660), f("FIR-001", "temperature", 57), f("FIR-002", "smoke", 520)))
                step(20, "alert", "Smoke drifting into the airshed — AIR-002 PM2.5 rising", lambda: (f("AIR-002", "pm25", 150), f("AIR-002", "pm10", 240)))
            elif slug == "pollution":
                for k in [k for k in self.forcing if k.startswith("AIR")]:
                    del self.forcing[k]

                def s0():
                    self.ext_target["stagnation_index"] = 0.9
                    f("AIR-002", "pm25", 190); f("AIR-002", "pm10", 330)

                step(0, "sensing", "Stagnant conditions — PM2.5 rising at AIR-002", s0)
                step(4, "node_ai", "AI-0 flags PM drift persistence at AIR-002")
                step(6, "evidence", "AIR-001 corroborates", lambda: (f("AIR-001", "pm25", 200), f("AIR-001", "pm10", 340)))
                step(10, "quorum", "Quorum: multiple airshed nodes agree", lambda: (f("AIR-003", "pm25", 175), f("AIR-003", "pm10", 305)))
                step(16, "risk", "Concentrations climb further", lambda: (f("AIR-001", "pm25", 265), f("AIR-002", "pm25", 280), f("AIR-003", "pm25", 235), f("AIR-002", "pm10", 430)))
            elif slug == "sensor-failure":
                def s0():
                    self.nodes["HYD-002"]["sensors"]["water_level"]["fault"] = "SPIKE"
                    self._log("WARN", "AI-0 · HYD-002", "Plausibility check FAILED on water_level: rate-of-change exceeds physical limit → data quality collapsed.")

                step(0, "node_ai", "HYD-002 water-level sensor reports an implausible spike", s0)
                step(4, "evidence", "Neighbor cross-check disagrees — HYD-001 / HYD-003 normal; sensor evidence down-weighted", lambda: self._log("INFO", "AI-1", "HYD-002 sensor weight reduced (quality × freshness). Neighbor nodes contradict the reading."))
                step(7, "quorum", "Quorum: DOWN-WEIGHT / SUPPRESS — no false flood alert raised")
                step(9, "alert", "Maintenance ticket opened for sensor replacement", lambda: self._ticket("HYD-002", "Water-level sensor (A02YYUW) fault — implausible readings", "SENSOR_REPLACEMENT", "HIGH"))
            elif slug == "node-offline":
                def s0():
                    self.override["HYD-003"] = "OFFLINE"
                    self._log("WARN", "LoRaWAN", "HYD-003: no uplink — gateway GW-TEH-01 missed heartbeat.")

                step(0, "lorawan", "HYD-003 stops reporting", s0)
                step(4, "evidence", "Freshness decays; HYD-003 excluded from neighbor evidence", lambda: self._log("INFO", "AI-1", "HYD-003 evidence weight → 0 (freshness). Regional coverage reduced."))

                def s6():
                    self._ticket("HYD-003", "Node offline — no LoRaWAN heartbeat", "CONNECTIVITY", "URGENT")
                    self._notify("warn", "HYD-003 offline", "Node not reporting.", "/nodes/HYD-003")

                step(6, "alert", "Connectivity ticket opened", s6)
            elif slug == "backhaul-outage":
                def s0():
                    next(g for g in self.gateways if g["id"] == "GW-HRD-01")["uplink_ok"] = False
                    self._log("WARN", "BACKHAUL", "GW-HRD-01 uplink DOWN. Edge inference continues; telemetry buffering locally.")
                    self._notify("warn", "Backhaul outage", "GW-HRD-01 uplink down — local response unaffected.")

                step(0, "dissemination", "GW-HRD-01 uplink fails — edge keeps operating", s0)
                step(3, "alert", "Cloud channels (SMS, voice, CAP/SACHET) queue; local siren path stays live", lambda: self._log("INFO", "AI-2", "Regional analytics stale for nodes behind GW-HRD-01."))
            elif slug == "maintenance-event":
                tid = {"v": ""}

                def s0():
                    self.override["AIR-001"] = "MAINTENANCE_REQUIRED"
                    for t in ("pm25", "pm10"):
                        self.nodes["AIR-001"]["sensors"][t]["health"] = "CALIBRATION_REQUIRED"
                    tid["v"] = self._ticket("AIR-001", "SPS30 drift beyond tolerance — pod replacement + calibration", "SENSOR_REPLACEMENT", "HIGH", assigned="Municipal ULB steward (demo)")

                adv = lambda: self.advance(tid["v"], "Local steward (demo)")  # noqa: E731
                step(0, "node_ai", "AIR-001 pod degradation detected — ticket opened", s0)
                step(4, "alert", "Steward assigned", adv)
                step(9, "dissemination", "Field service — replaceable sensor pod swapped", adv)
                step(14, "risk", "Self-test + calibration", adv)
                step(18, "sensing", "Node back online", adv)
            else:
                raise KeyError(slug)
            self.run = {"kind": self.KINDS[slug], "started_at": self.now, "steps": S}
            self._log("INFO", "SCENARIO", f"{self.LABELS[slug]} started (SIMULATED).")
            self._step_scenario()
            return [s["label"] for s in S]

    # ------------------------------------------------------------ maintenance / alerts
    def _ticket(self, node: str, issue: str, cat: str, prio: str, by: str = "ECO-SHIELD AI-0", assigned: str = "Unassigned") -> str:
        tid = f"MT-{self.seq['tkt']}"
        self.seq["tkt"] += 1
        self.tickets.insert(0, {"ticket_id": tid, "node_id": node, "issue": issue, "category": cat, "priority": prio, "assigned_to": assigned, "status": "OPEN", "created_at": self.now, "service_history": [{"at": self.now, "action": "Ticket created", "by": by}]})
        self._log("WARN", "MAINTENANCE", f"Ticket {tid} opened for {node}: {issue}")
        self._notify("warn", f"Maintenance ticket {tid}", f"{node} — {issue}", "/maintenance")
        return tid

    def create_ticket(self, node: str, issue: str, cat: str, prio: str, by: str) -> dict:
        with self.lock:
            if node not in self.nodes:
                raise KeyError(node)
            self.now = now_ms()
            self._ticket(node, issue, cat, prio, by)
            return self.tickets[0]

    def advance(self, tid: str, by: str) -> bool:
        with self.lock:
            t = next((x for x in self.tickets if x["ticket_id"] == tid), None)
            if not t or t["status"] == "RESOLVED":
                return False
            nxt = ORDER[ORDER.index(t["status"]) + 1]
            if nxt == "RESOLVED":
                return self.resolve(tid, by)
            t["status"] = nxt
            if nxt == "ASSIGNED" and t["assigned_to"] == "Unassigned":
                t["assigned_to"] = "Local steward (demo)"
            label = dict(TICKET_FLOW)[nxt]
            t["service_history"].append({"at": self.now, "action": label, "by": by})
            self._log("INFO", "MAINTENANCE", f"{tid}: {label}")
            return True

    def resolve(self, tid: str, by: str) -> bool:
        with self.lock:
            t = next((x for x in self.tickets if x["ticket_id"] == tid), None)
            if not t or t["status"] == "RESOLVED":
                return False
            self.now = now_ms()
            n = self.nodes.get(t["node_id"])
            today = iso(self.now)
            if n:
                cat = t["category"]
                if cat in ("SENSOR_REPLACEMENT", "CALIBRATION", "CLEANING", "OTHER"):
                    for s in n["sensors"].values():
                        if s["fault"]:
                            s["value"] = TH[s["type"]][0] + s["offset"]
                        s.update(fault=None, health="HEALTHY", quality=0.96)
                        if cat != "CLEANING":
                            s["cal"] = today
                    self.forcing.pop(n["id"], None)
                    if cat == "SENSOR_REPLACEMENT":
                        n["replacements"].append({"date": today, "reason": t["issue"], "by": by})
                if cat == "BATTERY":
                    n["battery"] = 100.0
                if cat == "SOLAR":
                    n["solar"] = 4.5
                    n["battery"] = max(n["battery"], 85.0)
                if cat == "CONNECTIVITY":
                    n["sig_base"] = -96
                self.override.pop(n["id"], None)
                n["maint"] = False
                n["last_service"] = today
                n["last_seen"] = self.now
            t["status"] = "RESOLVED"
            t["resolved_at"] = self.now
            t["service_history"].append({"at": self.now, "action": "Self-test passed · calibration recorded · node back online", "by": by})
            self._log("OK", "MAINTENANCE", f"{tid} resolved — {t['node_id']} back online after service.")
            self._notify("ok", f"{t['node_id']} back online", f"Ticket {tid} resolved.", "/maintenance")
            return True

    def set_maintenance_mode(self, node: str, on: bool, by: str) -> bool:
        with self.lock:
            n = self.nodes.get(node)
            if not n:
                return False
            n["maint"] = on
            if on:
                self.override[node] = "MAINTENANCE_REQUIRED"
            else:
                self.override.pop(node, None)
            self._log("INFO", "MAINTENANCE", f"{node} {'entered' if on else 'left'} maintenance mode ({by}) — node evidence {'excluded from fusion' if on else 'restored'}.")
            return True

    def acknowledge(self, iid: str, by: str) -> bool:
        with self.lock:
            inc = next((i for i in self.incidents if i["id"] == iid), None)
            if not inc or inc["status"] != "ACTIVE":
                return False
            self.now = now_ms()
            inc.update(status="ACKNOWLEDGED", state="ACKNOWLEDGED", acknowledged_at=self.now, acknowledged_by=by)
            inc["history"].append({"at": self.now, "state": "ACKNOWLEDGED", "note": f"Acknowledged by {by}"})
            self._log("INFO", "ALERT ENGINE", f"{iid} acknowledged by {by}")
            return True

    def mark_notifications_read(self) -> None:
        with self.lock:
            for n in self.notifications:
                n["read"] = True

    # ------------------------------------------------------------ views
    def _pod(self, n: dict) -> dict:
        hydro = n["pod"] == "HYDRO_FLOOD_POD"
        installed = iso(self.now - n["age"] * DAY)
        return {"id": f"POD-{n['id']}", "type": n["pod"], "name": "HYDRO / FLOOD POD" if hydro else "FIRE / AIR POD", "serial": f"{'HFP' if hydro else 'FAP'}-{n['id'][-3:]}-{(2400 + n['age']):X}", "installed_at": installed,
                "last_calibration": max((s["cal"] for s in n["sensors"].values()), default=installed), "health": 100 if n["replacements"] else 96,
                "replacement_history": ([{"date": iso(self.now - (n["age"] - 5) * DAY), "reason": "Scheduled pod swap — dust-clogged optical channel", "by": "Field Steward (demo)"}] if n["age"] > 200 else []) + n["replacements"]}

    def node_ui(self, n: dict) -> dict:
        hz = n["hazard"]
        f = self.fusion.get(n["id"], {})
        return {
            "id": n["id"], "code": f"NODE-{n['id']}", "type": n["pod"], "hazard": hz, "location": {"lat": n["lat"], "lon": n["lon"], "site": n["site"], "district": n["district"], "region": n["region"]},
            "gateway_id": n["gw"], "firmware_version": "iris-fw 0.9.3-demo",
            "model_version": {"FLOOD": "flood-xgb 0.4.2 · gru 0.3.1", "FIRE": "fire-xgb 0.4.0 · rtmdet 0.2.0", "AIR": "air-xgb 0.3.8"}[hz],
            "ai_profile": {"FLOOD": "AI-0: EWMA + CUSUM + TinyML", "FIRE": "AI-0: EWMA + CUSUM + smoke-slope TinyML", "AIR": "AI-0: EWMA + CUSUM + PM drift check"}[hz],
            "installed_at": iso(self.now - n["age"] * DAY), "last_service": n["last_service"], "battery": n["battery"], "solar": n["solar"], "signal": n["signal"], "snr": n["snr"], "storage": n["storage"], "last_seen": n["last_seen"],
            "health_status": n["health"], "risk_level": n["risk"], "risk_score": n["E"], "confidence": n["confidence"], "confidence_level": conf_level(n["confidence"]), "quorum": n["quorum"],
            "installed_pods": [self._pod(n)],
            "sensors": [{"id": s["id"], "node_id": n["id"], "type": s["type"], "label": s["label"], "model": s["model"], "unit": s["unit"], "health": s["health"], "calibration_date": s["cal"], "last_value": s["value"], "quality_score": s["quality"], "freshness": s["fresh"], "base_reliability": s["base"], "relevance": s["rel"], "weight": self.weight(s), "fault": s["fault"]} for s in n["sensors"].values()],
            "anomaly": n["anomaly"], "has_camera": n["cam"], "buffered_msgs": n["buffered"], "maintenance_mode": n["maint"], "simulated": True,
            "_fusion_ok": bool(f),
        }

    def snapshot(self, with_history: bool = True) -> dict:
        with self.lock:
            nodes = []
            for n in self.nodes.values():
                u = self.node_ui(n)
                u.pop("_fusion_ok")
                nodes.append(u)
            snap = {
                "now": self.now, "tick": self.tick_n, "nodes": nodes, "gateways": self.gateways, "fusion": self.fusion, "events": list(self.events), "incidents": self.incidents, "tickets": self.tickets,
                "log": list(self.log), "notifications": list(self.notifications), "external": self.external, "camera": self.camera, "pipeline": self.pipeline, "counters": self.counters, "system": self.system,
                "scenario": ({"kind": self.run["kind"], "started_at": self.run["started_at"], "steps": [{k: s[k] for k in ("at", "label", "stage", "done")} for s in self.run["steps"]]} if self.run else None),
                "riskTrend": list(self.risk_trend),
            }
            if with_history:
                snap["history"] = {nid: {m: [{"timestamp": t, "value": v} for t, v in pts] for m, pts in ms.items()} for nid, ms in self.history.items()}
            else:  # live delta: only the newest point per metric
                snap["history_tail"] = {nid: {m: {"timestamp": pts[-1][0], "value": pts[-1][1]} for m, pts in ms.items() if pts} for nid, ms in self.history.items()}
            return snap

    # ---- REST-model views (epoch ms; documented in docs/API.md) ----
    def node_view(self, n: dict) -> dict:
        u = self.node_ui(n)
        return {
            "id": u["id"], "type": u["type"], "location": u["location"], "gateway_id": u["gateway_id"], "firmware_version": u["firmware_version"], "model_version": u["model_version"],
            "battery": round(u["battery"], 2), "solar": round(u["solar"], 2), "signal": round(u["signal"], 1), "last_seen": u["last_seen"], "health_status": u["health_status"],
            "risk_level": u["risk_level"], "risk_score": round(u["risk_score"], 4), "confidence": round(u["confidence"], 3), "quorum": u["quorum"], "installed_pods": [u["type"]],
            "sensors": [{"id": s["id"], "node_id": s["node_id"], "type": s["type"], "model": s["model"], "unit": s["unit"], "health": s["health"], "calibration_date": s["calibration_date"], "last_value": round(s["last_value"], 3), "quality_score": round(s["quality_score"], 3), "freshness": round(s["freshness"], 3), "reliability_weight": round(s["weight"], 4)} for s in u["sensors"]],
            "simulated": True,
        }

    def incident_view(self, i: dict) -> dict:
        return i

    def maintenance_view(self, t: dict) -> dict:
        return t
