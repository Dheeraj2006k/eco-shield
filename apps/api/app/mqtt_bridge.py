"""Optional MQTT ingestion layer (LoRaWAN network server / gateway → broker → API).

Enable with IRIS_MQTT_ENABLED=true. Topic convention:  iris/telemetry/<node_id>
Payload (JSON):  {"sensor": "water_level", "value": 152.4}

Real device ingestion needs per-device identity (mTLS or signed payloads) — see docs/ARCHITECTURE.md.
In this demo build the values simply override the simulated sensor reading for that tick.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

log = logging.getLogger("iris.mqtt")


async def run_bridge(engine) -> None:
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        log.warning("paho-mqtt not installed — MQTT bridge disabled")
        return

    loop = asyncio.get_running_loop()
    host = os.environ.get("IRIS_MQTT_HOST", "localhost")
    port = int(os.environ.get("IRIS_MQTT_PORT", "1883"))

    def on_message(_c, _u, msg):
        try:
            node_id = msg.topic.split("/")[-1]
            p = json.loads(msg.payload)
            sensor, value = str(p["sensor"]), float(p["value"])
            with engine.lock:
                n = engine.nodes.get(node_id)
                if n and sensor in n["sensors"]:
                    engine.force(node_id, sensor, value)
        except Exception as exc:  # malformed payloads must never crash ingestion
            log.warning("bad MQTT payload on %s: %s", msg.topic, exc)

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    user, pw = os.environ.get("IRIS_MQTT_USER"), os.environ.get("IRIS_MQTT_PASSWORD")
    if user:
        client.username_pw_set(user, pw)
    client.on_message = on_message
    try:
        await loop.run_in_executor(None, client.connect, host, port, 30)
    except OSError as exc:
        log.warning("MQTT broker %s:%s unreachable: %s", host, port, exc)
        return
    client.subscribe("iris/telemetry/+")
    client.loop_start()
    log.info("MQTT bridge subscribed on %s:%s", host, port)
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        client.loop_stop()
