"""Standalone telemetry simulator: publishes SIMULATED node readings to the MQTT broker.

    python simulator.py --host localhost --nodes HYD-001,HYD-002 --interval 2

Every payload carries "simulated": true so downstream systems can never mistake it for field data.
Credentials come from IRIS_MQTT_USER / IRIS_MQTT_PASSWORD (never hard-coded).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import time

BASE = {
    "HYD": {"water_level": 140.0, "rainfall": 0.5, "temperature": 28.0, "humidity": 60.0},
    "AIR": {"pm25": 45.0, "pm10": 90.0, "smoke": 40.0, "temperature": 28.0, "humidity": 60.0},
    "FIR": {"smoke": 40.0, "temperature": 28.0, "pm25": 45.0, "pm10": 90.0, "humidity": 60.0},
}
NOISE = {"water_level": 1.1, "rainfall": 0.25, "temperature": 0.25, "humidity": 0.7, "pm25": 1.6, "pm10": 3.0, "smoke": 3.0}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default=os.environ.get("IRIS_MQTT_HOST", "localhost"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("IRIS_MQTT_PORT", "1883")))
    ap.add_argument("--nodes", default="HYD-001,HYD-002,HYD-003,AIR-001,AIR-002,AIR-003,FIR-001,FIR-002")
    ap.add_argument("--interval", type=float, default=2.0)
    ap.add_argument("--dry-run", action="store_true", help="print payloads instead of publishing")
    args = ap.parse_args()

    client = None
    if not args.dry_run:
        import paho.mqtt.client as mqtt

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        if os.environ.get("IRIS_MQTT_USER"):
            client.username_pw_set(os.environ["IRIS_MQTT_USER"], os.environ.get("IRIS_MQTT_PASSWORD"))
        client.connect(args.host, args.port, 30)
        client.loop_start()

    nodes = [n.strip() for n in args.nodes.split(",") if n.strip()]
    t = 0
    while True:
        t += 1
        for node in nodes:
            for sensor, base in BASE[node[:3]].items():
                v = base + math.sin(t / 45) * NOISE[sensor] * 3 + random.gauss(0, NOISE[sensor])
                payload = json.dumps({"sensor": sensor, "value": round(max(0.0, v), 2), "simulated": True, "ts": time.time()})
                if client:
                    client.publish(f"iris/telemetry/{node}", payload, qos=0)
                else:
                    print(f"iris/telemetry/{node} {payload}")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
