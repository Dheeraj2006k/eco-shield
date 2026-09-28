from iris_ml.fusion import Source, fuse
from iris_ml.signal import Cusum, Ewma, Kalman1D, plausibility_ok
from iris_ml.synth import make_series_with_shift


def test_single_source_is_suspicious_multi_source_confirmed():
    single = fuse([Source("sensor", 0.9, 0.8, quorum_eligible=True), Source("neighbor", 0.05, 0.8, quorum_eligible=True), Source("weather", 0.2, 0.5)], 0.95)
    assert single.quorum == "SUSPICIOUS" and single.severity == "WATCH"
    multi = fuse([Source("sensor", 0.9, 0.8, quorum_eligible=True), Source("neighbor", 0.85, 0.8, quorum_eligible=True)], 0.95)
    assert multi.quorum == "CONFIRMED" and multi.confidence > single.confidence


def test_faulty_sensor_is_suppressed():
    out = fuse([Source("sensor", 0.9, 0.05, quorum_eligible=True), Source("neighbor", 0.0, 0.8, quorum_eligible=True)], 0.4, sensor_bad_claim=True)
    assert out.quorum == "SUPPRESSED" and out.severity == "NORMAL"


def test_severity_and_confidence_are_independent():
    hi_sev_low_conf = fuse([Source("sensor", 1.0, 0.9, quorum_eligible=True), Source("neighbor", 1.0, 0.9, quorum_eligible=True)], 0.2)
    assert hi_sev_low_conf.severity == "CRITICAL" and hi_sev_low_conf.confidence < 0.7


def test_cusum_detects_persistent_shift():
    c = Cusum(mean=0.0, sigma=1.0, k=0.5, h=8.0)
    hits = [i for i, v in enumerate(make_series_with_shift(shift_sigma=2.0)) if c.update(v)]
    assert hits and hits[0] >= 190


def test_filters_and_plausibility():
    assert abs(Ewma(0.5).update(10) - 10) < 1e-9
    k = Kalman1D()
    k.update(0)
    assert 0 < k.update(10) < 10
    assert not plausibility_ok(140, 445, 70)
