import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const cmds = useMemo(
    () => [
      { label: "Go to lattice", hint: "view", run: () => store.setView("lattice") },
      { label: "Next frontier problem", hint: "scheduler", run: () => store.nextItem() },
      { label: "Go to review queue", hint: "view", run: () => store.setView("review") },
      { label: "Go to instruments", hint: "view", run: () => store.setView("instruments") },
      { label: `Theme: ${store.theme === "phosphor" ? "switch to blueprint" : "switch to phosphor"}`, hint: "display", run: () => store.setTheme(store.theme === "phosphor" ? "blueprint" : "phosphor") },
      { label: `Scanlines: ${store.scanlines ? "off" : "on"}`, hint: "display", run: () => store.toggleScanlines() },
      { label: `Sound: ${store.sound ? "off" : "on"}`, hint: "audio", run: () => store.toggleSound() },
      { label: "Reset all progress", hint: "danger", run: () => store.reset() },
    ],
    [store]
  );

  const filtered = cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));

  useEffect(() => setSel(0), [q]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); filtered[sel]?.run(); onClose(); }
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="palette-bg" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="type a command…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div>
          {filtered.map((c, i) => (
            <div
              key={c.label}
              className={`pcmd ${i === sel ? "sel" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => { c.run(); onClose(); }}
            >
              <span>{c.label}</span>
              <span className="dim cap" style={{ fontSize: 10 }}>{c.hint}</span>
            </div>
          ))}
          {filtered.length === 0 && <div className="pcmd dim">no match</div>}
        </div>
      </div>
    </div>
  );
}
