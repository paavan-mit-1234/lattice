// Simulation-based A/B for the scheduler. We cannot run a real multi-user A/B here, so we run
// synthetic learners under different scheduling policies and compare how fast their TRUE mastery
// rises. Honest framing: this measures the scheduler against a model of learning, not real humans.
//
// Learning model: a learner has hidden true mastery per KC. Practicing an item raises the true
// mastery of its KCs, but the gain is scaled by how ready the learner is (prerequisites mastered).
// So a policy that practices unready skills wastes effort. The tutor only observes pass/fail and
// updates a BKT estimate; the adaptive policy schedules from that estimate.

import { ITEMS, KCS, prereqsOf } from "../data/seed";
import { DEFAULT_PARAMS, bktUpdate, predictCorrect } from "./bkt";
import { pickNextItem, Mastery } from "./scheduler";

type Policy = "adaptive" | "fixed" | "random";

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const trueOverall = (m: Mastery) => KCS.reduce((a, k) => a + (m[k.slug] ?? 0), 0) / KCS.length;

function runPolicy(policy: Policy, steps: number, seed: number, sampleEvery: number): number[] {
  const r = rng(seed);
  const trueM: Mastery = {};
  const est: Mastery = {};
  for (const k of KCS) {
    trueM[k.slug] = 0.05;
    est[k.slug] = DEFAULT_PARAMS.pL0;
  }
  const lastSeen: Record<string, number> = {};
  const curve: number[] = [];
  let fixedIdx = 0;

  for (let s = 0; s < steps; s++) {
    let item;
    if (policy === "adaptive") item = pickNextItem(est, lastSeen, s * 60000);
    else if (policy === "fixed") item = ITEMS[fixedIdx++ % ITEMS.length];
    else item = ITEMS[Math.floor(r() * ITEMS.length)];

    const primary = item.kcs[0].slug;
    const correct = r() < predictCorrect(trueM[primary]);

    // deliberate-practice learning, scaled by readiness
    for (const kc of item.kcs) {
      const pre = prereqsOf(kc.slug);
      const ready = pre.length ? pre.reduce((a, x) => a + (trueM[x] ?? 0), 0) / pre.length : 1;
      const gain = 0.22 * kc.weight * ready * (1 - trueM[kc.slug]);
      trueM[kc.slug] = Math.min(1, trueM[kc.slug] + gain);
    }

    // tutor's observed estimate update
    if (correct) for (const kc of item.kcs) est[kc.slug] = bktUpdate(est[kc.slug], true, DEFAULT_PARAMS, kc.weight);
    else est[primary] = bktUpdate(est[primary], false, DEFAULT_PARAMS, 0.7);

    lastSeen[item.id] = s * 60000;
    if (s % sampleEvery === 0) curve.push(trueOverall(trueM));
  }
  curve.push(trueOverall(trueM));
  return curve;
}

export type ABResult = { xs: number[]; adaptive: number[]; fixed: number[]; random: number[] };

export function runAB(steps = 120, learners = 12, sampleEvery = 6): ABResult {
  const avg = (policy: Policy): number[] => {
    const runs = Array.from({ length: learners }, (_, i) => runPolicy(policy, steps, i * 1009 + 7, sampleEvery));
    const n = runs[0].length;
    return Array.from({ length: n }, (_, j) => runs.reduce((a, c) => a + c[j], 0) / learners);
  };
  const xs: number[] = [];
  for (let s = 0; s < steps; s += sampleEvery) xs.push(s);
  xs.push(steps);
  return { xs, adaptive: avg("adaptive"), fixed: avg("fixed"), random: avg("random") };
}
