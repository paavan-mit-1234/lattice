import { useState } from "react";
import { useStore } from "../store";

export function Settings({ onClose }: { onClose: () => void }) {
  const llm = useStore((s) => s.llm);
  const setLlm = useStore((s) => s.setLlm);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const scanlines = useStore((s) => s.scanlines);
  const toggleScanlines = useStore((s) => s.toggleScanlines);
  const sound = useStore((s) => s.sound);
  const toggleSound = useStore((s) => s.toggleSound);
  const reset = useStore((s) => s.reset);

  const [showKey, setShowKey] = useState(false);

  const PRESETS: Record<string, { model: string; baseUrl: string; label: string; hint: string }> = {
    gemini: { model: "gemini-2.0-flash", baseUrl: "", label: "Google Gemini (free, no card)", hint: "Key: aistudio.google.com → Get API key" },
    openai: { model: "meta-llama/llama-3.3-70b-instruct:free", baseUrl: "https://openrouter.ai/api/v1", label: "OpenAI-compatible (OpenRouter / Groq)", hint: "OpenRouter free models; key: openrouter.ai/keys" },
    anthropic: { model: "claude-3-5-haiku-latest", baseUrl: "", label: "Anthropic (paid)", hint: "Key: console.anthropic.com (requires credit)" },
  };
  const setProvider = (p: "gemini" | "openai" | "anthropic") =>
    setLlm({ provider: p, model: PRESETS[p].model, baseUrl: PRESETS[p].baseUrl });

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <span className="panel-label"><span className="panel-idx">CFG</span> / SETTINGS</span>
          <button className="btn" style={{ padding: "4px 10px" }} onClick={onClose}>CLOSE</button>
        </div>
        <div className="panel-body stack">
          <div className="set-group">
            <div className="spread">
              <span className="micro">LLM CREDIT ASSIGNMENT</span>
              <button className={`btn ${llm.enabled ? "btn-primary" : ""}`} style={{ padding: "4px 12px" }} onClick={() => setLlm({ enabled: !llm.enabled })}>
                {llm.enabled ? "ON" : "OFF"}
              </button>
            </div>
            <div className="dim" style={{ fontSize: 12 }}>
              When on, a real model reads your failed code and infers which skill broke. Falls back to
              the built-in heuristic if the key is missing or a call fails.
            </div>

            <label className="micro mt">PROVIDER</label>
            <select className="filter-input" value={llm.provider || "gemini"} onChange={(e) => setProvider(e.target.value as any)}>
              <option value="gemini">{PRESETS.gemini.label}</option>
              <option value="openai">{PRESETS.openai.label}</option>
              <option value="anthropic">{PRESETS.anthropic.label}</option>
            </select>
            <div className="dim" style={{ fontSize: 11 }}>{PRESETS[llm.provider]?.hint}</div>

            <label className="micro mt">API KEY</label>
            <div className="row">
              <input
                className="filter-input"
                style={{ flex: 1 }}
                type={showKey ? "text" : "password"}
                placeholder={llm.provider === "anthropic" ? "sk-ant-..." : llm.provider === "openai" ? "sk-or-..." : "AIza..."}
                value={llm.key}
                onChange={(e) => setLlm({ key: e.target.value })}
              />
              <button className="btn" style={{ padding: "8px 10px" }} onClick={() => setShowKey((v) => !v)}>{showKey ? "HIDE" : "SHOW"}</button>
            </div>

            <label className="micro mt">MODEL</label>
            <input className="filter-input" value={llm.model} onChange={(e) => setLlm({ model: e.target.value })} />

            {llm.provider === "openai" && (
              <>
                <label className="micro mt">BASE URL</label>
                <input className="filter-input" value={llm.baseUrl} onChange={(e) => setLlm({ baseUrl: e.target.value })} placeholder="https://openrouter.ai/api/v1" />
              </>
            )}

            <div className="warn mt">
              The key is stored in your browser and sent directly to the API. Fine for local use; a real
              deployment must proxy through a server so the key never reaches the client.
            </div>
          </div>

          <div className="set-group">
            <div className="spread">
              <span className="micro">THEME</span>
              <div className="row" style={{ gap: 0 }}>
                <button className={`tab ${theme === "phosphor" ? "active" : ""}`} style={{ padding: "6px 12px", borderLeft: "1px solid var(--line)" }} onClick={() => setTheme("phosphor")}>PHOSPHOR</button>
                <button className={`tab ${theme === "blueprint" ? "active" : ""}`} style={{ padding: "6px 12px", borderLeft: "1px solid var(--line)" }} onClick={() => setTheme("blueprint")}>BLUEPRINT</button>
              </div>
            </div>
            <div className="spread mt">
              <span className="micro">CRT SCANLINES</span>
              <button className={`btn ${scanlines ? "btn-primary" : ""}`} style={{ padding: "4px 12px" }} onClick={toggleScanlines}>{scanlines ? "ON" : "OFF"}</button>
            </div>
            <div className="spread mt">
              <span className="micro">SOUND</span>
              <button className={`btn ${sound ? "btn-primary" : ""}`} style={{ padding: "4px 12px" }} onClick={toggleSound}>{sound ? "ON" : "OFF"}</button>
            </div>
          </div>

          <div className="set-group">
            <div className="spread">
              <span className="micro">RESET ALL PROGRESS</span>
              <button className="btn bad-btn" style={{ padding: "4px 12px" }} onClick={() => { reset(); onClose(); }}>RESET</button>
            </div>
            <div className="dim" style={{ fontSize: 12 }}>Clears mastery, history, and re-runs calibration.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
