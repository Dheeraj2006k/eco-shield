"""Reliability-weighted evidence fusion + quorum gating (Python mirror of apps/web/src/lib/engine/fusion.ts).

    E = Σ(wᵢ × eᵢ) / Σwᵢ          wᵢ = base_reliability × data_quality × freshness × relevance

Outputs are DEMO scores, not calibrated probabilities.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import ABNORMAL_EVIDENCE, severity_from_e


@dataclass
class Source:
    key: str  # sensor | model | camera | neighbor | weather
    value: float  # eᵢ in [0, 1]
    weight: float  # wᵢ
    available: bool = True
    quorum_eligible: bool = False

    @property
    def abnormal(self) -> bool:
        return self.available and self.value >= ABNORMAL_EVIDENCE and self.weight >= 0.2


@dataclass
class FusionOutput:
    E: float
    quorum: str
    severity: str
    confidence: float
    sources: list[Source] = field(default_factory=list)


def sensor_weight(base_reliability: float, quality: float, freshness: float, relevance: float) -> float:
    return base_reliability * quality * freshness * relevance


def fuse(sources: list[Source], data_quality: float, sensor_bad_claim: bool = False) -> FusionOutput:
    avail = [s for s in sources if s.available]
    sum_w = sum(s.weight for s in avail)
    e = sum(s.weight * s.value for s in avail) / sum_w if sum_w > 0 else 0.0

    eligible = [s for s in sources if s.quorum_eligible]
    abnormal = [s for s in eligible if s.abnormal]
    own_abnormal = any(s.abnormal for s in eligible if s.key in ("sensor", "camera"))

    if sensor_bad_claim:
        quorum = "SUPPRESSED"
    elif not own_abnormal:
        quorum = "NONE"
    elif len(abnormal) >= 2:
        quorum = "CONFIRMED"
    else:
        quorum = "SUSPICIOUS"

    severity = "NORMAL"
    if quorum == "CONFIRMED":
        severity = severity_from_e(e)
    elif quorum == "SUSPICIOUS":
        severity = "WATCH"

    if quorum == "CONFIRMED":
        conf = min(0.97, 0.5 + 0.15 * (len(abnormal) - 2) + 0.28 * data_quality)
    elif quorum == "SUSPICIOUS":
        conf = min(0.45, 0.22 + 0.12 * data_quality)
    elif quorum == "SUPPRESSED":
        conf = 0.18
    else:
        conf = min(0.95, 0.85 * data_quality)
    return FusionOutput(E=e, quorum=quorum, severity=severity, confidence=conf, sources=sources)
