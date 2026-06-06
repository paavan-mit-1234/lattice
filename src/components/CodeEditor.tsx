import { RefObject, useRef } from "react";
import { highlight } from "../engine/highlight";
import { CodeLang } from "../store";

export function CodeEditor({
  code,
  onChange,
  onKey,
  faultLine,
  taRef,
  lang = "python",
}: {
  code: string;
  onChange: (v: string) => void;
  onKey: (e: React.KeyboardEvent) => void;
  faultLine: number | null;
  taRef: RefObject<HTMLTextAreaElement>;
  lang?: CodeLang;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const lines = code.split("\n");
  return (
    <div className="editor">
      <div className="gutter">
        {lines.map((_, i) => (
          <span className={`gl ${faultLine === i + 1 ? "fault" : ""}`} key={i}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className="code-stack">
        <pre ref={preRef} className="code-hl" aria-hidden dangerouslySetInnerHTML={{ __html: highlight(code, lang) + "\n" }} />
        <textarea
          ref={taRef}
          className="code-area"
          spellCheck={false}
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onScroll={(e) => {
            const p = preRef.current;
            if (p) {
              p.scrollTop = e.currentTarget.scrollTop;
              p.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
        />
      </div>
    </div>
  );
}
