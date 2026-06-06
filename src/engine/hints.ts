// Progressive hints: nudge toward the approach without revealing the solution.
// Authored per primary KC where it matters; generic fallback derived from the skill graph.

import { Item, kcBySlug, prereqsOf } from "../data/seed";

const BANK: Record<string, string[]> = {
  "hashing/lookup": [
    "A nested double loop is O(n squared). What structure answers 'have I already seen X?' in O(1)?",
    "Scan once, keeping a dict from value to index.",
    "For each x, check whether the complement you need is already in the dict before you insert x.",
  ],
  "sliding-window/shrink": [
    "A fixed window will not work; the answer size varies. Grow on the right, then shrink from the left.",
    "Expand the window until the constraint is met, then contract while it still holds, recording the best.",
    "You need an inner while-loop that advances the left pointer, not just the outer right pointer.",
  ],
  "binary-search/boundary": [
    "The array is sorted. Each comparison should let you discard half.",
    "Watch the loop bound: lo <= hi vs lo < hi changes whether the final element is checked.",
    "Update lo = mid + 1 and hi = mid - 1 carefully so the search space always shrinks.",
  ],
  "two-pointers/convergent": [
    "Sorting first lets two pointers move toward each other based on the running comparison.",
    "Start one pointer at each end; move the one that brings the sum closer to the target.",
    "When the pair matches, record it and move both inward, skipping duplicates.",
  ],
  "dp/1d-linear": [
    "Define the state: what does dp[i] mean in terms of the answer up to index i?",
    "Write the recurrence connecting dp[i] to dp[i-1] (and maybe dp[i-2]).",
    "Iterate from the base case forward; you usually only need the last one or two values.",
  ],
  "stack/lifo": [
    "Think about which structure naturally matches the most-recently-opened item.",
    "Push opening symbols; on a closing symbol, the top of the stack must be its match.",
    "At the end the stack must be empty for a valid sequence.",
  ],
  "graph/bfs": [
    "Shortest hops in an unweighted graph means breadth-first, not depth-first.",
    "Use a queue and a visited set; enqueue neighbors level by level.",
    "Mark a node visited when you enqueue it, not when you dequeue, to avoid duplicates.",
  ],
};

export function hintsFor(item: Item): string[] {
  const slug = item.kcs[0].slug;
  if (BANK[slug]) return BANK[slug];
  const kc = kcBySlug(slug);
  const pre = prereqsOf(slug);
  return [
    `This centers on ${kc.title.toLowerCase()}: ${kc.blurb}`,
    `Recall the canonical ${kc.category} pattern.${pre.length ? " It builds on " + pre.join(", ") + "." : ""}`,
    "Trace your code by hand on the first failing example; find the exact step where your output diverges.",
  ];
}
