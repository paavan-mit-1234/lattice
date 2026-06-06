"""
Offline Deep Knowledge Tracing (DKT) trainer.

A GRU over the learner's (skill, correct) interaction sequence predicts P(correct) for the next
skill (Piech et al. 2015). Trained here on synthetic learner sequences that match the JS learning
model in src/engine/modeleval.ts, then the weights are exported to src/data/dkt_weights.json for a
pure-TS forward pass in the browser (src/engine/dkt.ts). This is the "deep model behind the variant
switch" from the spec: training happens offline (a neural net is not meaningfully trainable in the
browser on one user); inference is cheap and runs client-side.

  python tools/train_dkt.py

Honest scope: the data is synthetic (a learning model), not real students, so this measures whether
a GRU can out-trace BKT/PFA on this generative process, not on humans.
"""

import json
import os
import random

import numpy as np
import torch
import torch.nn as nn

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "src", "data")

H = 32          # GRU hidden size
STEPS = 60      # interactions per synthetic learner
N_TRAIN = 400
N_VAL = 80
EPOCHS = 25
LR = 0.01
SEED = 7

# ----------------------------------------------------------------- data
bank = json.load(open(os.path.join(DATA, "bank.json")))
kcs = json.load(open(os.path.join(DATA, "kcs.json")))
edges = json.load(open(os.path.join(DATA, "edges.json")))

skills = sorted(k["slug"] for k in kcs)
K = len(skills)
idx = {s: i for i, s in enumerate(skills)}

prereqs = {}
for e in edges:
    prereqs.setdefault(e["to"], []).append(e["from"])

items = [{"primary": it["kcs"][0]["slug"], "kcs": it["kcs"]} for it in bank]


def predict_correct(m):
    return m * 0.9 + (1 - m) * 0.2  # matches predictCorrect with pS=0.1, pG=0.2


def gen_learner(rng):
    true_m = {s: 0.05 for s in skills}
    ev = []
    for _ in range(STEPS):
        it = items[rng.randrange(len(items))]
        primary = it["primary"]
        correct = 1 if rng.random() < predict_correct(true_m[primary]) else 0
        for kc in it["kcs"]:
            pre = prereqs.get(kc["slug"], [])
            ready = sum(true_m[x] for x in pre) / len(pre) if pre else 1.0
            g = 0.22 * kc["weight"] * ready * (1 - true_m[kc["slug"]])
            true_m[kc["slug"]] = min(1.0, true_m[kc["slug"]] + g)
        ev.append((idx[primary], correct))
    return ev


def build_tensors(n, seed0):
    X = np.zeros((n, STEPS, 2 * K), dtype=np.float32)
    S = np.zeros((n, STEPS), dtype=np.int64)
    Y = np.zeros((n, STEPS), dtype=np.float32)
    for i in range(n):
        rng = random.Random(seed0 + i * 7919)
        ev = gen_learner(rng)
        for t, (sk, c) in enumerate(ev):
            X[i, t, sk + c * K] = 1.0  # one-hot of (skill, correct)
            S[i, t] = sk
            Y[i, t] = c
    return torch.from_numpy(X), torch.from_numpy(S), torch.from_numpy(Y)


# ----------------------------------------------------------------- model
class DKT(nn.Module):
    def __init__(self):
        super().__init__()
        self.gru = nn.GRU(2 * K, H, batch_first=True)
        self.out = nn.Linear(H, K)

    def forward(self, x):
        o, _ = self.gru(x)                      # (N, T, H): hidden AFTER consuming x_t
        h0 = torch.zeros(o.size(0), 1, H)
        pred_h = torch.cat([h0, o[:, :-1, :]], dim=1)  # hidden BEFORE x_t -> predicts event t
        return self.out(pred_h)                 # (N, T, K) logits


def evaluate(model, X, S, Y):
    model.eval()
    with torch.no_grad():
        logits = model(X)
        sel = logits.gather(2, S.unsqueeze(-1)).squeeze(-1)  # (N, T)
        p = torch.sigmoid(sel)
        acc = ((p >= 0.5).float() == Y).float().mean().item()
        loss = nn.functional.binary_cross_entropy(p.clamp(1e-6, 1 - 1e-6), Y).item()
    return acc, loss


def main():
    torch.manual_seed(SEED)
    Xtr, Str, Ytr = build_tensors(N_TRAIN, 1000)
    Xva, Sva, Yva = build_tensors(N_VAL, 500000)

    model = DKT()
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    lossf = nn.BCEWithLogitsLoss()

    for ep in range(EPOCHS):
        model.train()
        opt.zero_grad()
        logits = model(Xtr)
        sel = logits.gather(2, Str.unsqueeze(-1)).squeeze(-1)
        loss = lossf(sel, Ytr)
        loss.backward()
        opt.step()
        if ep % 5 == 0 or ep == EPOCHS - 1:
            acc, vl = evaluate(model, Xva, Sva, Yva)
            print("epoch %2d  train_bce %.4f  val_bce %.4f  val_acc %.3f" % (ep, loss.item(), vl, acc))

    # baseline: predict the global positive rate
    base = Yva.mean().item()
    base_acc = max(base, 1 - base)
    print("majority-class val_acc baseline: %.3f" % base_acc)

    # ----------------------------------------------------------------- export
    sd = model.state_dict()

    def arr(t):
        return t.detach().cpu().numpy().tolist()

    weights = {
        "H": H,
        "K": K,
        "skills": skills,
        "weight_ih": arr(sd["gru.weight_ih_l0"]),  # (3H, 2K) order [r, z, n]
        "weight_hh": arr(sd["gru.weight_hh_l0"]),  # (3H, H)
        "bias_ih": arr(sd["gru.bias_ih_l0"]),      # (3H,)
        "bias_hh": arr(sd["gru.bias_hh_l0"]),      # (3H,)
        "out_w": arr(sd["out.weight"]),            # (K, H)
        "out_b": arr(sd["out.bias"]),              # (K,)
    }
    path = os.path.join(DATA, "dkt_weights.json")
    with open(path, "w") as f:
        json.dump(weights, f)
    size_kb = os.path.getsize(path) / 1024
    print("exported %s  (%.0f KB, H=%d, K=%d)" % (os.path.relpath(path, HERE), size_kb, H, K))


if __name__ == "__main__":
    main()
