"""Shared constants. Mirror of packages/config/src/index.ts (demo-configured, NOT calibrated field values)."""

THRESHOLDS = {
    # type: (baseline, warn, danger)
    "water_level": (140.0, 220.0, 300.0),
    "rainfall": (0.5, 15.0, 40.0),
    "temperature": (28.0, 42.0, 55.0),
    "humidity": (60.0, 30.0, 15.0),
    "pm25": (45.0, 120.0, 250.0),
    "pm10": (90.0, 250.0, 430.0),
    "smoke": (40.0, 250.0, 600.0),
}

SIGMA = {
    "water_level": 6.0,
    "rainfall": 1.5,
    "temperature": 1.5,
    "humidity": 4.0,
    "pm25": 8.0,
    "pm10": 15.0,
    "smoke": 12.0,
}

SEVERITY_THRESHOLDS = {"WATCH": 0.30, "HIGH": 0.55, "CRITICAL": 0.75}
ABNORMAL_EVIDENCE = 0.38

FEATURES = [
    "water_level_n",
    "rainfall_n",
    "temperature_n",
    "humidity_n",
    "pm25_n",
    "pm10_n",
    "smoke_n",
    "water_slope",
    "pm25_slope",
    "smoke_slope",
]

CLASSES = ["NORMAL", "FLOOD", "FIRE", "AIR", "SENSOR_FAULT"]


def norm(sensor_type: str, value: float) -> float:
    base, _, danger = THRESHOLDS[sensor_type]
    x = (value - base) / (danger - base)
    return max(0.0, min(1.0, x))


def severity_from_e(e: float) -> str:
    if e >= SEVERITY_THRESHOLDS["CRITICAL"]:
        return "CRITICAL"
    if e >= SEVERITY_THRESHOLDS["HIGH"]:
        return "HIGH"
    if e >= SEVERITY_THRESHOLDS["WATCH"]:
        return "WATCH"
    return "NORMAL"
