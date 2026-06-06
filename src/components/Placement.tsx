import { useMemo, useState } from "react";
import { useStore } from "../store";
import { kcBySlug } from "../data/seed";
import { Answer, Belief, PLACEMENT_PROBES, applyAnswer, initBelief, nextProbe } from "../engine/placement";

export function Placement() {
  const seedFromPlacement = useStore((s) => s.seedFromPlacement);
  const skipPlacement = useStore((s) => s.skipPlacement);

  const [belief, setBelief] = useState<Belief>(() => initBelief());
  const [asked, setAsked] = useState<Set<string>>(() => new Set());
  const [step, setStep] = useState(0);
  const [current, setCurrent] = useState<string>(() => nextProbe(initBelief(), new Set())!);

  const kc = useMemo(() => kcBySlug(current), [current]);

  const answer = (ans: Answer) => {
    const nb = applyAnswer(belief, current, ans);
    const na = new Set(asked).add(current);
    const nstep = step + 1;
    setBelief(nb);
    setAsked(na);
    setStep(nstep);
    const np = nextProbe(nb, na);
    if (nstep >= PLACEMENT_PROBES || !np) {
      seedFromPlacement(nb);
    } else {
      setCurrent(np);
    }
  };

  return (
    <div className="placement">
      <div className="placement-card">
        <div className="panel-head">
          <span className="panel-label"><span className="panel-idx">00</span> / CALIBRATION</span>
          <span className="micro">PROBE {step + 1} / {PLACEMENT_PROBES}</span>
        </div>
        <div className="panel-body stack">
          <div className="dim" style={{ fontSize: 13 }}>
            A few quick questions seed your starting lattice so practice begins at the right level.
            Answer honestly; there is no scoring.
          </div>

          <div className="placement-q">
            <div className="micro">{kc.category} · {current}</div>
            <div style={{ fontFamily: "var(--grotesk)", fontWeight: 800, fontSize: 24, margin: "6px 0" }}>{kc.title}</div>
            <div className="dim">{kc.blurb}</div>
          </div>

          <div className="micro">HOW COMFORTABLE ARE YOU SOLVING PROBLEMS THAT NEED THIS?</div>
          <div className="placement-opts">
            <button className="btn good-btn" onClick={() => answer("confident")}>CONFIDENT</button>
            <button className="btn" onClick={() => answer("shaky")}>SHAKY</button>
            <button className="btn bad-btn" onClick={() => answer("none")}>NO IDEA</button>
          </div>

          <div className="gauge"><span style={{ transform: `scaleX(${(step) / PLACEMENT_PROBES})` }} /></div>
          <button className="btn" style={{ alignSelf: "flex-start", padding: "4px 10px" }} onClick={skipPlacement}>
            SKIP CALIBRATION
          </button>
        </div>
      </div>
    </div>
  );
}
