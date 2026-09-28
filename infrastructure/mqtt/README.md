# MQTT broker config

`passwd` is **not committed**. Create it locally:

```bash
docker run --rm -v "$PWD:/w" eclipse-mosquitto \
  sh -c 'mosquitto_passwd -b -c /w/passwd iris-api "$IRIS_MQTT_PASSWORD" && mosquitto_passwd -b /w/passwd iris-device "$DEVICE_PASSWORD"'
```

Topics: `iris/telemetry/<node_id>` (device → API), `iris/alerts/<region>` (API → subscribers).
