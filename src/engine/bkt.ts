// Bayesian Knowledge Tracing.
// Maintains P(mastered) per knowledge component, updated on each observation.
// This is the real, interpretable baseline model from the spec (Corbett & Anderson, 1994).

export type BktParams = {
  pL0: number; // prior P(known)
  pT: number; // P(transition: not-known -> known) after an opportunity
  pS: number; // P(slip: known but answers wrong)
  pG: number; // P(guess: not-known but answers right)
};

export const DEFAULT_PARAMS: BktParams = { pL0: 0.18, pT: 0.22, pS: 0.1, pG: 0.2 };

// Posterior P(known) after observing correctness, then apply the learning transition.
// `weight` in [0,1] scales how strongly this observation moves the estimate; used to
// down-weight low-confidence credit assignments.
export function bktUpdate(prior: number, correct: boolean, p: BktParams = DEFAULT_PARAMS, weight = 1): number {
  const clamped = Math.min(Math.max(prior, 1e-4), 1 - 1e-4);
  let cond: number;
  if (correct) {
    cond = (clamped * (1 - p.pS)) / (clamped * (1 - p.pS) + (1 - clamped) * p.pG);
  } else {
    cond = (clamped * p.pS) / (clamped * p.pS + (1 - clamped) * (1 - p.pG));
  }
  const posterior = cond + (1 - cond) * p.pT;
  // Blend between the prior (no update) and the full posterior by weight.
  return clamped + (posterior - clamped) * weight;
}

// Probability this learner answers a fresh item correctly given current mastery.
export function predictCorrect(mastery: number, p: BktParams = DEFAULT_PARAMS): number {
  return mastery * (1 - p.pS) + (1 - mastery) * p.pG;
}

export const MASTERY_THRESHOLD = 0.85;
