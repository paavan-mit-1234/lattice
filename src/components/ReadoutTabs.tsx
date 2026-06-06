import { useState } from "react";
import { useStore } from "../store";
import { Item } from "../data/seed";
import { CodeLang } from "../store";
import { hintsFor } from "../engine/hints";
import { highlight } from "../engine/highlight";
import { lineDiff } from "../engine/diff";
import { estimateComplexity, ComplexityResult } from "../engine/complexity";

export function Editorial({ item, solved }: { item: Item; solved: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const steps = hintsFor(item);
  const show = solved || revealed;
  return (
    <div className="panel-body stack">
      <div className="micro">APPROACH</div>
      <ol className="editorial-steps">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <div className="spread" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <span className="micro">REFERENCE SOLUTION</span>
        {item.solution && !show && (
          <button className="btn" style={{ padding: "4px 10px" }} onClick={() => setRevealed(true)}>REVEAL</button>
        )}
      </div>
      {!item.solution ? (
        <div className="dim" style={{ fontSize: 12 }}>
          A full code editorial is not written for this problem yet; the approach above covers the idea.
        </div>
      ) : show ? (
        <pre className="code-hl editorial-code" dangerouslySetInnerHTML={{ __html: highlight(item.solution, "python") }} />
      ) : (
        <div className="dim" style={{ fontSize: 12 }}>Hidden until you solve it (or reveal). Try the approach first.</div>
      )}
    </div>
  );
}

export function ComplexityPanel({ item, code, lang }: { item: Item; code: string; lang: CodeLang }) {
  const [res, setRes] = useState<ComplexityResult | null>(null);
  const [busy, setBusy] = useState(false);
  if (lang !== "python")
    return <div className="panel-body dim">Complexity analysis runs Python solutions only (it executes your code).</div>;
  const run = async () => {
    setBusy(true);
    setRes(null);
    try {
      setRes(await estimateComplexity(item, code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel-body stack">
      <div className="dim" style={{ fontSize: 12 }}>
        Runs your solution on inputs of growing size and fits the timing growth. An empirical estimate,
        not a proof. Runs in a sandboxed worker, so a slow solution is timed out, not a frozen tab.
      </div>
      <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? "ANALYZING…" : "ANALYZE COMPLEXITY"}</button>
      {res &&
        (res.ok ? (
          <>
            <div className="spread">
              <span className="micro">ESTIMATED</span>
              <span className="num amber" style={{ fontSize: 26 }}>{res.bigO}</span>
            </div>
            <div className="spread">
              <span className="micro">FIT R²</span>
              <span className="mono">{res.r2!.toFixed(3)}</span>
            </div>
            <CxChart points={res.points} />
          </>
        ) : (
          <div className="warn">{res.message}</div>
        ))}
    </div>
  );
}

function CxChart({ points }: { points: { n: number; ms: number }[] }) {
  const W = 320, H = 140, pad = 28;
  const maxN = Math.max(...points.map((p) => p.n));
  const maxMs = Math.max(...points.map((p) => p.ms), 0.001);
  const px = (n: number) => pad + (n / maxN) * (W - pad * 2);
  const py = (ms: number) => H - pad - (ms / maxMs) * (H - pad * 2);
  const path = points.map((p, i) => (i === 0 ? "M" : "L") + px(p.n).toFixed(1) + " " + py(p.ms).toFixed(1)).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
      <line className="chart-axis" x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} />
      <line className="chart-axis" x1={pad} y1={pad} x2={pad} y2={H - pad} />
      <path d={path} fill="none" stroke="var(--amber)" strokeWidth={1.5} />
      {points.map((p, i) => (
        <rect key={i} x={px(p.n) - 2} y={py(p.ms) - 2} width={4} height={4} fill="var(--amber)" />
      ))}
      <text x={W - pad} y={H - pad + 14} textAnchor="end" className="node-label">n={maxN}</text>
      <text x={pad - 4} y={pad + 4} textAnchor="end" className="node-label">{maxMs.toFixed(0)}ms</text>
    </svg>
  );
}

export function HistoryPanel({ item, currentCode }: { item: Item; currentCode: string }) {
  const subs = useStore((s) => s.submissions[item.id] || []);
  const [sel, setSel] = useState<number | null>(null);
  if (!subs.length) return <div className="panel-body dim">No submissions yet. Hit SUBMIT to record one.</div>;
  return (
    <div className="panel-body stack">
      <table className="grid">
        <tbody>
          {subs.map((s, i) => (
            <tr key={i} style={{ cursor: "pointer" }} onClick={() => setSel(sel === i ? null : i)}>
              <td className="mono dim">{new Date(s.ts).toLocaleTimeString()}</td>
              <td><span className={`tag ${s.verdict === "pass" ? "good" : "bad"}`}>{s.verdict.toUpperCase()}</span></td>
              <td className="mono">{s.passed}/{s.total}</td>
              <td className="mono dim">{s.runtimeMs}ms</td>
              <td className="mono dim">{s.lang.toUpperCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sel !== null && (
        <div>
          <div className="micro" style={{ marginBottom: 4 }}>DIFF · selected submission → current editor</div>
          <pre className="diff">
            {lineDiff(subs[sel].code, currentCode).map((d, i) => (
              <div key={i} className={`dl ${d.type}`}>
                {d.type === "add" ? "+" : d.type === "del" ? "-" : " "} {d.text}
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}
