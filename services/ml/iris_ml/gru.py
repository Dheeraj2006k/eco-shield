"""GRU temporal-escalation model (AI-1): given the last T samples of a normalised primary sensor,
predict whether it will cross the danger level within the next H samples.

Trained on SYNTHETIC ramps only — metrics describe the synthetic task, not field performance.
"""

from __future__ import annotations

import numpy as np

T = 16  # history window
H = 10  # prediction horizon


def make_sequences(n: int = 4000, seed: int = 11):
    rng = np.random.default_rng(seed)
    X = np.zeros((n, T, 2), dtype=np.float32)  # [value_n, delta]
    y = np.zeros(n, dtype=np.float32)
    for i in range(n):
        total = T + H
        base = rng.uniform(0.0, 0.15)
        noise = rng.normal(0, 0.02, total)
        kind = rng.choice(["flat", "slow", "ramp", "spike_fault"], p=[0.35, 0.2, 0.3, 0.15])
        if kind == "flat":
            s = base + noise
        elif kind == "slow":
            s = base + np.linspace(0, rng.uniform(0.05, 0.35), total) + noise
        elif kind == "ramp":
            start = rng.integers(0, T)
            slope = rng.uniform(0.02, 0.09)
            s = base + np.clip(np.arange(total) - start, 0, None) * slope + noise
        else:  # implausible single spike: should NOT be classed as escalation
            s = base + noise
            s[rng.integers(4, T)] += rng.uniform(0.8, 1.5)
        s = np.clip(s, 0, 1.5)
        X[i, :, 0] = s[:T]
        X[i, 1:, 1] = np.diff(s[:T])
        y[i] = 1.0 if (s[T:].max() >= 1.0 and kind != "spike_fault") else 0.0
    return X, y


def train(epochs: int = 12, seed: int = 11):
    import torch
    from torch import nn
    from sklearn.metrics import f1_score, roc_auc_score
    from sklearn.model_selection import train_test_split

    torch.manual_seed(seed)
    X, y = make_sequences(seed=seed)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=seed, stratify=y)

    class Net(nn.Module):
        def __init__(self):
            super().__init__()
            self.gru = nn.GRU(2, 16, batch_first=True)
            self.head = nn.Linear(16, 1)

        def forward(self, x):
            out, _ = self.gru(x)
            return self.head(out[:, -1]).squeeze(-1)

    net = Net()
    opt = torch.optim.Adam(net.parameters(), lr=0.01)
    loss_fn = nn.BCEWithLogitsLoss()
    xt, yt = torch.tensor(Xtr), torch.tensor(ytr)
    for _ in range(epochs):
        perm = torch.randperm(len(xt))
        for i in range(0, len(xt), 128):
            idx = perm[i : i + 128]
            opt.zero_grad()
            loss = loss_fn(net(xt[idx]), yt[idx])
            loss.backward()
            opt.step()
    net.eval()
    with torch.no_grad():
        p = torch.sigmoid(net(torch.tensor(Xte))).numpy()
    return net, {
        "roc_auc": round(float(roc_auc_score(yte, p)), 3),
        "f1": round(float(f1_score(yte, p >= 0.5)), 3),
        "params": int(sum(q.numel() for q in net.parameters())),
    }
