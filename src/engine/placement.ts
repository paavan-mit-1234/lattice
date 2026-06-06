// Adaptive placement. A short self-assessment that seeds the learner model so practice is
// useful from the first real problem instead of starting everyone at flat priors.
//
// It exploits the prerequisite DAG: confidence at a skill implies its prerequisites are likely
// known (propagate up); "no idea" at a skill implies its dependents are likely unknown
// (propagate down). Probes are chosen adaptively to maximize information: the unprobed skill
// whose current belief is most uncertain (closest to 0.5), preferring high-connectivity nodes.

import { KCS, EDGES, prereqsOf } from "../data/seed";

export type Answer = "confident" | "shaky" | "none";
export type Belief = Record<string, number>;

const dependents: Record<string, string[]> = {};
for (const e of EDGES) (dependents[e.from] ||= []).push(e.to);

function transitive(start: string, next: (s: string) => string[]): string[] {
  const seen = new Set<string>();
  const stack = [...next(start)];
  while (stack.length) {
    const s = stack.pop()!;
    if (seen.has(s)) continue;
    seen.add(s);
    for (const n of next(s)) stack.push(n);
  }
  return [...seen];
}

const degree = (slug: string) => prereqsOf(slug).length + (dependents[slug]?.length || 0);

export function initBelief(): Belief {
  const b: Belief = {};
  for (const k of KCS) b[k.slug] = 0.22;
  return b;
}

export function applyAnswer(belief: Belief, slug: string, ans: Answer): Belief {
  const b = { ...belief };
  if (ans === "confident") {
    b[slug] = 0.9;
    for (const a of transitive(slug, prereqsOf)) b[a] = Math.max(b[a], 0.8);
  } else if (ans === "shaky") {
    b[slug] = 0.5;
  } else {
    b[slug] = 0.08;
    for (const d of transitive(slug, (s) => dependents[s] || [])) b[d] = Math.min(b[d], 0.12);
  }
  return b;
}

export function nextProbe(belief: Belief, asked: Set<string>): string | null {
  const cand = KCS.filter((k) => !asked.has(k.slug));
  if (!cand.length) return null;
  cand.sort(
    (a, b) =>
      Math.abs(belief[a.slug] - 0.5) - Math.abs(belief[b.slug] - 0.5) ||
      degree(b.slug) - degree(a.slug)
  );
  return cand[0].slug;
}

export const PLACEMENT_PROBES = 10;
