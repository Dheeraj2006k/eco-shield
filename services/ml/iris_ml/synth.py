"""Synthetic training data generator. Everything here is SIMULATED — no real field data is used."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import CLASSES, FEATURES, SIGMA, THRESHOLDS, norm


def _noise(rng: np.random.Generator, t: str, n: int) -> np.ndarray:
    return rng.normal(0, SIGMA[t] * 0.3, n)


def make_dataset(n_per_class: int = 1500, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[dict] = []

    def base_vec() -> dict[str, float]:
        return {t: THRESHOLDS[t][0] + rng.normal(0, SIGMA[t]) for t in THRESHOLDS}

    for label in CLASSES:
        for _ in range(n_per_class):
            v = base_vec()
            slope = {"water": rng.normal(0, 1.0), "pm25": rng.normal(0, 1.5), "smoke": rng.normal(0, 3.0)}
            intensity = rng.uniform(0.12, 1.0)  # includes weak events that overlap normal variation
            if label == "FLOOD":
                v["water_level"] += intensity * (THRESHOLDS["water_level"][2] - THRESHOLDS["water_level"][0]) * rng.uniform(0.7, 1.15)
                v["rainfall"] += intensity * 40 * rng.uniform(0.5, 1.1)
                slope["water"] = rng.uniform(2, 14) * intensity
            elif label == "FIRE":
                v["smoke"] += intensity * 600 * rng.uniform(0.6, 1.1)
                v["temperature"] += intensity * 28 * rng.uniform(0.5, 1.1)
                v["pm25"] += intensity * 200 * rng.uniform(0.3, 1.0)
                v["humidity"] -= intensity * 35 * rng.uniform(0.3, 1.0)
                slope["smoke"] = rng.uniform(10, 60) * intensity
            elif label == "AIR":
                v["pm25"] += intensity * 220 * rng.uniform(0.6, 1.1)
                v["pm10"] += intensity * 360 * rng.uniform(0.6, 1.1)
                v["smoke"] += intensity * 30 * rng.uniform(0, 1)
                slope["pm25"] = rng.uniform(2, 15) * intensity
            elif label == "SENSOR_FAULT":
                # one sensor spikes to an implausible value while everything else stays at baseline
                t = rng.choice(["water_level", "pm25", "smoke"])
                v[t] = THRESHOLDS[t][2] * rng.uniform(1.1, 1.6)
                key = {"water_level": "water", "pm25": "pm25", "smoke": "smoke"}[t]
                slope[key] = rng.uniform(150, 400)  # physically implausible rate of change
            row = {f"{t}_n": norm(t, v[t]) for t in ("water_level", "rainfall", "temperature", "humidity", "pm25", "pm10", "smoke")}
            row.update({"water_slope": slope["water"], "pm25_slope": slope["pm25"], "smoke_slope": slope["smoke"], "label": label})
            rows.append(row)
    df = pd.DataFrame(rows)
    return df[FEATURES + ["label"]].sample(frac=1.0, random_state=seed).reset_index(drop=True)


def make_series_with_shift(n: int = 400, shift_at: int = 200, shift_sigma: float = 3.0, sigma: float = 1.0, seed: int = 1):
    rng = np.random.default_rng(seed)
    x = rng.normal(0, sigma, n)
    x[shift_at:] += shift_sigma * sigma
    return x
