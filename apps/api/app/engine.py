"""Server-side demo engine: simulated telemetry → AI-0 indicators → evidence fusion → quorum → incidents.

All data produced here is SIMULATED. Mirrors apps/web/src/lib/engine (TypeScript) so both surfaces tell the same story.
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

TH = {  # baseline, warn, danger (demo-configured)
    "water_level": (140.0, 220.0, 300.0, "cm"),
    "rainfall": (0.5, 15.0, 40.0, "mm/h"),
    "temperature": (28.0, 42.0, 55.0, "°C"),
    "humidity": (60.0, 30.0, 15.0, "%"),
    "pm25": (45.0, 120.0, 250.0, "µg/m³"),
    "pm10": (90.0, 250.0, 430.0, "µg/m³"),
    "smoke": (40.0, 250.0, 600.0, "idx"),
}
SIGMA = {"water_level": 6, "rainfall": 1.5, "temperature": 1.5, "humidity": 4, "pm25": 8, "pm10": 15, "smoke": 12}
NOISE = {"water_level": 1.1, "rainfall": 0.25, "temperature": 0.25, "humidity": 0.7, "pm25": 1.6, "pm10": 3, "smoke": 3}
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
    "FLOOD": {"WATCH": "Increase monitoring cadence; notify duty officer.", "HIGH": "Alert local authority; prepare downstream flood-prone areas.", "CRITICAL": "Notify downstream flood-prone areas and local authority."},
    "FIRE": {"WATCH": "Dispatch patrol to verify.", "HIGH": "Alert Forest Department control room.", "CRITICAL": "Notify Forest Department and nearby settlements."},
    "AIR": {"WATCH": "Publish advisory for sensitive groups.", "HIGH": "Issue health advisory; notify municipal authority.", "CRITICAL": "Issue severe-pollution alert; notify municipal and health authorities."},
}

SPECS = [
    # id, hazard, pod, district, region, lat, lon, gw, battery, signal
    ("HYD-001", "FLOOD", "HYDRO_FLOOD_POD", "Haridwar", "Upper Ganga Corridor", 29.955, 78.170, "GW-HRD-01", 92, -92),
    ("HYD-002", "FLOOD", "HYDRO_FLOOD_POD", "Dehradun", "Upper Ganga Corridor", 30.126, 78.325, "GW-HRD-01", 88, -98),
    ("HYD-003", "FLOOD", "HYDRO_FLOOD_POD", "Tehri Garhwal", "Upper Ganga Corridor", 30.146, 78.598, "GW-TEH-01", 81, -104),
    ("AIR-001", "AIR", "FIRE_AIR_POD", "Dehradun", "Doon Valley Airshed", 30.324, 78.042, "GW-DDN-01", 95, -84),
    ("AIR-002", "AIR", "FIRE_AIR_POD", "Dehradun", "Doon Valley Airshed", 30.288, 77.999, "GW-DDN-01", 90, -89),
    ("AIR-003", "AIR", "FIRE_AIR_POD", "Dehradun", "Doon Valley Airshed", 30.176, 78.116, "GW-DDN-01", 22, -109),
    ("FIR-001", "FIRE", "FIRE_AIR_POD", "Dehradun", "Rajaji–Mussoorie Forest Belt", 30.045, 78.180, "GW-DDN-01", 86, -101),
    ("FIR-002", "FIRE", "FIRE_AIR_POD", "Dehradun", "Rajaji–Mussoorie Forest Belt", 30.420, 78.090, "GW-DDN-01", 47, -106),
]
SENSORS_BY = {
    "HYDRO_FLOOD_POD": [("water_level", "DFRobot A02YYUW", 0.9, 1.0), ("rainfall", "DFRobot SEN0575", 0.85, 0.85), ("temperature", "SHT31", 0.9, 0.3), ("humidity", "SHT31", 0.9, 0.3)],
    "FIRE_AIR_POD": [("pm25", "Sensirion SPS30", 0.92, 1.0), ("pm10", "Sensirion SPS30", 0.92, 0.9), ("smoke", "MQ-2", 0.7, 0.6), ("temperature", "SHT31", 0.9, 0.5), ("humidity", "SHT31", 0.9, 0.5)],
}
GATEWAYS = {"GW-HRD-01": True, "GW-DDN-01": True, "GW-TEH-01": True}


def norm(t: str, v: float) -> float:
    b, _, d, _u = TH[t]
    return max(0.0, min(1.0, (v - b) / (d - b)))


def sev_from_e(e: float) -> str:
    return "CRITICAL" if e >= 0.75 else "HIGH" if e >= 0.55 else "WATCH" if e >= 0.30 else "NORMAL"


def conf_level(c: float) -> str:
    return "HIGH" if c >= 0.75 else "MEDIUM" if c >= 0.5 else "LOW"


def dist_km(a, b) -> float:
    r = 6371
    dl = math.radians(b["lat"] - a["lat"])
    dn = math.radians(b["lon"] - a["lon"])
    h = math.sin(dl / 2) ** 2 + math.cos(math.radians(a["lat"])) * math.cos(math.radians(b["lat"])) * math.sin(dn / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


class Engine:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.rand = random.Random(2026)
        self.reset_all()

    # ------------------------------------------------------------ setup
    def reset_all(self) -> None:
        now = time.time()
        self.tick_n = 0
        self.forcing: dict[str, dict[str, float]] = {}
        self.override: dict[str, str] = {}
        self.gateways = dict(GATEWAYS)
        self.pending: list[tuple[float, Callable[[], None]]] = []
        self.log: deque[dict] = deque(maxlen=200)
        self.new_log: list[dict] = []
        self.incidents: list[dict] = []
        self.events: deque[dict] = deque(maxlen=100)
        self.tickets: list[dict] = []
        self.clear_ticks: dict[str, int] = {}
        self.seq = {"inc": 1001, "evt": 1, "tkt": 1049}
        self.history: dict[str, dict[str, deque]] = {}
        self.fusion: dict[str, dict] = {}
        self.external = {"rainfall_forecast_mm": 4.0, "wind_kmh": 9.0, "humidity_pct": 58.0, "stagnation_index": 0.22}
        self.ext_target: dict[str, float] = {}
        self.camera = {"FIR-001": {"conf": 0.03, "target": 0.03}}
        self.nodes: dict[str, dict] = {}
        for (nid, hz, pod, dist, region, lat, lon, gw, bat, sig) in SPECS:
            sensors = {}
            for (t, model, base_rel, rel) in SENSORS_BY[pod]:
                sensors[t] = {"id": f"{nid}-{t}", "type": t, "model": model, "value": TH[t][0], "quality": 0.96, "fresh": 1.0, "base": base_rel, "rel": rel, "health": "HEALTHY", "fault": None, "cal": "2026-07-28"}
            self.nodes[nid] = {"id": nid, "pod": pod, "hazard": hz, "district": dist, "region": region, "lat": lat, "lon": lon, "gw": gw, "battery": float(bat), "sig_base": sig, "signal": float(sig), "solar": 3.2, "last_seen": now, "sensors": sensors, "anomaly": 0.0, "risk": "NORMAL", "E": 0.0, "confidence": 0.9, "quorum": "NONE", "health": "DEGRADED" if bat < 25 else "HEALTHY", "maint": False}
            self.history[nid] = {t: deque(maxlen=HISTORY) for t in sensors}
        self.tickets.append({"ticket_id": "MT-1048", "node_id": "AIR-003", "issue": "Battery below 25% — solar panel shading suspected", "category": "SOLAR", "priority": "HIGH", "assigned_to": "Steward (demo)", "status": "ASSIGNED", "created_at": now - 86400, "resolved_at": None, "service_history": [{"at": now - 86400, "action": "Ticket created", "by": "AI-0"}]})
        self._log("INFO", "SYSTEM", "Engine started — all telemetry is SIMULATED.")

    def _log(self, level: str, source: str, message: str) -> None:
        e = {"id": f"L{len(self.log) + self.tick_n}-{self.rand.randint(0, 9999)}", "at": time.time(), "level": level, "source": source, "message": message}
        self.log.appendleft(e)
        self.new_log.append(e)

    # ------------------------------------------------------------ physics + AI-0
    def _update_sensor(self, n: dict, s: dict, online: bool) -> None:
        t = s["type"]
        if not online:
            s["fresh"] = max(0.0, math.exp(-(time.time() - n["last_seen"]) / 40))
            return
        base = TH[t][0]
        target = self.forcing.get(n["id"], {}).get(t, base)
        prev = s["value"]
        if s["fault"] == "SPIKE":
            v = SPIKE[t] + self.rand.gauss(0, NOISE[t] * 0.3)
        else:
            rate = 0.3 if t in self.forcing.get(n["id"], {}) else 0.14
            v = prev + (target - prev) * rate + self.rand.gauss(0, NOISE[t])
        v = max(0.0, min(100.0, v)) if t == "humidity" else max(0.0, v)
        s["value"] = v
        qt = 0.1 if s["fault"] else (0.62 if s["health"] == "CALIBRATION_REQUIRED" else 0.96)
        s["quality"] = max(0.05, min(0.99, s["quality"] + (qt - s["quality"]) * 0.5))
        s["fresh"] = 1.0
        if s["fault"]:
            s["health"] = "FAULT"
        elif s["health"] != "CALIBRATION_REQUIRED":
            s["health"] = "FAULT" if s["quality"] < 0.3 else "QUESTIONABLE" if s["quality"] < 0.7 else "HEALTHY"

    @staticmethod
    def weight(s: dict) -> float:
        return s["base"] * s["quality"] * s["fresh"] * s["rel"]

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
        e = num / den if den > 0.001 else 0.0
        return e, (wsum / imp_sum if imp_sum else 0.0), bad, den > 0.001

    def _fuse(self, n: dict) -> dict:
        e_s, w_s, bad, avail = self._sensor_evidence(n)
        quality = sum(s["quality"] * s["rel"] for s in n["sensors"].values()) / sum(s["rel"] for s in n["sensors"].values())
        fault = any(s["health"] == "FAULT" for s in n["sensors"].values())
        items = [{"key": "sensor", "value": e_s, "weight": w_s, "available": avail, "abnormal": avail and e_s >= ABNORMAL and w_s >= 0.2, "detail": "local sensors"}]
        e_m = min(1.0, 0.6 * e_s + 0.4 * (0 if fault else n["anomaly"])) if avail else 0.0
        items.append({"key": "model", "value": e_m, "weight": 0.85 * quality if avail else 0.0, "available": avail, "abnormal": False, "detail": "AI-1 ensemble"})
        cam = self.camera.get(n["id"])
        if cam:
            up = n["health"] != "OFFLINE" and not n["maint"]
            items.append({"key": "camera", "value": cam["conf"] if up else 0.0, "weight": 0.9 if up else 0.0, "available": up, "abnormal": up and cam["conf"] >= 0.55, "detail": "RTMDet + MobileNetV3-Small"})
        nb_num = nb_den = nb_w = 0.0
        names = []
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
        items.append({"key": "neighbor", "value": e_nb, "weight": w_nb, "available": nb_ok, "abnormal": nb_ok and e_nb >= ABNORMAL and w_nb >= 0.2, "detail": ", ".join(names) or "none"})
        x = self.external
        wx = {"FLOOD": min(1.0, x["rainfall_forecast_mm"] / 60), "FIRE": min(1.0, 0.55 * max(0, (45 - x["humidity_pct"]) / 30) + 0.45 * max(0, (x["wind_kmh"] - 8) / 30)), "AIR": min(1.0, x["stagnation_index"])}[n["hazard"]]
        items.append({"key": "weather", "value": wx, "weight": 0.5, "available": True, "abnormal": False, "detail": "external context (simulated)"})
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
            conf = min(0.97, 0.5 + 0.15 * (len(abn) - 2) + 0.28 * quality)
        elif quorum == "SUSPICIOUS":
            conf = min(0.45, 0.22 + 0.12 * quality)
        elif quorum == "SUPPRESSED":
            conf = 0.18
        else:
            conf = min(0.95, 0.85 * quality)
        return {"node_id": n["id"], "E": E, "evidence": items, "quorum": quorum, "severity": sev, "confidence": conf, "quality": quality}

    # ------------------------------------------------------------ tick
    def tick(self) -> None:
        with self.lock:
            now = time.time()
            self.tick_n += 1
            due = [p for p in self.pending if p[0] <= now]
            self.pending = [p for p in self.pending if p[0] > now]
            for _, fn in due:
                fn()
            for k, base in (("rainfall_forecast_mm", 4.0), ("wind_kmh", 9.0), ("humidity_pct", 58.0), ("stagnation_index", 0.22)):
                self.external[k] += (self.ext_target.get(k, base) - self.external[k]) * 0.12
            for c in self.camera.values():
                c["conf"] = max(0.01, min(0.99, c["conf"] + (c["target"] - c["conf"]) * 0.25))
            for n in self.nodes.values():
                offline = self.override.get(n["id"]) == "OFFLINE"
                for s in n["sensors"].values():
                    self._update_sensor(n, s, not offline)
                if not offline:
                    n["last_seen"] = now
                    n["battery"] = max(0.0, n["battery"] - 0.0025)
                    n["solar"] = max(0.0, 3.4 + math.sin(self.tick_n / 30) * 1.6)
                    n["signal"] = n["sig_base"] + self.rand.gauss(0, 1.4)
                p = n["sensors"][PRIMARY[n["hazard"]]]
                z = (p["value"] - TH[p["type"]][0]) / SIGMA[p["type"]]
                n["anomaly"] = min(1.0, abs(z) / 10)  # AI-0 z-score component (CUSUM omitted server-side)
                ov = self.override.get(n["id"])
                n["health"] = ov or ("DEGRADED" if (n["battery"] < 25 or n["signal"] < -112 or any(s["health"] == "FAULT" for s in n["sensors"].values())) else "HEALTHY")
                for t, s in n["sensors"].items():
                    self.history[n["id"]][t].append((now, s["value"]))
            for n in self.nodes.values():
                f = self.fusion[n["id"]] = self._fuse(n)
                prev = n["quorum"]
                n["risk"], n["E"], n["confidence"], n["quorum"] = f["severity"], f["E"], f["confidence"], f["quorum"]
                if prev != f["quorum"] and f["quorum"] != "NONE":
                    self._log("ALERT" if f["quorum"] == "CONFIRMED" else "WARN", f"QUORUM · {n['id']}", f"{f['quorum']} · E={f['E']:.2f}")
            self._incidents(now)

    def _incidents(self, now: float) -> None:
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
            existing = next((i for i in self.incidents if i["key"] == key and i["status"] != "RESOLVED"), None)
            if existing is None:
                evt = self._event(primary, pf)
                self.incidents.insert(0, {"id": f"INC-{self.seq['inc']}", "key": key, "event_ids": [evt["id"]], "hazard": primary["hazard"], "severity": sev, "confidence": conf, "state": sev, "location": f"{primary['region']} · {primary['district']}", "status": "ACTIVE", "recommended_action": ACTIONS[primary["hazard"]][sev], "created_at": now, "resolved_at": None, "acknowledged_by": None, "node_ids": [x["id"] for x in nodes], "detections": 1, "duplicates_suppressed": 0})
                self.seq["inc"] += 1
                self._log("ALERT", "ALERT ENGINE", f"{self.incidents[0]['id']} created · {primary['hazard']} · {sev}")
                continue
            existing["detections"] += 1
            existing["confidence"] = conf
            existing["node_ids"] = sorted(set(existing["node_ids"]) | {x["id"] for x in nodes})
            if RANK[sev] > RANK[existing["severity"]]:
                existing.update(severity=sev, state=sev, status="ACTIVE", recommended_action=ACTIONS[primary["hazard"]][sev])
                existing["event_ids"].append(self._event(primary, pf)["id"])
                self._log("ALERT", "ALERT ENGINE", f"{existing['id']} ESCALATED to {sev}")
            else:
                existing["duplicates_suppressed"] += 1  # de-duplication: no second incident
        for inc in self.incidents:
            if inc["status"] == "RESOLVED" or inc["key"] in groups:
                continue
            self.clear_ticks[inc["key"]] = self.clear_ticks.get(inc["key"], 0) + 1
            if self.clear_ticks[inc["key"]] >= 6:
                inc.update(status="RESOLVED", state="RESOLVED", resolved_at=now)
                self._log("OK", "ALERT ENGINE", f"{inc['id']} auto-resolved")

    def _event(self, n: dict, f: dict) -> dict:
        e = {"id": f"EVT-{self.seq['evt']}", "node_id": n["id"], "hazard": n["hazard"], "timestamp": time.time(), "severity": f["severity"], "confidence": f["confidence"], "evidence": [{"key": i["key"], "value": i["value"], "weight": i["weight"], "contribution": i["contribution"], "abnormal": i["abnormal"], "available": i["available"], "detail": i["detail"]} for i in f["evidence"]], "sensor_health": {t: s["health"] for t, s in n["sensors"].items()}, "model_versions": {"edge": "demo-0.4.2"}}
        self.seq["evt"] += 1
        self.events.appendleft(e)
        return e

    # ------------------------------------------------------------ commands
    def force(self, node: str, t: str, v: float) -> None:
        self.forcing.setdefault(node, {})[t] = v

    def schedule(self, delay: float, fn: Callable[[], None]) -> None:
        self.pending.append((time.time() + delay, fn))

    def scenario(self, kind: str) -> list[str]:
        with self.lock:
            steps: list[str] = []
            f = self.force
            if kind == "normal":
                self.forcing.clear(); self.override.clear(); self.ext_target.clear(); self.pending.clear()
                for k in self.gateways: self.gateways[k] = True
                for c in self.camera.values(): c["target"] = 0.03
                for n in self.nodes.values():
                    n["maint"] = False
                    for s in n["sensors"].values():
                        if s["fault"]: s["value"] = TH[s["type"]][0]
                        s["fault"] = None
                        if s["health"] == "CALIBRATION_REQUIRED": s["health"] = "HEALTHY"
                steps = ["Returned to baseline"]
            elif kind == "flood":
                for k in [k for k in self.forcing if k.startswith("HYD")]: del self.forcing[k]
                self.ext_target["rainfall_forecast_mm"] = 52
                f("HYD-001", "rainfall", 34); f("HYD-002", "rainfall", 24); f("HYD-003", "rainfall", 9)
                self.schedule(3, lambda: f("HYD-001", "water_level", 305))
                self.schedule(8, lambda: f("HYD-002", "water_level", 290))
                self.schedule(14, lambda: (f("HYD-001", "water_level", 352), f("HYD-002", "water_level", 338), f("HYD-003", "water_level", 255)))
                self.schedule(20, lambda: f("HYD-003", "water_level", 325))
                steps = ["T+0 rainfall", "T+3 HYD-001 rising (suspicious)", "T+8 HYD-002 corroborates (confirmed)", "T+14 danger thresholds", "T+20 downstream propagation"]
            elif kind == "fire":
                self.ext_target.update(humidity_pct=24, wind_kmh=30)
                for t, v in (("smoke", 430), ("temperature", 48), ("pm25", 170), ("humidity", 20)): f("FIR-001", t, v)
                self.schedule(6, lambda: self.camera["FIR-001"].update(target=0.66))
                self.schedule(11, lambda: [f("FIR-002", "smoke", 320), f("FIR-002", "temperature", 43)])
                self.schedule(15, lambda: (self.camera["FIR-001"].update(target=0.92), f("FIR-001", "smoke", 660), f("FIR-001", "temperature", 57)))
                steps = ["T+0 smoke + heat", "T+6 camera suspects smoke", "T+11 FIR-002 corroborates", "T+15 camera confirms"]
            elif kind == "pollution":
                self.ext_target["stagnation_index"] = 0.9
                f("AIR-002", "pm25", 190); f("AIR-002", "pm10", 330)
                self.schedule(6, lambda: (f("AIR-001", "pm25", 200), f("AIR-001", "pm10", 340)))
                self.schedule(10, lambda: (f("AIR-003", "pm25", 175), f("AIR-003", "pm10", 305)))
                self.schedule(16, lambda: (f("AIR-001", "pm25", 265), f("AIR-002", "pm25", 280), f("AIR-003", "pm25", 235)))
                steps = ["T+0 AIR-002 rising", "T+6 AIR-001 corroborates", "T+10 AIR-003", "T+16 escalation"]
            elif kind == "sensor-failure":
                self.nodes["HYD-002"]["sensors"]["water_level"]["fault"] = "SPIKE"
                self._log("WARN", "AI-0 · HYD-002", "Plausibility check FAILED on water_level")
                self.schedule(9, lambda: self._ticket("HYD-002", "Water-level sensor fault — implausible readings", "SENSOR_REPLACEMENT", "HIGH"))
                steps = ["T+0 spike injected", "quorum → SUPPRESSED (neighbors disagree)", "T+9 ticket opened"]
            elif kind == "node-offline":
                self.override["HYD-003"] = "OFFLINE"
                self._log("WARN", "LoRaWAN", "HYD-003 no uplink")
                self.schedule(6, lambda: self._ticket("HYD-003", "Node offline — no LoRaWAN heartbeat", "CONNECTIVITY", "URGENT"))
                steps = ["T+0 offline", "T+6 ticket opened"]
            elif kind == "backhaul-outage":
                self.gateways["GW-HRD-01"] = False
                self._log("WARN", "BACKHAUL", "GW-HRD-01 uplink DOWN — edge continues; cloud channels queue")
                steps = ["GW-HRD-01 uplink down; local response unaffected"]
            elif kind == "restore-backhaul":
                for k in self.gateways: self.gateways[k] = True
                self._log("OK", "BACKHAUL", "Backhaul restored")
                steps = ["restored"]
            elif kind == "maintenance-event":
                tid = self._ticket("AIR-001", "SPS30 drift — pod replacement + calibration", "SENSOR_REPLACEMENT", "HIGH")
                self.override["AIR-001"] = "MAINTENANCE_REQUIRED"
                for t in ("pm25", "pm10"): self.nodes["AIR-001"]["sensors"][t]["health"] = "CALIBRATION_REQUIRED"
                for d, _ in ((4, 0), (9, 0), (14, 0), (18, 0)): self.schedule(d, lambda: self.advance(tid, "steward"))
                steps = ["ticket → assigned → field service → self-test → online"]
            return steps

    def _ticket(self, node: str, issue: str, cat: str, prio: str, by: str = "AI-0") -> str:
        tid = f"MT-{self.seq['tkt']}"
        self.seq["tkt"] += 1
        now = time.time()
        self.tickets.insert(0, {"ticket_id": tid, "node_id": node, "issue": issue, "category": cat, "priority": prio, "assigned_to": "Unassigned", "status": "OPEN", "created_at": now, "resolved_at": None, "service_history": [{"at": now, "action": "Ticket created", "by": by}]})
        self._log("WARN", "MAINTENANCE", f"{tid} opened for {node}: {issue}")
        return tid

    def create_ticket(self, node: str, issue: str, cat: str, prio: str, by: str) -> dict:
        with self.lock:
            if node not in self.nodes:
                raise KeyError(node)
            self._ticket(node, issue, cat, prio, by)
            return self.tickets[0]  # _ticket inserts at the head

    ORDER = ["OPEN", "ASSIGNED", "IN_FIELD", "SELF_TEST", "RESOLVED"]

    def advance(self, tid: str, by: str) -> bool:
        with self.lock:
            t = next((x for x in self.tickets if x["ticket_id"] == tid), None)
            if not t or t["status"] == "RESOLVED":
                return False
            nxt = self.ORDER[self.ORDER.index(t["status"]) + 1]
            if nxt == "RESOLVED":
                return self.resolve(tid, by)
            t["status"] = nxt
            if nxt == "ASSIGNED" and t["assigned_to"] == "Unassigned":
                t["assigned_to"] = "Local steward (demo)"
            t["service_history"].append({"at": time.time(), "action": nxt, "by": by})
            return True

    def resolve(self, tid: str, by: str) -> bool:
        with self.lock:
            t = next((x for x in self.tickets if x["ticket_id"] == tid), None)
            if not t or t["status"] == "RESOLVED":
                return False
            n = self.nodes.get(t["node_id"])
            if n:
                for s in n["sensors"].values():
                    if s["fault"]: s["value"] = TH[s["type"]][0]
                    s.update(fault=None, health="HEALTHY", quality=0.96)
                if t["category"] == "BATTERY": n["battery"] = 100.0
                self.override.pop(n["id"], None)
                self.forcing.pop(n["id"], None)
                n["maint"] = False
            t["status"] = "RESOLVED"
            t["resolved_at"] = time.time()
            t["service_history"].append({"at": time.time(), "action": "Self-test passed · node back online", "by": by})
            self._log("OK", "MAINTENANCE", f"{tid} resolved — {t['node_id']} back online")
            return True

    def acknowledge(self, iid: str, by: str) -> bool:
        with self.lock:
            inc = next((i for i in self.incidents if i["id"] == iid), None)
            if not inc or inc["status"] != "ACTIVE":
                return False
            inc.update(status="ACKNOWLEDGED", state="ACKNOWLEDGED", acknowledged_by=by)
            self._log("INFO", "ALERT ENGINE", f"{iid} acknowledged by {by}")
            return True

    # ------------------------------------------------------------ views
    def node_view(self, n: dict) -> dict:
        f = self.fusion.get(n["id"], {})
        return {
            "id": n["id"], "type": n["pod"], "location": {"lat": n["lat"], "lon": n["lon"], "district": n["district"], "region": n["region"]},
            "gateway_id": n["gw"], "firmware_version": "iris-fw 0.9.3-demo", "model_version": "demo-0.4.2", "battery": round(n["battery"], 2), "solar": round(n["solar"], 2), "signal": round(n["signal"], 1),
            "last_seen": n["last_seen"], "health_status": n["health"], "risk_level": n["risk"], "risk_score": round(n["E"], 4), "confidence": round(n["confidence"], 3), "quorum": n["quorum"], "installed_pods": [n["pod"]],
            "sensors": [{"id": s["id"], "node_id": n["id"], "type": s["type"], "model": s["model"], "unit": TH[s["type"]][3], "health": s["health"], "calibration_date": s["cal"], "last_value": round(s["value"], 3), "quality_score": round(s["quality"], 3), "freshness": round(s["fresh"], 3), "reliability_weight": round(self.weight(s), 4)} for s in n["sensors"].values()],
            "simulated": True,
        }

    def incident_view(self, i: dict) -> dict:
        return {**i, "confidence_level": conf_level(i["confidence"]), "simulated": True}

    def maintenance_view(self, t: dict) -> dict:
        return t
