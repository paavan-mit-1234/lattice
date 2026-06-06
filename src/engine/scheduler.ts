// Frontier-aware scheduler. Picks the next item to maximize expected learning:
// a knowledge component whose prerequisites are mastered but which is not yet mastered,
// with a per-learner predicted success in the "desirable difficulty" band.

import { ITEMS, KCS, prereqsOf, Item } from "../data/seed";
import { MASTERY_THRESHOLD, predictCorrect } from "./bkt";

export type Mastery = Record<string, number>;

export function prereqReadiness(slug: string, mastery: Mastery): number {
  const pre = prereqsOf(slug);
  if (pre.length === 0) return 1;
  return pre.reduce((a, s) => a + (mastery[s] ?? 0), 0) / pre.length;
}

// A KC is on the frontier if its prerequisites are largely mastered and it is not.
export function frontierSlugs(mastery: Mastery): string[] {
  return KCS.filter((k) => {
    const m = mastery[k.slug] ?? 0;
    return m < MASTERY_THRESHOLD && prereqReadiness(k.slug, mastery) >= 0.6;
  }).map((k) => k.slug);
}

const BAND_LO = 0.55;
const BAND_HI = 0.9;
const TARGET = 0.72;

// Score an item: prefer frontier primary-KC, prefer predicted success near the target band,
// lightly penalize recently-seen items.
export function pickNextItem(
  mastery: Mastery,
  lastSeen: Record<string, number>,
  now = Date.now()
): Item {
  const frontier = new Set(frontierSlugs(mastery));
  const ranked = ITEMS.map((item) => {
    const primary = item.kcs[0].slug;
    const m = mastery[primary] ?? 0;
    const pCorrect = predictCorrect(m);
    const onFrontier = frontier.has(primary) ? 1 : 0;
    const ready = prereqReadiness(primary, mastery);
    // distance from desirable difficulty, 0 best
    const bandPenalty =
      pCorrect < BAND_LO || pCorrect > BAND_HI ? Math.abs(pCorrect - TARGET) : Math.abs(pCorrect - TARGET) * 0.3;
    const recency = lastSeen[item.id] ? Math.max(0, 1 - (now - lastSeen[item.id]) / (1000 * 60 * 10)) : 0;
    const score = onFrontier * 1.5 + ready * 0.8 - bandPenalty * 1.2 - recency * 0.9;
    return { item, score };
  }).sort((a, b) => b.score - a.score);
  return ranked[0].item;
}

export function overallMastery(mastery: Mastery): number {
  const vals = KCS.map((k) => mastery[k.slug] ?? 0);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
