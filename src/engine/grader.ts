// Grader: executes submitted code in a Pyodide WEB WORKER and runs the item's tests. Running in a
// worker means a submission with an infinite loop is terminated on timeout (TLE) instead of freezing
// the tab. The browser/worker is the sandbox (no host, no network). In the full system this is a
// server-side isolated container; the per-test contract is identical.

import { Item } from "../data/seed";

export type TestResult = {
  hidden: boolean;
  passed: boolean;
  actual: string | null;
  error: string | null;
};

export type GradeResult = {
  verdict: "pass" | "fail" | "error";
  results: TestResult[];
  passedCount: number;
  totalCount: number;
  firstFailIndex: number | null;
  runtimeMs: number;
};

type Case = { args: any[]; expected: any; hidden: boolean };
const TIMEOUT_MS = 8000;

let worker: Worker | null = null;
let ready = false;
let readyPromise: Promise<void> | null = null;
const pending = new Map<number, { resolve: (m: any) => void; reject: (e: Error) => void }>();

function ensureWorker() {
  if (worker) return;
  worker = new Worker(new URL("../workers/pyworker.js", import.meta.url));
  let resolveReady: () => void;
  readyPromise = new Promise<void>((r) => (resolveReady = r));
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.ready) {
      ready = true;
      resolveReady();
      return;
    }
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      p.resolve(m);
    }
  };
}

function respawn() {
  if (worker) worker.terminate();
  worker = null;
  ready = false;
  for (const [, p] of pending) p.reject(new Error("worker terminated"));
  pending.clear();
  ensureWorker();
}

function request(msg: any, timeoutMs = TIMEOUT_MS): Promise<any> {
  ensureWorker();
  const rp = readyPromise!;
  const id = Math.random();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      respawn(); // worker is stuck; kill and restart
      reject(new Error("timeout"));
    }, timeoutMs);
    pending.set(id, {
      resolve: (m) => {
        clearTimeout(timer);
        resolve(m);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    rp.then(() => worker && worker.postMessage({ id, ...msg }));
  });
}

export function graderStatus(): "unloaded" | "loading" | "ready" {
  if (!worker) return "unloaded";
  return ready ? "ready" : "loading";
}

// Warm the worker (loads Pyodide). Resolves when ready.
export function initGrader(): Promise<void> {
  ensureWorker();
  return readyPromise!;
}

function tleResult(cases: Case[]): GradeResult {
  const results = cases.map((t) => ({ hidden: t.hidden, passed: false, actual: null, error: "Time Limit Exceeded (killed after 8s)" }));
  return { verdict: "error", results, passedCount: 0, totalCount: results.length, firstFailIndex: results.length ? 0 : null, runtimeMs: TIMEOUT_MS };
}

export async function grade(item: Item, code: string, cases: Case[] = item.tests): Promise<GradeResult> {
  const testsJSON = JSON.stringify(cases.map((t) => ({ args: t.args, expected: t.expected, hidden: t.hidden })));
  let m: any;
  try {
    m = await request({ type: "grade", code, funcName: item.funcName, testsJSON });
  } catch (e: any) {
    if (e.message === "timeout") return tleResult(cases);
    throw e;
  }
  if (m.error) throw new Error(m.error);
  const results: TestResult[] = JSON.parse(m.raw);
  const passedCount = results.filter((r) => r.passed).length;
  const anyError = results.some((r) => r.error);
  const firstFailIndex = results.findIndex((r) => !r.passed);
  return {
    verdict: passedCount === results.length ? "pass" : anyError ? "error" : "fail",
    results,
    passedCount,
    totalCount: results.length,
    firstFailIndex: firstFailIndex === -1 ? null : firstFailIndex,
    runtimeMs: m.runtimeMs ?? 0,
  };
}

export async function runCustom(item: Item, code: string, args: any[]): Promise<{ actual: string | null; error: string | null }> {
  let m: any;
  try {
    m = await request({ type: "custom", code, funcName: item.funcName, args });
  } catch (e: any) {
    if (e.message === "timeout") return { actual: null, error: "Time Limit Exceeded (killed after 8s)" };
    return { actual: null, error: String(e.message || e) };
  }
  if (m.error) return { actual: null, error: m.error };
  return JSON.parse(m.raw);
}
