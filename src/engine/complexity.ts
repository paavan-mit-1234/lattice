// Empirical complexity estimator. Runs the (Python) solution on inputs of growing size, times
// each, and fits the timing growth to a candidate Big-O. Honest framing: this is an EMPIRICAL
// estimate from measured wall-clock, not a proof. Execution happens in a disposable worker so a
// runaway solution is terminated on timeout rather than freezing the page.

import { Item } from "../data/seed";

export type ComplexityResult = {
  ok: boolean;
  message?: string;
  points: { n: number; ms: number }[];
  bigO?: string;
  r2?: number;
};

let worker: Worker | null = null;
function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL("../workers/pyworker.js", import.meta.url));
  return worker;
}
function killWorker() {
  if (worker) worker.terminate();
  worker = null;
}

function runSize(code: string, funcName: string, args: any[], timeoutMs: number): Promise<number> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const id = Math.random();
    const onMsg = (e: MessageEvent) => {
      const d = e.data as any;
      if (d.ready || d.id !== id) return;
      cleanup();
      d.error ? reject(new Error(d.error)) : resolve(d.ms);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      w.removeEventListener("message", onMsg);
    }
    w.addEventListener("message", onMsg);
    w.postMessage({ id, type: "time", code, funcName, args });
  });
}

const randInt = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const randChar = () => String.fromCharCode(97 + randInt(0, 25));

function templateHasArray(t: any[]) {
  return t.some((a) => Array.isArray(a));
}

function scaleArgs(template: any[], n: number): any[] {
  const hasArr = templateHasArray(template);
  return template.map((a) => {
    if (Array.isArray(a)) {
      if (a.length && Array.isArray(a[0])) {
        const s = Math.max(1, Math.floor(Math.sqrt(n)));
        return Array.from({ length: s }, () => Array.from({ length: s }, () => randInt(0, 1)));
      }
      if (a.length && typeof a[0] === "string") return Array.from({ length: n }, randChar);
      return Array.from({ length: n }, () => randInt(-100000, 100000));
    }
    if (typeof a === "number" && !hasArr) return n; // pure scalar problem -> scale it
    if (typeof a === "string" && !hasArr) return Array.from({ length: n }, randChar).join("");
    return a; // leave scalars (e.g. target) when arrays present
  });
}

const MODELS: { label: string; f: (n: number) => number }[] = [
  { label: "O(1)", f: () => 1 },
  { label: "O(log n)", f: (n) => Math.log2(n) },
  { label: "O(n)", f: (n) => n },
  { label: "O(n log n)", f: (n) => n * Math.log2(n) },
  { label: "O(n^2)", f: (n) => n * n },
];

function fit(points: { n: number; ms: number }[]) {
  const ys = points.map((p) => p.ms);
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0) || 1e-9;
  let best = { label: "O(n)", r2: -Infinity };
  for (const m of MODELS) {
    const xs = points.map((p) => m.f(p.n));
    const a = points.reduce((s, p, i) => s + p.ms / (xs[i] || 1e-9), 0) / points.length;
    const ssRes = points.reduce((s, p, i) => s + (p.ms - a * xs[i]) ** 2, 0);
    const r2 = 1 - ssRes / ssTot;
    if (r2 > best.r2) best = { label: m.label, r2 };
  }
  return best;
}

export async function estimateComplexity(item: Item, code: string): Promise<ComplexityResult> {
  const template = item.tests[0]?.args ?? [];
  if (template.length === 0) return { ok: false, message: "No test inputs to scale.", points: [] };

  const sizes = templateHasArray(template)
    ? [1000, 2000, 4000, 8000, 16000]
    : [2000, 4000, 8000, 16000, 32000];

  // Warmup: loads Pyodide in the worker (~5s first time) and runs the solution on the small sample
  // input. Long timeout absorbs the load; a trivial input finishes fast even for slow solutions.
  try {
    await runSize(code, item.funcName, template, 30000);
  } catch (err: any) {
    if (err.message === "timeout") {
      killWorker();
      return { ok: false, message: "Runtime failed to load, or the solution is stuck on the sample input.", points: [] };
    }
    return { ok: false, message: "Execution error: " + err.message, points: [] };
  }

  const points: { n: number; ms: number }[] = [];
  try {
    for (const n of sizes) {
      let ms: number;
      try {
        ms = await runSize(code, item.funcName, scaleArgs(template, n), 1600);
      } catch (err: any) {
        if (err.message === "timeout") {
          killWorker(); // worker is stuck; dispose it
          break;
        }
        return { ok: false, message: "Execution error: " + err.message, points };
      }
      points.push({ n, ms });
      if (ms > 450) break; // enough signal; avoid pushing into huge inputs
    }
  } catch (e: any) {
    return { ok: false, message: String(e?.message || e), points };
  }

  if (points.length < 3)
    return {
      ok: false,
      message:
        points.length === 0
          ? "Solution was too slow even at the smallest size (likely exponential or stuck)."
          : "Not enough data points to estimate (solution slowed down quickly).",
      points,
    };

  const { label, r2 } = fit(points);
  return { ok: true, bigO: label, r2, points };
}
