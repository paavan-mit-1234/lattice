// Credit assignment (heuristic stand-in for the LLM layer in the full spec).
// Given a failed attempt, infer WHICH knowledge component broke, with confidence,
// cited evidence, and a fault line. Output shape matches the LLM JSON contract so a
// real model call can be swapped in without touching callers.

import { Item, prereqsOf } from "../data/seed";

export type Diagnosis = {
  kcSlug: string | null; // null === unattributed
  confidence: number; // 0..1
  evidence: string;
  faultLine: number | null;
  secondary: string[];
  conceptual: boolean;
  source?: "llm" | "heuristic";
};

export type FailContext = {
  item: Item;
  code: string;
  failedArgs: any[];
  expected: any;
  actual: any;
  error: string | null;
};

function findLine(code: string, pred: (l: string) => boolean): number | null {
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) if (pred(lines[i])) return i + 1;
  return null;
}

const isEmptyOrSingle = (a: any[]) =>
  a.some((x) => Array.isArray(x) && x.length <= 1) || a.some((x) => typeof x === "string" && x.length <= 1);

export function diagnose(ctx: FailContext): Diagnosis {
  const { item, code, error } = ctx;
  const candidates = new Set<string>();
  for (const k of item.kcs) {
    candidates.add(k.slug);
    for (const p of prereqsOf(k.slug)) candidates.add(p);
  }
  const primary = item.kcs[0].slug;
  const lc = code.toLowerCase();

  // No real implementation written.
  if (/\bpass\b/.test(code) && code.replace(/#.*$/gm, "").includes("pass") && !/\breturn\b/.test(code)) {
    return {
      kcSlug: null,
      confidence: 0.2,
      evidence: "No implementation detected. The body returns nothing, so no skill could be exercised.",
      faultLine: findLine(code, (l) => l.includes("pass")),
      secondary: [],
      conceptual: false,
    };
  }

  // Runtime error: localize by error class, attribute to primary with moderate confidence.
  if (error) {
    const ev =
      error.split("\n").filter(Boolean).slice(-1)[0] || "Runtime exception during execution.";
    return {
      kcSlug: primary,
      confidence: 0.45,
      evidence: `Execution raised: ${ev}. The control flow for ${item.kcs[0].slug} did not complete.`,
      faultLine: findLine(code, (l) => /\[|\bmid\b|\bwhile\b|\bfor\b/.test(l)),
      secondary: [],
      conceptual: false,
    };
  }

  // Skill-specific structural checks.
  if (candidates.has("sliding-window/shrink") && primary === "sliding-window/shrink") {
    const hasInnerWhile = /for[\s\S]*while/.test(code);
    if (!hasInnerWhile) {
      return {
        kcSlug: "sliding-window/shrink",
        confidence: 0.82,
        evidence:
          "The window only expands. There is no inner loop that contracts the window when the constraint is satisfied, so the minimal length is never found.",
        faultLine: findLine(code, (l) => /for\b/.test(l)),
        secondary: ["sliding-window/expand"],
        conceptual: true,
      };
    }
  }

  if (candidates.has("binary-search/boundary") && primary === "binary-search/boundary") {
    const strictLt = /while[^\n]*<[^=]/.test(code) && !/<=/.test(code);
    if (strictLt) {
      return {
        kcSlug: "binary-search/boundary",
        confidence: 0.78,
        evidence:
          "The loop condition uses `<` instead of `<=`, so the final single-element range is skipped. This misses targets at the boundary.",
        faultLine: findLine(code, (l) => /while/.test(l)),
        secondary: [],
        conceptual: true,
      };
    }
    if (isEmptyOrSingle(ctx.failedArgs)) {
      return {
        kcSlug: "binary-search/boundary",
        confidence: 0.6,
        evidence: "Failure occurs on a boundary-size input. The lo/hi update likely steps past the edge.",
        faultLine: findLine(code, (l) => /\bmid\b/.test(l)),
        secondary: [],
        conceptual: true,
      };
    }
  }

  if (candidates.has("two-pointers/convergent") && primary === "two-pointers/convergent") {
    if (!/while/.test(lc)) {
      return {
        kcSlug: "two-pointers/convergent",
        confidence: 0.7,
        evidence: "No convergent loop found. Two pointers should move inward until they cross.",
        faultLine: findLine(code, (l) => /def /.test(l)),
        secondary: [],
        conceptual: true,
      };
    }
  }

  if (candidates.has("hashing/frequency") && primary === "hashing/frequency") {
    if (!/\{\}|dict\(|\.get\(|in seen|in c\b/.test(lc)) {
      return {
        kcSlug: "hashing/frequency",
        confidence: 0.68,
        evidence: "No hash map is used. A linear scan cannot meet the lookup requirement; track seen values in a dict.",
        faultLine: findLine(code, (l) => /for /.test(l)),
        secondary: ["arrays/iterate"],
        conceptual: true,
      };
    }
  }

  if (candidates.has("stack/lifo") && primary === "stack/lifo") {
    if (!/append|pop/.test(lc)) {
      return {
        kcSlug: "stack/lifo",
        confidence: 0.66,
        evidence: "No stack operations (append/pop) detected. Matching brackets requires LIFO order.",
        faultLine: findLine(code, (l) => /for /.test(l)),
        secondary: [],
        conceptual: true,
      };
    }
  }

  // Edge-case-shaped failure with otherwise-structured code.
  if (isEmptyOrSingle(ctx.failedArgs)) {
    return {
      kcSlug: primary,
      confidence: 0.5,
      evidence: "The logic is close but fails on a boundary input. Check the smallest and empty cases.",
      faultLine: null,
      secondary: [],
      conceptual: false,
    };
  }

  // Could not localize to a single skill.
  return {
    kcSlug: null,
    confidence: 0.3,
    evidence:
      "Failure did not localize to a single skill. The result is wrong on a general case; the approach may be conceptually off.",
    faultLine: null,
    secondary: [primary],
    conceptual: true,
  };
}
