import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { KCS, EDGES, ITEMS, CATEGORIES, kcBySlug, itemForKc } from "../data/seed";
import { frontierSlugs, prereqReadiness, overallMastery } from "../engine/scheduler";
import { MASTERY_THRESHOLD } from "../engine/bkt";

type Kind = "root" | "cat" | "kc";
type TNode = {
  id: string;
  kind: Kind;
  label: string;
  slug?: string;
  cat?: string;
  level: number;
  children: TNode[];
  x: number;
  y: number;
};

const X = [18, 210, 452];
const Y_STEP = 40;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const nodeW = (k: Kind) => (k === "root" ? 150 : k === "cat" ? 192 : 214);
const nodeH = (k: Kind) => (k === "root" ? 40 : k === "cat" ? 34 : 30);

// Build root -> categories -> skills, categories ordered foundational first.
function buildTree(): TNode {
  const cats = CATEGORIES.map((c) => {
    const kcs = KCS.filter((k) => k.category === c).sort((a, b) => a.depth - b.depth || a.slug.localeCompare(b.slug));
    return { c, kcs, minDepth: Math.min(...kcs.map((k) => k.depth)) };
  }).sort((a, b) => a.minDepth - b.minDepth || a.c.localeCompare(b.c));

  return {
    id: "root", kind: "root", label: "DSA", level: 0, x: 0, y: 0,
    children: cats.map(({ c, kcs }) => ({
      id: "cat:" + c, kind: "cat" as Kind, label: c, level: 1, x: 0, y: 0,
      children: kcs.map((k) => ({
        id: k.slug, kind: "kc" as Kind, label: k.title, slug: k.slug, cat: c, level: 2, x: 0, y: 0, children: [],
      })),
    })),
  };
}

function layout(root: TNode, expanded: Set<string>) {
  let cur = 0;
  const visibleKids = (n: TNode) =>
    n.kind === "kc" ? [] : n.kind === "cat" && !expanded.has(n.id) ? [] : n.children;
  const place = (n: TNode) => {
    n.x = X[n.level];
    const kids = visibleKids(n);
    if (kids.length === 0) {
      n.y = cur * Y_STEP;
      cur++;
    } else {
      kids.forEach(place);
      n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
    }
  };
  place(root);
  const nodes: TNode[] = [];
  const edges: [TNode, TNode][] = [];
  const walk = (n: TNode) => {
    nodes.push(n);
    visibleKids(n).forEach((c) => {
      edges.push([n, c]);
      walk(c);
    });
  };
  walk(root);
  return { nodes, edges, height: cur * Y_STEP, width: X[2] + nodeW("kc") + 20 };
}

export function Lattice() {
  const mastery = useStore((s) => s.mastery);
  const solved = useStore((s) => s.solved);
  const streak = useStore((s) => s.streak);
  const reviewDue = useStore((s) => s.reviewDue);
  const nextItem = useStore((s) => s.nextItem);
  const selectItem = useStore((s) => s.selectItem);
  const setView = useStore((s) => s.setView);

  const tree = useMemo(() => buildTree(), []);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["cat:Sliding Window"]));
  const [sel, setSel] = useState<string | null>("sliding-window/shrink");
  const [t, setT] = useState({ k: 1, x: 0, y: 0 });
  const [focus, setFocus] = useState<string | null>(null);
  const [animate, setAnimate] = useState(false);

  const vpRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const { nodes, edges } = useMemo(() => layout(tree, expanded), [tree, expanded]);
  const frontier = useMemo(() => new Set(frontierSlugs(mastery)), [mastery]);
  const overall = overallMastery(mastery);
  const now = Date.now();

  const catMastery = (n: TNode) => {
    const ks = n.children;
    if (!ks.length) return 0;
    return ks.reduce((s, c) => s + (mastery[c.slug!] ?? 0), 0) / ks.length;
  };

  // Center the bounding box of a set of visible nodes in the viewport.
  const frameNodes = (ns: TNode[], maxK = 1.4) => {
    const vp = vpRef.current;
    if (!vp || ns.length === 0) return;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of ns) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + nodeW(n.kind));
      maxY = Math.max(maxY, n.y + nodeH(n.kind));
    }
    const cw = maxX - minX, ch = maxY - minY;
    const k = clamp(Math.min((vw - 80) / cw, (vh - 80) / Math.max(ch, 1)), 0.3, maxK);
    setAnimate(true);
    setT({ k, x: (vw - cw * k) / 2 - minX * k, y: (vh - ch * k) / 2 - minY * k });
  };
  const fit = () => frameNodes(nodes);

  useLayoutEffect(() => { fit(); /* eslint-disable-next-line */ }, []);

  // When a category is expanded by click, zoom to frame it and its skills.
  useEffect(() => {
    if (!focus) return;
    if (focus === "__all__") {
      frameNodes(nodes);
    } else {
      const cat = nodes.find((n) => n.id === focus);
      if (cat) frameNodes([cat, ...cat.children], 1.25);
    }
    setFocus(null);
    // eslint-disable-next-line
  }, [nodes, focus]);

  // non-passive wheel zoom centered on cursor
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setAnimate(false);
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setT((prev) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const nk = clamp(prev.k * factor, 0.25, 2.6);
        const wx = (mx - prev.x) / prev.k, wy = (my - prev.y) / prev.k;
        return { k: nk, x: mx - wx * nk, y: my - wy * nk };
      });
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (f: number) => {
    const vp = vpRef.current!;
    const cx = vp.clientWidth / 2, cy = vp.clientHeight / 2;
    setAnimate(true);
    setT((p) => {
      const nk = clamp(p.k * f, 0.25, 2.6);
      const wx = (cx - p.x) / p.k, wy = (cy - p.y) / p.k;
      return { k: nk, x: cx - wx * nk, y: cy - wy * nk };
    });
  };

  const toggle = (id: string) => {
    const willExpand = !expanded.has(id);
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    setFocus(willExpand ? id : "__all__");
  };

  const selKc = sel ? kcBySlug(sel) : null;
  const selItem = sel ? itemForKc(sel) : null;

  return (
    <div className="lattice-wrap">
      <div className="panel">
        <div className="panel-head">
          <span className="panel-label"><span className="panel-idx">01</span> / KNOWLEDGE LATTICE</span>
          <span className="micro">{KCS.length} SKILLS · {CATEGORIES.length} CATEGORIES · SCROLL TO ZOOM · DRAG TO PAN</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div
            ref={vpRef}
            className="lattice-viewport"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              setAnimate(false);
              drag.current = { x: e.clientX, y: e.clientY, ox: t.x, oy: t.y };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              setT((p) => ({ ...p, x: drag.current!.ox + (e.clientX - drag.current!.x), y: drag.current!.oy + (e.clientY - drag.current!.y) }));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => (drag.current = null)}
          >
            <div className="zoom-controls">
              <button className="zbtn" onClick={() => zoomBy(1.2)} title="zoom in">+</button>
              <button className="zbtn" onClick={() => zoomBy(1 / 1.2)} title="zoom out">−</button>
              <button className="zbtn" onClick={fit} title="fit">⊡</button>
              <button className="zbtn wide" onClick={() => setExpanded(new Set(CATEGORIES.map((c) => "cat:" + c)))}>ALL</button>
              <button className="zbtn wide" onClick={() => setExpanded(new Set())}>NONE</button>
            </div>
            <svg className="lattice-svg" width="100%" height="100%">
              <g transform={`translate(${t.x},${t.y}) scale(${t.k})`} style={{ transition: animate ? "transform 260ms ease-out" : "none" }}>
                {edges.map(([a, b], i) => {
                  const x1 = a.x + nodeW(a.kind), y1 = a.y + nodeH(a.kind) / 2;
                  const x2 = b.x, y2 = b.y + nodeH(b.kind) / 2;
                  const mid = (x1 + x2) / 2;
                  const live = b.kind === "kc" && frontier.has(b.slug!);
                  return (
                    <path key={i} className={`edge ${live ? "live" : ""}`} fill="none"
                      d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                      opacity={live ? 0.85 : 0.4} />
                  );
                })}
                {nodes.map((n) => {
                  if (n.kind === "root") {
                    return (
                      <g key={n.id}>
                        <rect className="tn-root" x={n.x} y={n.y} width={nodeW("root")} height={nodeH("root")} />
                        <text className="tn-root-l" x={n.x + 14} y={n.y + 25}>DSA · {KCS.length}</text>
                      </g>
                    );
                  }
                  if (n.kind === "cat") {
                    const open = expanded.has(n.id);
                    const m = catMastery(n);
                    return (
                      <g key={n.id} style={{ cursor: "pointer" }} onClick={() => toggle(n.id)}>
                        <rect className={`tn-cat ${open ? "open" : ""}`} x={n.x} y={n.y} width={nodeW("cat")} height={nodeH("cat")} />
                        <rect className="tn-toggle" x={n.x + 6} y={n.y + 9} width={16} height={16} />
                        <text className="tn-toggle-l" x={n.x + 14} y={n.y + 21} textAnchor="middle">{open ? "−" : "+"}</text>
                        <text className="tn-cat-l" x={n.x + 30} y={n.y + 16}>{n.label}</text>
                        <text className="tn-cat-c" x={n.x + 30} y={n.y + 28}>{n.children.length} SKILLS</text>
                        <rect x={n.x + nodeW("cat") - 46} y={n.y + 22} width={40} height={4} fill="var(--line)" />
                        <rect x={n.x + nodeW("cat") - 46} y={n.y + 22} width={40 * m} height={4} fill="var(--amber)" />
                      </g>
                    );
                  }
                  const p = mastery[n.slug!] ?? 0;
                  const mastered = p >= MASTERY_THRESHOLD;
                  const onFront = frontier.has(n.slug!);
                  const due = reviewDue[n.slug!] && reviewDue[n.slug!] <= now;
                  const w = nodeW("kc"), h = nodeH("kc");
                  const stroke = onFront ? "var(--amber)" : mastered ? "var(--green)" : "var(--line)";
                  return (
                    <g key={n.id} style={{ cursor: "pointer" }} onClick={() => setSel(n.slug!)}>
                      <rect x={n.x} y={n.y} width={w} height={h} fill="var(--surface2)" stroke={stroke}
                        strokeWidth={onFront || mastered ? 1.6 : 1} />
                      <rect x={n.x + 1} y={n.y + 1} width={(w - 2) * Math.max(0, p)} height={h - 2}
                        fill={mastered ? "var(--green)" : "var(--amber)"} opacity={sel === n.slug ? 0.32 : 0.18} />
                      <text className="tn-kc-l" x={n.x + 8} y={n.y + 19}>{n.label}</text>
                      {due && <line x1={n.x} y1={n.y} x2={n.x + w} y2={n.y + h} stroke="var(--red)" strokeWidth={1} opacity={0.7} />}
                      {sel === n.slug && <rect x={n.x - 2} y={n.y - 2} width={w + 4} height={h + 4} fill="none" stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 2" />}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="stat-grid">
          <div className="stat">
            <div className="micro">OVERALL MASTERY</div>
            <div className="num amber glow">{(overall * 100).toFixed(0)}<span style={{ fontSize: 14 }}>%</span></div>
          </div>
          <div className="stat">
            <div className="micro">FRONTIER</div>
            <div className="num">{frontier.size}</div>
          </div>
          <div className="stat">
            <div className="micro">SOLVED</div>
            <div className="num green">{solved.length}<span className="dim" style={{ fontSize: 14 }}>/{ITEMS.length}</span></div>
          </div>
          <div className="stat">
            <div className="micro">STREAK</div>
            <div className="num">{streak}</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-label"><span className="panel-idx">02</span> / NODE</span>
            {selKc && <span className="tag on">{selKc.slug}</span>}
          </div>
          <div className="panel-body">
            {selKc ? (
              <div className="stack">
                <div>
                  <div style={{ fontFamily: "var(--grotesk)", fontWeight: 700, fontSize: 18 }}>{selKc.title}</div>
                  <div className="row" style={{ marginTop: 4 }}>
                    <span className="tag">{selKc.category}</span>
                    <span className="tag">L{selKc.depth}</span>
                  </div>
                  <div className="dim" style={{ marginTop: 8 }}>{selKc.blurb}</div>
                </div>
                <div>
                  <div className="spread">
                    <span className="micro">P(MASTERED)</span>
                    <span className="amber" style={{ fontVariantNumeric: "tabular-nums" }}>{(mastery[selKc.slug] ?? 0).toFixed(3)}</span>
                  </div>
                  <div className="gauge mt"><span style={{ transform: `scaleX(${mastery[selKc.slug] ?? 0})` }} /></div>
                </div>
                <div className="spread">
                  <span className="micro">PREREQ READINESS</span>
                  <span>{(prereqReadiness(selKc.slug, mastery) * 100).toFixed(0)}%</span>
                </div>
                <div className="spread">
                  <span className="micro">STATE</span>
                  {(mastery[selKc.slug] ?? 0) >= MASTERY_THRESHOLD ? (
                    <span className="tag good">MASTERED</span>
                  ) : frontier.has(selKc.slug) ? (
                    <span className="tag on">FRONTIER</span>
                  ) : (
                    <span className="tag">LOCKED / DEEP</span>
                  )}
                </div>
                <button className="btn btn-primary" disabled={!selItem} onClick={() => selItem && selectItem(selItem.id)}>
                  {selItem ? "Practice this skill" : "No item yet"}
                </button>
              </div>
            ) : (
              <div className="dim">Select a skill node.</div>
            )}
          </div>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <button className="btn btn-primary" style={{ flex: 1, padding: 14 }} onClick={nextItem}>Start session</button>
          <button className="btn" style={{ flex: 1, padding: 14 }} onClick={() => setView("problems")}>Browse {ITEMS.length}</button>
        </div>
      </div>
    </div>
  );
}
