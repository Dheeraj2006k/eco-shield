"""AI-0 signal-processing primitives that run on the node MCU (ESP32-S3) — reference implementations."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Ewma:
    """Exponentially weighted moving average."""

    alpha: float = 0.35
    value: float | None = None

    def update(self, x: float) -> float:
        self.value = x if self.value is None else self.value + self.alpha * (x - self.value)
        return self.value


@dataclass
class Kalman1D:
    """Scalar Kalman filter (random-walk process model)."""

    q: float = 0.05  # process noise
    r: float = 1.0  # measurement noise
    x: float | None = None
    p: float = 1.0

    def update(self, z: float) -> float:
        if self.x is None:
            self.x = z
            return z
        self.p += self.q
        k = self.p / (self.p + self.r)
        self.x += k * (z - self.x)
        self.p *= 1 - k
        return self.x


@dataclass
class Cusum:
    """Two-sided CUSUM persistent-shift detector on z-scores."""

    mean: float
    sigma: float
    k: float = 0.5  # slack
    h: float = 5.0  # decision threshold
    pos: float = 0.0
    neg: float = 0.0

    def update(self, x: float) -> bool:
        z = (x - self.mean) / self.sigma
        self.pos = max(0.0, self.pos + z - self.k)
        self.neg = max(0.0, self.neg - z - self.k)
        return self.pos > self.h or self.neg > self.h

    def reset(self) -> None:
        self.pos = self.neg = 0.0


def plausibility_ok(prev: float, cur: float, max_jump: float) -> bool:
    """Rate-of-change plausibility gate used to down-weight faulty sensors."""
    return abs(cur - prev) <= max_jump
