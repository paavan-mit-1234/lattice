import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ITEMS, KCS, Item, itemById } from "./data/seed";
import { DEFAULT_PARAMS, bktUpdate, predictCorrect } from "./engine/bkt";
import { pickNextItem, Mastery } from "./engine/scheduler";
import { Diagnosis } from "./engine/diagnose";
import { GradeResult } from "./engine/grader";

export type View = "lattice" | "problems" | "practice" | "review" | "instruments" | "placement";
export type CodeLang = "python" | "c" | "cpp" | "java";

export type AttemptLog = {
  itemId: string;
  ts: number;
  verdict: GradeResult["verdict"];
  diagnosedKc: string | null;
};

export type HistoryPoint = { slug: string; p: number; ts: number; correct: boolean };
export type Submission = {
  code: string;
  lang: CodeLang;
  verdict: GradeResult["verdict"];
  passed: number;
  total: number;
  ts: number;
  runtimeMs: number;
};
// Calibration: predicted P(correct) BEFORE the attempt vs the actual outcome.
export type CalibPoint = { pred: number; correct: boolean; slug: string };

export type LlmProvider = "anthropic" | "gemini" | "openai";
export type LlmConfig = { enabled: boolean; provider: LlmProvider; key: string; model: string; baseUrl: string };

type State = {
  mastery: Mastery;
  history: HistoryPoint[];
  calibration: CalibPoint[];
  lastSeen: Record<string, number>;
  attempts: AttemptLog[];
  solved: string[];
  streak: number;
  reviewDue: Record<string, number>; // slug -> due timestamp
  currentItemId: string | null;
  view: View;
  theme: "phosphor" | "blueprint";
  scanlines: boolean;
  sound: boolean;
  booted: boolean;
  placementDone: boolean;
  llm: LlmConfig;
  lang: CodeLang;
  submissions: Record<string, Submission[]>;

  init: () => void;
  setLang: (l: CodeLang) => void;
  recordSubmission: (itemId: string, sub: Submission) => void;
  setView: (v: View) => void;
  selectItem: (id: string) => void;
  nextItem: () => void;
  applyResult: (item: Item, grade: GradeResult, diag: Diagnosis | null) => void;
  setTheme: (t: "phosphor" | "blueprint") => void;
  toggleScanlines: () => void;
  toggleSound: () => void;
  setBooted: () => void;
  seedFromPlacement: (seed: Record<string, number>) => void;
  skipPlacement: () => void;
  setLlm: (partial: Partial<LlmConfig>) => void;
  reset: () => void;
};

const seedMastery = (): Mastery => {
  const m: Mastery = {};
  for (const k of KCS) m[k.slug] = DEFAULT_PARAMS.pL0;
  return m;
};

const REVIEW_INTERVAL = 1000 * 60 * 8; // 8 minutes for the demo

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      mastery: seedMastery(),
      history: [],
      calibration: [],
      lastSeen: {},
      attempts: [],
      solved: [],
      streak: 0,
      reviewDue: {},
      currentItemId: null,
      view: "lattice",
      theme: "phosphor",
      scanlines: true,
      sound: false,
      booted: false,
      placementDone: false,
      llm: { enabled: false, provider: "gemini", key: "", model: "gemini-2.0-flash", baseUrl: "" },
      lang: "python",
      submissions: {},

      init: () => {
        if (Object.keys(get().mastery).length === 0) set({ mastery: seedMastery() });
      },
      setLang: (l) => set({ lang: l }),
      recordSubmission: (itemId, sub) =>
        set({
          submissions: {
            ...get().submissions,
            [itemId]: [sub, ...(get().submissions[itemId] || [])].slice(0, 25),
          },
        }),

      setView: (v) => set({ view: v }),

      selectItem: (id) => set({ currentItemId: id, view: "practice" }),

      nextItem: () => {
        const { mastery, lastSeen } = get();
        const item = pickNextItem(mastery, lastSeen);
        set({ currentItemId: item.id, view: "practice" });
      },

      applyResult: (item, grade, diag) => {
        const m = { ...get().mastery };
        const history = [...get().history];
        const now = Date.now();
        const reviewDue = { ...get().reviewDue };

        // Calibration: prediction made from the PRIOR state, before this update.
        const primarySlug = item.kcs[0].slug;
        const prior = m[primarySlug] ?? DEFAULT_PARAMS.pL0;
        const calibration = [
          { pred: predictCorrect(prior), correct: grade.verdict === "pass", slug: primarySlug },
          ...get().calibration,
        ].slice(0, 500);

        if (grade.verdict === "pass") {
          for (const kc of item.kcs) {
            const before = m[kc.slug] ?? DEFAULT_PARAMS.pL0;
            m[kc.slug] = bktUpdate(before, true, DEFAULT_PARAMS, kc.weight);
            history.push({ slug: kc.slug, p: m[kc.slug], ts: now, correct: true });
            reviewDue[kc.slug] = now + REVIEW_INTERVAL;
          }
        } else {
          // Attribute failure to the diagnosed KC, weighted by confidence.
          const target = diag?.kcSlug;
          if (target) {
            const before = m[target] ?? DEFAULT_PARAMS.pL0;
            m[target] = bktUpdate(before, false, DEFAULT_PARAMS, diag!.confidence);
            history.push({ slug: target, p: m[target], ts: now, correct: false });
          }
        }

        const solved = new Set(get().solved);
        if (grade.verdict === "pass") solved.add(item.id);

        set({
          mastery: m,
          history,
          calibration,
          reviewDue,
          lastSeen: { ...get().lastSeen, [item.id]: now },
          attempts: [
            { itemId: item.id, ts: now, verdict: grade.verdict, diagnosedKc: diag?.kcSlug ?? null },
            ...get().attempts,
          ].slice(0, 200),
          solved: [...solved],
          streak: grade.verdict === "pass" ? get().streak + 1 : 0,
        });
      },

      setTheme: (t) => set({ theme: t }),
      toggleScanlines: () => set({ scanlines: !get().scanlines }),
      toggleSound: () => set({ sound: !get().sound }),
      setBooted: () => set({ booted: true }),
      seedFromPlacement: (seed) => {
        const m = { ...get().mastery };
        for (const [slug, p] of Object.entries(seed)) m[slug] = p;
        set({ mastery: m, placementDone: true, view: "lattice" });
      },
      skipPlacement: () => set({ placementDone: true, view: "lattice" }),
      setLlm: (partial) => set({ llm: { ...get().llm, ...partial } }),
      reset: () =>
        set({
          mastery: seedMastery(),
          history: [],
          calibration: [],
          lastSeen: {},
          attempts: [],
          solved: [],
          streak: 0,
          reviewDue: {},
          currentItemId: null,
          placementDone: false,
          view: "lattice",
        }),
    }),
    { name: "lattice-state-v3" }
  )
);

export const dueReviews = (reviewDue: Record<string, number>, now = Date.now()) =>
  Object.entries(reviewDue)
    .filter(([, t]) => t <= now)
    .map(([slug]) => slug);

export { ITEMS, KCS, itemById };
