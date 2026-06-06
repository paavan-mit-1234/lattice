import { useEffect, useState } from "react";
import { useStore } from "./store";
import { Boot } from "./components/Boot";
import { Lattice } from "./components/Lattice";
import { Problems } from "./components/Problems";
import { Practice } from "./components/Practice";
import { Review } from "./components/Review";
import { Instruments } from "./components/Instruments";
import { Placement } from "./components/Placement";
import { Settings } from "./components/Settings";
import { CommandPalette } from "./components/CommandPalette";

const TABS: { id: any; label: string }[] = [
  { id: "lattice", label: "Lattice" },
  { id: "problems", label: "Problems" },
  { id: "practice", label: "Practice" },
  { id: "review", label: "Review" },
  { id: "instruments", label: "Instruments" },
];

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="status mono">{t.toLocaleTimeString([], { hour12: false })}</span>;
}

export function App() {
  const booted = useStore((s) => s.booted);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const theme = useStore((s) => s.theme);
  const scanlines = useStore((s) => s.scanlines);
  const init = useStore((s) => s.init);
  const placementDone = useStore((s) => s.placementDone);
  const [palette, setPalette] = useState(false);
  const [settings, setSettings] = useState(false);

  useEffect(() => init(), []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!booted) return <><Boot />{scanlines && <div className="crt-overlay" />}</>;

  if (!placementDone) return <><Placement />{scanlines && <div className="crt-overlay" />}</>;

  return (
    <div className="app">
      <div className="bar">
        <div className="bar-left">
          <div className="monogram">L</div>
          <span className="wordmark">LATTICE</span>
          <span className="ver">v0.1 // BKT</span>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${view === t.id ? "active" : ""}`} onClick={() => setView(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="bar-right">
          <Clock />
          <button className="kbd" onClick={() => setSettings(true)}>CFG</button>
          <button className="kbd" onClick={() => setPalette(true)}>CTRL+K</button>
        </div>
      </div>

      <div className="canvas">
        {view === "lattice" && <Lattice />}
        {view === "problems" && <Problems />}
        {view === "practice" && <Practice />}
        {view === "review" && <Review />}
        {view === "instruments" && <Instruments />}
      </div>

      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {settings && <Settings onClose={() => setSettings(false)} />}
      {scanlines && <div className="crt-overlay" />}
    </div>
  );
}
