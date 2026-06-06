import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { itemById, kcBySlug } from "../data/seed";
import { grade as runGrade, runCustom, GradeResult, initGrader } from "../engine/grader";
import { diagnose, Diagnosis } from "../engine/diagnose";
import { llmDiagnose } from "../engine/llm";
import { hintsFor } from "../engine/hints";
import { starterFor, LANG_LABEL, RUNNABLE } from "../engine/starters";
import { CodeLang } from "../store";
import { CodeEditor } from "./CodeEditor";
import { FaultReport } from "./FaultReport";
import { Editorial, ComplexityPanel, HistoryPanel } from "./ReadoutTabs";
import { sfx } from "../sound";

type RTab = "readout" | "editorial" | "complexity" | "history";

export function Practice() {
  const currentItemId = useStore((s) => s.currentItemId);
  const applyResult = useStore((s) => s.applyResult);
  const recordSubmission = useStore((s) => s.recordSubmission);
  const nextItem = useStore((s) => s.nextItem);
  const sound = useStore((s) => s.sound);
  const llm = useStore((s) => s.llm);
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const solved = useStore((s) => s.solved);
  const item = currentItemId ? itemById(currentItemId) : null;
  const isSolved = item ? solved.includes(item.id) : false;

  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [warming, setWarming] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [committed, setCommitted] = useState(true);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [rtab, setRtab] = useState<RTab>("readout");
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customResult, setCustomResult] = useState<{ actual: string | null; error: string | null } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // undo/redo history
  const past = useRef<{ code: string; sel: number }[]>([]);
  const future = useRef<{ code: string; sel: number }[]>([]);
  const lastPush = useRef(0);
  const resetHistory = () => {
    past.current = [];
    future.current = [];
    lastPush.current = 0;
  };
  const record = (structural: boolean) => {
    const ta = taRef.current;
    const sel = ta ? ta.selectionStart : code.length;
    const now = Date.now();
    if (structural || past.current.length === 0 || now - lastPush.current > 350) {
      past.current.push({ code, sel });
      if (past.current.length > 300) past.current.shift();
    }
    lastPush.current = now;
    future.current = [];
  };
  const restoreSel = (sel: number, len: number) =>
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) ta.selectionStart = ta.selectionEnd = Math.min(sel, len);
    });
  const undo = () => {
    if (!past.current.length) return;
    const ta = taRef.current;
    future.current.push({ code, sel: ta ? ta.selectionStart : 0 });
    const prev = past.current.pop()!;
    setCode(prev.code);
    restoreSel(prev.sel, prev.code.length);
  };
  const redo = () => {
    if (!future.current.length) return;
    const ta = taRef.current;
    past.current.push({ code, sel: ta ? ta.selectionStart : 0 });
    const nx = future.current.pop()!;
    setCode(nx.code);
    restoreSel(nx.sel, nx.code.length);
    lastPush.current = Date.now();
  };
  const onCodeChange = (v: string) => {
    record(false);
    setCode(v);
  };

  useEffect(() => {
    if (item) {
      setCode(starterFor(item, lang));
      setResult(null);
      setDiag(null);
      setHintLevel(0);
      setRtab("readout");
      setCustomResult(null);
      setCustomInput(item.tests[0]?.args.map((a) => JSON.stringify(a)).join(", ") ?? "");
      resetHistory();
    }
  }, [currentItemId, lang]);

  useEffect(() => {
    setWarming(true);
    initGrader().then(() => setWarming(false)).catch(() => setWarming(false));
  }, []);

  if (!item) {
    return (
      <div className="panel" style={{ height: "100%" }}>
        <div className="panel-head">
          <span className="panel-label"><span className="panel-idx">00</span> / NO PROBLEM LOADED</span>
        </div>
        <div className="panel-body">
          <button className="btn btn-primary" onClick={nextItem}>Load a frontier problem</button>
        </div>
      </div>
    );
  }

  const hints = hintsFor(item);
  const notRunnable = !RUNNABLE[lang];

  function notRunnableResult() {
    setResult({ verdict: "error", results: [], passedCount: 0, totalCount: item!.tests.length, firstFailIndex: null, runtimeMs: 0 });
    setDiag({
      kcSlug: null,
      confidence: 0,
      evidence: `In-browser execution is available for Python only. ${LANG_LABEL[lang]} is write-and-study here: compiled languages need a remote judge, which is not configured. Switch to PY to run and grade.`,
      faultLine: null,
      secondary: [],
      conceptual: false,
    });
    setRtab("readout");
  }

  // RUN: visible tests only, no commit.
  async function onRun() {
    if (!item) return;
    if (notRunnable) return notRunnableResult();
    setRunning(true);
    setRtab("readout");
    if (sound) sfx.submit();
    try {
      const visible = item.tests.filter((t) => !t.hidden);
      const g = await runGrade(item, code, visible);
      setResult(g);
      setCommitted(false);
      setDiag(null);
    } catch (e: any) {
      setResult({ verdict: "error", results: [], passedCount: 0, totalCount: item.tests.length, firstFailIndex: null, runtimeMs: 0 });
    } finally {
      setRunning(false);
    }
  }

  // SUBMIT: full suite, commits to the model + diagnosis + history.
  async function onSubmit() {
    if (!item) return;
    if (notRunnable) return notRunnableResult();
    setRunning(true);
    setRtab("readout");
    if (sound) sfx.submit();
    try {
      const g = await runGrade(item, code);
      setResult(g);
      setCommitted(true);
      let d: Diagnosis | null = null;
      if (g.verdict !== "pass" && g.firstFailIndex != null) {
        const tr = g.results[g.firstFailIndex];
        const tc = item.tests[g.firstFailIndex];
        const ctx = { item, code, failedArgs: tc.args, expected: tc.expected, actual: tr.actual, error: tr.error };
        if (llm.enabled && llm.key) d = await llmDiagnose(ctx, { provider: llm.provider, key: llm.key, model: llm.model, baseUrl: llm.baseUrl });
        if (!d) d = { ...diagnose(ctx), source: "heuristic" };
      }
      setDiag(d);
      applyResult(item, g, d);
      recordSubmission(item.id, { code, lang, verdict: g.verdict, passed: g.passedCount, total: g.totalCount, ts: Date.now(), runtimeMs: g.runtimeMs });
      if (sound) (g.verdict === "pass" ? sfx.pass : sfx.fail)();
    } catch (e: any) {
      setResult({ verdict: "error", results: [], passedCount: 0, totalCount: item.tests.length, firstFailIndex: null, runtimeMs: 0 });
      setDiag({ kcSlug: null, confidence: 0, evidence: "Grader runtime unavailable: " + (e?.message || e) + ".", faultLine: null, secondary: [], conceptual: false });
    } finally {
      setRunning(false);
    }
  }

  async function onRunCustom() {
    if (!item || notRunnable) return;
    try {
      const args = JSON.parse("[" + customInput + "]");
      const r = await runCustom(item, code, args);
      setCustomResult(r);
    } catch (e: any) {
      setCustomResult({ actual: null, error: "Could not parse input as JSON args: " + (e?.message || e) });
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    const ta = taRef.current!;
    const s = ta.selectionStart;
    const en = ta.selectionEnd;
    if (e.key === "Tab") {
      e.preventDefault();
      record(true);
      const v = code.slice(0, s) + "    " + code.slice(en);
      setCode(v);
      requestAnimationFrame(() => (ta.selectionStart = ta.selectionEnd = s + 4));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      record(true);
      const before = code.slice(0, s);
      const lineStart = before.lastIndexOf("\n") + 1;
      const curLine = before.slice(lineStart);
      let indent = (curLine.match(/^[ \t]*/) || [""])[0];
      if (/[:{]\s*$/.test(curLine)) indent += "    ";
      const ins = "\n" + indent;
      const v = code.slice(0, s) + ins + code.slice(en);
      setCode(v);
      requestAnimationFrame(() => (ta.selectionStart = ta.selectionEnd = s + ins.length));
      return;
    }
    if (e.key === "Backspace" && s === en) {
      const before = code.slice(0, s);
      const lineStart = before.lastIndexOf("\n") + 1;
      const seg = before.slice(lineStart);
      if (seg.length > 0 && /^ +$/.test(seg) && seg.length % 4 === 0) {
        e.preventDefault();
        record(true);
        const v = code.slice(0, s - 4) + code.slice(en);
        setCode(v);
        requestAnimationFrame(() => (ta.selectionStart = ta.selectionEnd = s - 4));
      }
    }
  }

  const RTABS: { id: RTab; label: string }[] = [
    { id: "readout", label: "READOUT" },
    { id: "editorial", label: "EDITORIAL" },
    { id: "complexity", label: "COMPLEXITY" },
    { id: "history", label: "HISTORY" },
  ];

  return (
    <div className="practice">
      <div className="panel">
        <div className="panel-head">
          <span className="panel-label"><span className="panel-idx">01</span> / PROBLEM</span>
          <span className="tag on">{item.kcs[0].slug}</span>
        </div>
        <div className="panel-body stack">
          <div style={{ fontFamily: "var(--grotesk)", fontWeight: 900, fontSize: 22, letterSpacing: "0.02em" }}>{item.title}</div>
          <div className="row">
            <span className="tag">DIFFICULTY {"|".repeat(item.difficulty)}<span className="dim">{"|".repeat(5 - item.difficulty)}</span></span>
            <span className="tag">FN {item.funcName}()</span>
            {isSolved && <span className="tag good">SOLVED</span>}
          </div>
          <div className="prompt" dangerouslySetInnerHTML={{ __html: mdInline(item.prompt) }} />
          <div className="mt">
            <div className="micro" style={{ marginBottom: 6 }}>EXERCISES</div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {item.kcs.map((k) => (
                <span className="tag" key={k.slug} title={kcBySlug(k.slug).blurb}>{k.slug} · {k.weight.toFixed(1)}</span>
              ))}
            </div>
          </div>
          <div className="mt hints">
            <div className="spread">
              <span className="micro">HINTS</span>
              <button className="btn" style={{ padding: "4px 10px" }} disabled={hintLevel >= hints.length} onClick={() => setHintLevel((h) => Math.min(hints.length, h + 1))}>
                {hintLevel === 0 ? "REVEAL HINT" : hintLevel >= hints.length ? "NO MORE" : `NEXT HINT (${hintLevel}/${hints.length})`}
              </button>
            </div>
            {hints.slice(0, hintLevel).map((h, i) => (
              <div className="hint" key={i}><span className="hint-n">{i + 1}</span>{h}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="practice-right">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-label"><span className="panel-idx">02</span> / EDITOR</span>
            <div className="lang-tabs">
              {(["python", "c", "cpp", "java"] as CodeLang[]).map((l) => (
                <button key={l} className={`lang-tab ${lang === l ? "active" : ""}`} title={RUNNABLE[l] ? "runs in-browser" : "write-and-study (no in-browser run)"} onClick={() => setLang(l)}>
                  {LANG_LABEL[l]}{!RUNNABLE[l] && <span className="lang-dot" />}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-head" style={{ borderTop: "none", paddingTop: 0 }}>
            <span className="micro">
              {notRunnable ? `${LANG_LABEL[lang]} · WRITE-AND-STUDY (NO IN-BROWSER RUN)` : warming ? "WARMING RUNTIME…" : "CTRL+ENTER = SUBMIT · CTRL+Z UNDO"}
            </span>
          </div>
          <CodeEditor code={code} onChange={onCodeChange} onKey={onKey} faultLine={diag?.faultLine ?? null} taRef={taRef} lang={lang} />
          <div className="panel-head" style={{ borderTop: "1px solid var(--line)", borderBottom: "none" }}>
            <div className="tests">
              {item.tests.map((t, i) => {
                const r = result?.results[i];
                const cls = !r ? "" : r.passed ? "pass" : "fail";
                return (
                  <span className={`tcell ${cls}`} key={i} title={t.hidden ? "hidden" : "visible"}>
                    {!r ? (t.hidden ? "?" : i + 1) : r.passed ? "✓" : "✗"}
                  </span>
                );
              })}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" disabled={running} onClick={onRun} title="run visible tests, no grading">RUN</button>
              <button className="btn btn-primary" disabled={running} onClick={onSubmit} title="grade full suite + update model">{running ? "…" : "SUBMIT ▸"}</button>
            </div>
          </div>

          {!notRunnable && (
            <details className="custom-input" open={customOpen} onToggle={(e) => setCustomOpen((e.target as HTMLDetailsElement).open)}>
              <summary>CUSTOM INPUT</summary>
              <div className="stack" style={{ padding: "8px 0" }}>
                <textarea className="filter-input" rows={2} value={customInput} onChange={(e) => setCustomInput(e.target.value)} placeholder="args as JSON, comma-separated. e.g.  [2,7,11,15], 9" />
                <div className="row">
                  <button className="btn" onClick={onRunCustom}>RUN CUSTOM</button>
                  {customResult && (
                    <span className="mono" style={{ fontSize: 12 }}>
                      {customResult.error ? <span className="red">{customResult.error.split("\n").slice(-2)[0]}</span> : <>→ <span className="amber">{customResult.actual}</span></>}
                    </span>
                  )}
                </div>
              </div>
            </details>
          )}
        </div>

        <div className="panel" style={{ overflow: "auto" }}>
          <div className="panel-head" style={{ gap: 0, padding: 0 }}>
            <div className="rtabs">
              {RTABS.map((t) => (
                <button key={t.id} className={`rtab ${rtab === t.id ? "active" : ""}`} onClick={() => setRtab(t.id)}>{t.label}</button>
              ))}
            </div>
            {rtab === "readout" && result && <button className="btn" style={{ margin: 6 }} onClick={nextItem}>NEXT →</button>}
          </div>

          {rtab === "readout" &&
            (result ? (
              <>
                {diag?.source && result.verdict !== "pass" && committed && (
                  <div style={{ padding: "6px 14px 0" }}>
                    <span className={`tag ${diag.source === "llm" ? "on" : ""}`}>{diag.source === "llm" ? "LLM DIAGNOSIS" : "HEURISTIC DIAGNOSIS"}</span>
                  </div>
                )}
                <FaultReport grade={result} diag={diag} item={item} committed={committed} />
              </>
            ) : (
              <div className="panel-body dim">RUN checks the visible tests. SUBMIT grades the full hidden suite and updates the model.</div>
            ))}
          {rtab === "editorial" && <Editorial item={item} solved={isSolved} />}
          {rtab === "complexity" && <ComplexityPanel item={item} code={code} lang={lang} />}
          {rtab === "history" && <HistoryPanel item={item} currentCode={code} />}
        </div>
      </div>
    </div>
  );
}

function mdInline(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/`([^`]+)`/g, "<code>$1</code>");
}
