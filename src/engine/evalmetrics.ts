// Offline evaluation metrics computed from logged interaction data.

import { CalibPoint, HistoryPoint } from "../store";
import { MASTERY_THRESHOLD } from "./bkt";

export type Bin = { lo: number; hi: number; meanPred: number; acc: number; n: number };

// Reliability diagram bins: group predictions into deciles, compare mean predicted P(correct)
// against the observed accuracy in each bin. A well-calibrated model sits on the diagonal.
export function reliabilityBins(calib: CalibPoint[], bins = 10): Bin[] {
  const buckets: CalibPoint[][] = Array.from({ length: bins }, () => []);
  for (const c of calib) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(c.pred * bins)));
    buckets[idx].push(c);
  }
  return buckets
    .map((b, i) => ({
      lo: i / bins,
      hi: (i + 1) / bins,
      meanPred: b.length ? b.reduce((a, c) => a + c.pred, 0) / b.length : 0,
      acc: b.length ? b.filter((c) => c.correct).length / b.length : 0,
      n: b.length,
    }))
    .filter((b) => b.n > 0);
}

// Expected Calibration Error: average gap between confidence and accuracy, weighted by bin size.
export function ece(calib: CalibPoint[]): number {
  const bins = reliabilityBins(calib);
  const total = calib.length || 1;
  return bins.reduce((a, b) => a + (b.n / total) * Math.abs(b.meanPred - b.acc), 0);
}

// Attempts a skill needed before its estimate first crossed the mastery threshold.
export function timeToMastery(history: HistoryPoint[]): { perSkill: { slug: string; attempts: number }[]; mean: number } {
  const order = [...history].sort((a, b) => a.ts - b.ts);
  const counts: Record<string, number> = {};
  const done: Record<string, number> = {};
  for (const h of order) {
    if (done[h.slug] != null) continue;
    counts[h.slug] = (counts[h.slug] || 0) + 1;
    if (h.p >= MASTERY_THRESHOLD) done[h.slug] = counts[h.slug];
  }
  const perSkill = Object.entries(done).map(([slug, attempts]) => ({ slug, attempts }));
  const mean = perSkill.length ? perSkill.reduce((a, s) => a + s.attempts, 0) / perSkill.length : 0;
  return { perSkill, mean };
}
