import { useEffect, useState } from "react";
import { useStore } from "../store";
import { KCS, EDGES, ITEMS, CATEGORIES } from "../data/seed";
import { sfx } from "../sound";

const LINES = [
  "LATTICE skill instrument // rev 0.1",
  "(c) deliberate-practice systems",
  "",
  "init knowledge-trace core ............ OK",
  "mount bayesian estimator (BKT) ....... OK",
  "load python runtime [pyodide] ........ WARM",
  `build skill graph: ${KCS.length} nodes / ${EDGES.length} edges  OK`,
  `mount problem bank: ${ITEMS.length} items / ${CATEGORIES.length} cats OK`,
  "compute frontier ..................... OK",
  "",
  "ready.",
];

export function Boot() {
  const setBooted = useStore((s) => s.setBooted);
  const sound = useStore((s) => s.sound);
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (sound) sfx.boot();
    const timers: number[] = [];
    LINES.forEach((_, i) => {
      timers.push(window.setTimeout(() => setN(i + 1), 140 * i + 200));
    });
    timers.push(window.setTimeout(() => setDone(true), 140 * LINES.length + 400));
    return () => timers.forEach(clearTimeout);
  }, [sound]);

  useEffect(() => {
    const skip = () => setBooted();
    window.addEventListener("keydown", skip);
    window.addEventListener("click", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("click", skip);
    };
  }, [setBooted]);

  return (
    <div className="boot">
      {LINES.slice(0, n).map((l, i) => (
        <div className="line" key={i}>
          {l}
        </div>
      ))}
      {!done && <span className="cursor" />}
      {done && (
        <>
          <div className="boot-big glow amber">LATTICE</div>
          <div className="line" style={{ marginTop: 18, fontSize: 18 }}>
            press any key to enter<span className="cursor" />
          </div>
        </>
      )}
    </div>
  );
}
