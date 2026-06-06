import { useState } from "react";
import { useStore } from "../store";
import { KCS } from "../data/seed";
import { reliabilityBins, ece, timeToMastery } from "../engine/evalmetrics";
import { runAB, ABResult } from "../engine/sim";
import { runBakeoff, Bakeoff } from "../engine/modeleval";

export function Instruments() {
  const history = useStore((s) => s.history);
  const mastery = useStore((s) => s.mastery);
  const attempts = useStore((s) => s.attempts);
  const calibration = useStore((s) => s.calibration);

  const fails = attempts.filter((a) => a.verdict !== "pass");
  const attributed = fails.filter((a) => a.diagnosedKc).length;
  const attrRate = fails.length ? attributed / fails.length : 0;

  const bins = reliabilityBins(calibration);
  const calErr = ece(calibration);
  const ttm = timeToMastery(history);

  const [ab, setAb] = useState<ABResult | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const runSim = () => {
    setSimRunning(true);
    setTimeout(() => {
      setAb(runAB());
      setSimRunning(false);
    }, 30);
  };

  const [bake, setBake] = useState<Bakeoff | null>(null);
  const [bakeRunning, setBakeRunning] = useState(false);
  const runBake = () => {
    setBakeRunning(true);
    setTimeout(() => {
      setBake(runBakeoff());
      setBakeRunning(false);
    }, 30);
  };

  // learning trace
  const W = 520, H = 200, pad = 28;
  const pts = history.map((h, i) => ({
    x: pad + (i / Math.max(1, history.length - 1)) * (W - pad * 2),
    y: pad + (1 - h.p) * (H - pad * 2),
    correct: h.correct,
  }));
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");

  // reliability diagram geometry
  const S = 220, sp = 26;
  const rx = (v: number) => sp + v * (S - sp * 2);
  const ry = (v: number) => S - sp - v * (S - sp * 2);

  return (
    <div className="stack" style={{ height: "100%", overflow: "auto" }}>
      <div className="two-col">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-label"><span className="panel-idx">01</span> / LEARNING TRACE</span>
            <span className="micro">P(MASTERED) PER OBSERVATION</span>
          </div>
          <div className="panel-body">
            {history.length < 2 ? (
              <div className="dim">Insufficient data. Solve a few problems to populate the trace.</div>
            ) : (
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
                <line className="chart-axis" x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} />
                <line className="chart-axis" x1={pad} y1={pad} x2={pad} y2={H - pad} />
                <line className="chart-ref" x1={pad} y1={pad + (1 - 0.85) * (H - pad * 2)} x2={W - pad} y2={pad + (1 - 0.85) * (H - pad * 2)} />
                <text x={W - pad} y={pad + (1 - 0.85) * (H - pad * 2) - 4} textAnchor="end" className="node-label">mastery 0.85</text>
                <path className="chart-line" d={path} />
                {pts.map((p, i) => (
                  <rect key={i} x={p.x - 2} y={p.y - 2} width={4} height={4} fill={p.correct ? "var(--green)" : "var(--red)"} />
                ))}
                <text x={pad} y={H - pad + 14} className="node-label">0</text>
                <text x={W - pad} y={H - pad + 14} textAnchor="end" className="node-label">obs {history.length}</text>
              </svg>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-label"><span className="panel-idx">02</span> / CALIBRATION</span>
            <span className="micro">PREDICTED VS OBSERVED · ECE {calErr.toFixed(3)}</span>
          </div>
          <div className="panel-body">
            {calibration.length < 5 ? (
              <div className="dim">Insufficient data. The reliability diagram needs more attempts ({calibration.length}/5).</div>
            ) : (
              <svg viewBox={`0 0 ${S} ${S}`} style={{ width: "100%", maxWidth: 280 }}>
                <line className="chart-ref" x1={rx(0)} y1={ry(0)} x2={rx(1)} y2={ry(1)} />
                <line className="chart-axis" x1={sp} y1={S - sp} x2={S - sp} y2={S - sp} />
                <line className="chart-axis" x1={sp} y1={sp} x2={sp} y2={S - sp} />
                {bins.map((b, i) => (
                  <rect key={i} x={rx(b.meanPred) - 3} y={ry(b.acc) - 3} width={6} height={6} fill="var(--amber)" opacity={Math.min(1, 0.3 + b.n / 10)} />
                ))}
                <text x={sp} y={S - sp + 14} className="node-label">pred 0</text>
                <text x={S - sp} y={S - sp + 14} textAnchor="end" className="node-label">1</text>
                <text x={sp - 6} y={sp + 4} textAnchor="end" className="node-label">obs 1</text>
              </svg>
            )}
            <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
              Points on the diagonal mean the model's confidence matches reality. ECE is the average gap.
            </div>
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-label"><span className="panel-idx">03</span> / CREDIT ATTRIBUTION</span>
            <span className="micro">HONESTY METRIC</span>
          </div>
          <div className="panel-body stack">
            <div className="spread">
              <span className="micro">FAILED ATTEMPTS LOCALIZED TO A SKILL</span>
              <span className="mono amber">{(attrRate * 100).toFixed(0)}%</span>
            </div>
            <div className="conf-bar"><span style={{ transform: `scaleX(${attrRate})` }} /></div>
            <div className="stat-grid mt">
              <div className="stat"><div className="micro">FAILS</div><div className="num">{fails.length}</div></div>
              <div className="stat"><div className="micro">ATTRIBUTED</div><div className="num green">{attributed}</div></div>
            </div>
            <div className="dim" style={{ fontSize: 12 }}>
              Unattributed failures are reported honestly rather than guessed.
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-label"><span className="panel-idx">04</span> / TIME TO MASTERY</span>
            <span className="micro">ATTEMPTS UNTIL P &gt;= 0.85</span>
          </div>
          <div className="panel-body stack">
            {ttm.perSkill.length === 0 ? (
              <div className="dim">No skill mastered yet.</div>
            ) : (
              <>
                <div className="stat-grid">
                  <div className="stat"><div className="micro">SKILLS MASTERED</div><div className="num green">{ttm.perSkill.length}</div></div>
                  <div className="stat"><div className="micro">MEAN ATTEMPTS</div><div className="num amber">{ttm.mean.toFixed(1)}</div></div>
                </div>
                <div className="mt">
                  {ttm.perSkill.slice(0, 8).map((s) => (
                    <div key={s.slug} style={{ display: "grid", gridTemplateColumns: "1fr 30px", gap: 8, alignItems: "center", padding: "2px 0" }}>
                      <span className="mono dim" style={{ fontSize: 11 }}>{s.slug}</span>
                      <span className="mono num" style={{ fontSize: 12 }}>{s.attempts}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-label"><span className="panel-idx">05</span> / SCHEDULER A/B (SIMULATED)</span>
          <button className="btn btn-primary" disabled={simRunning} onClick={runSim}>
            {simRunning ? "SIMULATING…" : ab ? "RE-RUN" : "RUN SIMULATION"}
          </button>
        </div>
        <div className="panel-body">
          {!ab ? (
            <div className="dim">
              Runs synthetic learners under three policies (adaptive frontier scheduler, fixed order,
              random) and plots mean true mastery over practice steps. Honest framing: this measures
              the scheduler against a learning model, not real humans.
            </div>
          ) : (
            <ABChart ab={ab} />
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-label"><span className="panel-idx">06</span> / MODEL BAKE-OFF · BKT vs PFA vs DKT</span>
          <button className="btn btn-primary" disabled={bakeRunning} onClick={runBake}>
            {bakeRunning ? "RUNNING…" : bake ? "RE-RUN" : "RUN BAKE-OFF"}
          </button>
        </div>
        <div className="panel-body">
          {!bake ? (
            <div className="dim">
              Compares three knowledge-tracing models on held-out simulated learners: BKT (Bayesian),
              PFA (logistic, fit here), and DKT (a GRU trained offline in tools/train_dkt.py, weights
              loaded for in-browser inference). Metrics: calibration (ECE, lower better), accuracy, and
              log-loss. Synthetic data, not real students.
            </div>
          ) : (
            (() => {
              const entries = [
                ["BKT", bake.bkt],
                ["PFA", bake.pfa],
                ["DKT", bake.dkt],
              ] as const;
              const bestEce = Math.min(...entries.map(([, s]) => s.ece));
              const bestAcc = Math.max(...entries.map(([, s]) => s.acc));
              const bestLl = Math.min(...entries.map(([, s]) => s.logloss));
              return (
                <div className="stack">
                  <table className="grid">
                    <thead><tr><th>MODEL</th><th>ECE ↓</th><th>ACCURACY ↑</th><th>LOG-LOSS ↓</th></tr></thead>
                    <tbody>
                      {entries.map(([name, s]) => (
                        <tr key={name}>
                          <td className="mono" style={{ fontWeight: 700 }}>{name}</td>
                          <td className={`num mono ${s.ece === bestEce ? "green" : "dim"}`}>{s.ece.toFixed(4)}</td>
                          <td className={`num mono ${s.acc === bestAcc ? "green" : "dim"}`}>{(s.acc * 100).toFixed(1)}%</td>
                          <td className={`num mono ${s.logloss === bestLl ? "green" : "dim"}`}>{s.logloss.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="dim" style={{ fontSize: 12 }}>
                    {bake.nTest} held-out predictions. Green = best. DKT is a GRU trained offline; these test
                    learners were never seen in training. Reliability curves below (closer to diagonal = better calibrated).
                  </div>
                  <div className="three-col">
                    {entries.map(([name, s]) => (
                      <ReliabilityMini key={name} name={name} bins={s.bins} />
                    ))}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span className="panel-label"><span className="panel-idx">07</span> / MASTERY BY SKILL</span></div>
        <div className="panel-body">
          {KCS.map((k) => {
            const p = mastery[k.slug] ?? 0;
            return (
              <div key={k.slug} style={{ display: "grid", gridTemplateColumns: "180px 1fr 50px", gap: 10, alignItems: "center", padding: "3px 0" }}>
                <span className="mono" style={{ fontSize: 12 }}>{k.slug}</span>
                <div className="gauge"><span style={{ transform: `scaleX(${p})`, background: p >= 0.85 ? "var(--green)" : "var(--amber)" }} /></div>
                <span className="mono num" style={{ fontSize: 12 }}>{p.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReliabilityMini({ name, bins }: { name: string; bins: { x: number; y: number; n: number }[] }) {
  const S = 150, sp = 18;
  const rx = (v: number) => sp + v * (S - sp * 2);
  const ry = (v: number) => S - sp - v * (S - sp * 2);
  return (
    <div>
      <div className="micro" style={{ marginBottom: 4 }}>{name} RELIABILITY</div>
      <svg viewBox={`0 0 ${S} ${S}`} style={{ width: "100%", maxWidth: 180 }}>
        <line className="chart-ref" x1={rx(0)} y1={ry(0)} x2={rx(1)} y2={ry(1)} />
        <line className="chart-axis" x1={sp} y1={S - sp} x2={S - sp} y2={S - sp} />
        <line className="chart-axis" x1={sp} y1={sp} x2={sp} y2={S - sp} />
        <path d={bins.map((b, i) => (i === 0 ? "M" : "L") + rx(b.x).toFixed(1) + " " + ry(b.y).toFixed(1)).join(" ")} fill="none" stroke="var(--amber)" strokeWidth={1.4} />
        {bins.map((b, i) => (
          <rect key={i} x={rx(b.x) - 2} y={ry(b.y) - 2} width={4} height={4} fill="var(--amber)" />
        ))}
      </svg>
    </div>
  );
}

function ABChart({ ab }: { ab: ABResult }) {
  const W = 600, H = 240, pad = 32;
  const maxX = ab.xs[ab.xs.length - 1] || 1;
  const px = (x: number) => pad + (x / maxX) * (W - pad * 2);
  const py = (v: number) => pad + (1 - v) * (H - pad * 2);
  const line = (ys: number[]) => ab.xs.map((x, i) => (i === 0 ? "M" : "L") + px(x).toFixed(1) + " " + py(ys[i]).toFixed(1)).join(" ");
  const last = (ys: number[]) => ys[ys.length - 1];
  const series: [string, number[], string][] = [
    ["adaptive", ab.adaptive, "var(--amber)"],
    ["fixed", ab.fixed, "var(--green)"],
    ["random", ab.random, "var(--faint)"],
  ];
  return (
    <div className="stack">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
        <line className="chart-axis" x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} />
        <line className="chart-axis" x1={pad} y1={pad} x2={pad} y2={H - pad} />
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} className="chart-ref" x1={pad} y1={py(g)} x2={W - pad} y2={py(g)} />
        ))}
        {series.map(([name, ys, color]) => (
          <path key={name} d={line(ys)} fill="none" stroke={color} strokeWidth={name === "adaptive" ? 2 : 1.3} />
        ))}
        <text x={pad} y={H - pad + 14} className="node-label">0</text>
        <text x={W - pad} y={H - pad + 14} textAnchor="end" className="node-label">{maxX} steps</text>
        <text x={pad - 6} y={py(1) + 4} textAnchor="end" className="node-label">1.0</text>
      </svg>
      <div className="row" style={{ gap: 16 }}>
        {series.map(([name, ys, color]) => (
          <span key={name} className="row" style={{ gap: 6 }}>
            <span style={{ width: 12, height: 3, background: color, display: "inline-block" }} />
            <span className="micro">{name}</span>
            <span className="mono num" style={{ fontSize: 12, color }}>{last(ys).toFixed(2)}</span>
          </span>
        ))}
      </div>
      <div className="dim" style={{ fontSize: 12 }}>
        Final mean true mastery after {maxX} steps. The adaptive scheduler should reach higher mastery
        per practice step by keeping the learner at their frontier.
      </div>
    </div>
  );
}
