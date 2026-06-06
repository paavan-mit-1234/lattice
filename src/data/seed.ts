// Frontend view of the generated content. Source of truth is tools/genbank.py, which
// executes reference solutions to compute expected outputs. Do not edit the JSON by hand;
// run `python tools/genbank.py` to regenerate.

import kcsData from "./kcs.json";
import edgesData from "./edges.json";
import bankData from "./bank.json";

export type KC = {
  slug: string;
  title: string;
  category: string;
  depth: number;
  blurb: string;
};

export type Edge = { from: string; to: string };

export type TestCase = {
  args: any[];
  expected: any;
  hidden: boolean;
};

export type Item = {
  id: string;
  title: string;
  category: string;
  difficulty: number;
  funcName: string;
  starter: string;
  prompt: string;
  solution?: string;
  kcs: { slug: string; weight: number }[];
  tests: TestCase[];
};

export const KCS: KC[] = kcsData as KC[];
export const EDGES: Edge[] = edgesData as Edge[];
export const ITEMS: Item[] = bankData as Item[];

export const CATEGORIES: string[] = Array.from(new Set(KCS.map((k) => k.category)));
export const MAX_DEPTH = Math.max(...KCS.map((k) => k.depth));

const _kc = new Map(KCS.map((k) => [k.slug, k]));
const _item = new Map(ITEMS.map((i) => [i.id, i]));

export const kcBySlug = (slug: string) => _kc.get(slug)!;
export const itemById = (id: string) => _item.get(id)!;
export const prereqsOf = (slug: string) => EDGES.filter((e) => e.to === slug).map((e) => e.from);

// First item whose primary KC is `slug`, else any item that exercises it.
export const itemForKc = (slug: string) =>
  ITEMS.find((i) => i.kcs[0].slug === slug) || ITEMS.find((i) => i.kcs.some((k) => k.slug === slug));
