// Model bake-off: BKT vs PFA on simulated learners.
//
// BKT (Corbett & Anderson 1994) tracks a latent P(mastered) per skill via Bayesian updates.
// PFA (Pavlik et al. 2009) is the classic logistic-regression alternative: it predicts
//   P(correct) = sigmoid(beta_skill + gamma * priorSuccesses + rho * priorFailures)
// and is fit by gradient descent. Both are real knowledge-tracing models; this compares them on
// calibration (ECE) and accuracy over held-out simulated interaction sequences. Honest framing:
// the data is synthetic (a learning model), not real students. A neural DKT would be trained
// offline on many sequences and is a documented follow-up.

import { KCS, ITEMS, prereqsOf } from "../data/seed";
import { DEFAULT_PARAMS, bktUpdate, predictCorrect } from "./bkt";
import { evalDKT } from "./dkt";

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Event = { kc: string; correct: boolean };

// One synthetic learner: random practice over the bank, true mastery rising with readiness-scaled
// deliberate practice. Returns the observed (skill, correct) sequence.
function genLearner(seed: number, steps: number): Event[] {
  const r = rng(seed);
  const trueM: Record<string, number> = {};
  for (const k of KCS) trueM[k.slug] = 0.05;
  const events: Event[] = [];
  for (let s = 0; s < steps; s++) {
    const item = ITEMS[Math.floor(r() * ITEMS.length)];
    const primary = item.kcs[0].slug;
    const correct = r() < predictCorrect(trueM[primary]);
    for (const kc of item.kcs) {
      const pre = prereqsOf(kc.slug);
      const ready = pre.length ? pre.reduce((a, x) => a + (trueM[x] ?? 0), 0) / pre.length : 1;
      trueM[kc.slug] = Math.min(1, trueM[kc.slug] + 0.22 * kc.weight * ready * (1 - trueM[kc.slug]));
    }
    events.push({ kc: primary, correct });
  }
  return events;
}

function genSet(n: number, steps: number, seed0: number): Event[][] {
  return Array.from({ length: n }, (_, i) => genLearner(seed0 + i * 7919, steps));
}

type Pair = { pred: number; correct: boolean };

function evalBKT(set: Event[][]): Pair[] {
  const pairs: Pair[] = [];
  for (const seq of set) {
    const est: Record<string, number> = {};
    for (const e of seq) {
      const p = est[e.kc] ?? DEFAULT_PARAMS.pL0;
      pairs.push({ pred: predictCorrect(p), correct: e.correct });
      est[e.kc] = bktUpdate(p, e.correct, DEFAULT_PARAMS);
    }
  }
  return pairs;
}

type PFA = { beta: Record<string, number>; gamma: number; rho: number };

function fitPFA(set: Event[][], epochs = 8, lr = 0.05): PFA {
  const beta: Record<string, number> = {};
  for (const k of KCS) beta[k.slug] = 0;
  let gamma = 0.2;
  let rho = -0.2;
  // build rows with prior counts
  const rows: { kc: string; s: number; f: number; y: number }[] = [];
  for (const seq of set) {
    const succ: Record<string, number> = {};
    const fail: Record<string, number> = {};
    for (const e of seq) {
      const s = (succ[e.kc] ?? 0) / 5;
      const f = (fail[e.kc] ?? 0) / 5;
      rows.push({ kc: e.kc, s, f, y: e.correct ? 1 : 0 });
      if (e.correct) succ[e.kc] = (succ[e.kc] ?? 0) + 1;
      else fail[e.kc] = (fail[e.kc] ?? 0) + 1;
    }
  }
  for (let ep = 0; ep < epochs; ep++) {
    for (const row of rows) {
      const p = sigmoid(beta[row.kc] + gamma * row.s + rho * row.f);
      const g = p - row.y;
      beta[row.kc] -= lr * g;
      gamma -= lr * g * row.s;
      rho -= lr * g * row.f;
    }
  }
  return { beta, gamma, rho };
}

function evalPFA(set: Event[][], pfa: PFA): Pair[] {
  const pairs: Pair[] = [];
  for (const seq of set) {
    const succ: Record<string, number> = {};
    const fail: Record<string, number> = {};
    for (const e of seq) {
      const s = (succ[e.kc] ?? 0) / 5;
      const f = (fail[e.kc] ?? 0) / 5;
      pairs.push({ pred: sigmoid((pfa.beta[e.kc] ?? 0) + pfa.gamma * s + pfa.rho * f), correct: e.correct });
      if (e.correct) succ[e.kc] = (succ[e.kc] ?? 0) + 1;
      else fail[e.kc] = (fail[e.kc] ?? 0) + 1;
    }
  }
  return pairs;
}

export type ModelScore = { ece: number; acc: number; logloss: number; bins: { x: number; y: number; n: number }[] };

function score(pairs: Pair[]): ModelScore {
  const acc = pairs.filter((p) => (p.pred >= 0.5) === p.correct).length / pairs.length;
  const logloss =
    -pairs.reduce((a, p) => {
      const q = Math.min(1 - 1e-9, Math.max(1e-9, p.pred));
      return a + (p.correct ? Math.log(q) : Math.log(1 - q));
    }, 0) / pairs.length;
  const B = 10;
  const buckets: Pair[][] = Array.from({ length: B }, () => []);
  for (const p of pairs) buckets[Math.min(B - 1, Math.floor(p.pred * B))].push(p);
  let ece = 0;
  const bins = buckets
    .map((b) => {
      if (!b.length) return null;
      const mp = b.reduce((a, p) => a + p.pred, 0) / b.length;
      const ac = b.filter((p) => p.correct).length / b.length;
      ece += (b.length / pairs.length) * Math.abs(mp - ac);
      return { x: mp, y: ac, n: b.length };
    })
    .filter(Boolean) as { x: number; y: number; n: number }[];
  return { ece, acc, logloss, bins };
}

export type Bakeoff = { bkt: ModelScore; pfa: ModelScore; dkt: ModelScore; nTest: number };

export function runBakeoff(): Bakeoff {
  const train = genSet(80, 60, 12345);
  const test = genSet(40, 60, 99173);
  const pfa = fitPFA(train);
  const bktPairs = evalBKT(test);
  const pfaPairs = evalPFA(test, pfa);
  const dktPairs = evalDKT(test); // GRU trained offline; test learners are held out from training
  return { bkt: score(bktPairs), pfa: score(pfaPairs), dkt: score(dktPairs), nTest: bktPairs.length };
}
