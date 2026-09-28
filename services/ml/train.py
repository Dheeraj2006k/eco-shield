"""Train + validate the IRIS reference models on SYNTHETIC data and emit a model registry.

    python train.py                      # writes artifacts/registry.json (+ joblib artifacts)
    python train.py --web-out ../../apps/web/src/data/model-registry.json

Safety-critical models are never auto-deployed: every registry entry is written with
deployment "AWAITING APPROVAL" until a human approves it (see docs/ARCHITECTURE.md → Model lifecycle).
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import date
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

from iris_ml.config import CLASSES, FEATURES
from iris_ml.signal import Cusum
from iris_ml.synth import make_dataset, make_series_with_shift

try:
    from xgboost import XGBClassifier
except ImportError:  # pragma: no cover
    XGBClassifier = None

ART = Path(__file__).parent / "artifacts"


def train_isolation_forest(df):
    normal = df[df.label == "NORMAL"][FEATURES]
    train, holdout_normal = train_test_split(normal, test_size=0.25, random_state=3)
    model = IsolationForest(n_estimators=200, contamination="auto", random_state=3).fit(train)
    anomalies = df[df.label != "NORMAL"][FEATURES].sample(len(holdout_normal), random_state=3)
    X = np.vstack([holdout_normal.values, anomalies.values])
    y = np.r_[np.zeros(len(holdout_normal)), np.ones(len(anomalies))]
    score = -model.score_samples(X)
    auc = float(roc_auc_score(y, score))
    pred = (model.predict(X) == -1).astype(int)
    return model, {"roc_auc": round(auc, 3), "precision": round(float(precision_score(y, pred)), 3), "recall": round(float(recall_score(y, pred)), 3)}


def train_xgb(df):
    labels = {c: i for i, c in enumerate(CLASSES)}
    X = df[FEATURES].values
    y = df.label.map(labels).values
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=5, stratify=y)
    if XGBClassifier is None:
        return None, None
    model = XGBClassifier(n_estimators=120, max_depth=4, learning_rate=0.12, subsample=0.9, eval_metric="mlogloss", n_jobs=2)
    t0 = time.perf_counter()
    model.fit(Xtr, ytr)
    pred = model.predict(Xte)
    t1 = time.perf_counter()
    model.predict(Xte[:1])
    single = (time.perf_counter() - t1) * 1000
    return model, {
        "macro_f1": round(float(f1_score(yte, pred, average="macro")), 3),
        "macro_precision": round(float(precision_score(yte, pred, average="macro")), 3),
        "macro_recall": round(float(recall_score(yte, pred, average="macro")), 3),
        "latency_ms_single_cpu": round(single, 2),
        "fit_seconds": round(t1 - t0, 2),
    }


def eval_cusum():
    delays = []
    false_alarms = 0
    for seed in range(50):
        x = make_series_with_shift(seed=seed, shift_sigma=2.0)
        c = Cusum(mean=0.0, sigma=1.0, k=0.5, h=8.0)
        det = None
        for i, v in enumerate(x):
            if c.update(v):
                det = i
                break
        if det is None:
            continue
        if det < 200:
            false_alarms += 1
        else:
            delays.append(det - 200)
    return {"mean_detection_delay_samples": round(float(np.mean(delays)), 1) if delays else None, "false_alarm_rate": round(false_alarms / 50, 3)}


def train_gru():
    try:
        from iris_ml.gru import train
    except ImportError:  # pragma: no cover
        return None, None
    try:
        net, m = train()
    except ImportError:  # torch missing
        return None, None
    import torch

    torch.save(net.state_dict(), ART / "gru_escalation.pt")
    return net, m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--web-out", type=str, default=None)
    args = ap.parse_args()
    ART.mkdir(exist_ok=True)

    df = make_dataset()
    today = date.today().isoformat()
    models = []

    iso, iso_m = train_isolation_forest(df)
    joblib.dump(iso, ART / "iforest.joblib")
    models.append({"id": "iforest", "name": "Isolation Forest", "version": "0.3.1", "trained": today, "metrics": iso_m, "target": "Raspberry Pi 5 (CPU)", "status": "VALIDATED", "deployment": "AWAITING APPROVAL"})

    xgb, xgb_m = train_xgb(df)
    if xgb is not None:
        joblib.dump(xgb, ART / "xgb_hazard.joblib")
        models.append({"id": "xgb", "name": "XGBoost hazard classifier", "version": "0.4.2", "trained": today, "metrics": xgb_m, "target": "Raspberry Pi 5 (CPU)", "status": "VALIDATED", "deployment": "AWAITING APPROVAL"})

    cs = eval_cusum()
    models.append({"id": "cusum", "name": "CUSUM shift detector", "version": "1.0.0", "trained": today, "metrics": cs, "target": "ESP32-S3 (node)", "status": "VALIDATED", "deployment": "AWAITING APPROVAL"})
    models.append({"id": "ewma", "name": "EWMA / Kalman filter", "version": "1.0.0", "trained": today, "metrics": {"note": "deterministic filter — no training"}, "target": "ESP32-S3 (node)", "status": "VALIDATED", "deployment": "AWAITING APPROVAL"})
    gru, gru_m = train_gru()
    if gru is not None:
        models.append({"id": "gru", "name": "GRU temporal escalation", "version": "0.3.1", "trained": today, "metrics": gru_m, "target": "Raspberry Pi 5 / IQ-8275", "status": "VALIDATED", "deployment": "AWAITING APPROVAL"})
    else:
        models.append({"id": "gru", "name": "GRU temporal escalation", "version": "0.3.1", "trained": None, "metrics": {"note": "PyTorch not installed — staged, not trained"}, "target": "Raspberry Pi 5 / IQ-8275", "status": "STAGED", "deployment": "NOT DEPLOYED"})
    models.append({"id": "tinyml", "name": "TinyML node anomaly classifier", "version": "0.2.0", "trained": None, "metrics": {"note": "int8 export pending — see docs"}, "target": "ESP32-S3 (node)", "status": "STAGED", "deployment": "NOT DEPLOYED"})
    models.append({"id": "rtmdet", "name": "RTMDet (smoke / fire)", "version": "0.2.0", "trained": None, "metrics": {"note": "requires labelled fire/smoke imagery — not trained here"}, "target": "Pi 5 + AI HAT+ / IQ-8275", "status": "RESEARCH", "deployment": "NOT DEPLOYED"})
    models.append({"id": "mnv3", "name": "MobileNetV3-Small (verifier)", "version": "0.2.0", "trained": None, "metrics": {"note": "requires labelled imagery — not trained here"}, "target": "Pi 5 + AI HAT+ / IQ-8275", "status": "RESEARCH", "deployment": "NOT DEPLOYED"})

    registry = {
        "generated_by": "services/ml/train.py",
        "generated_on": today,
        "data_source": "SYNTHETIC — generated by iris_ml.synth; metrics do not describe real-world performance",
        "models": models,
    }
    out = json.dumps(registry, indent=2)
    (ART / "registry.json").write_text(out, encoding="utf-8")
    if args.web_out:
        Path(args.web_out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.web_out).write_text(out, encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
