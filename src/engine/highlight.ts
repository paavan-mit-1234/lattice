// Minimal tokenizer for the editor overlay. Returns HTML with classed spans.
// Not a full parser; good enough for readable highlighting without a heavy dependency.
// Handles Python (# comments) and C-family (// and /* */ comments, preprocessor lines).

import { CodeLang } from "../store";

const PY_KW = new Set(
  "def return if elif else for while in and or not None True False break continue pass import from as class with try except finally lambda yield global nonlocal del is raise assert async await".split(
    " "
  )
);
const C_KW = new Set(
  "auto int long short char bool void float double unsigned signed const static struct class public private return if else for while do break continue switch case default new delete using namespace template typename this null nullptr true false void import package static final void boolean String new extends implements public private protected class interface void".split(
    " "
  )
);
const BUILTIN = new Set(
  "len range enumerate sorted set dict list tuple min max sum abs map filter zip reversed any all print isinstance ord chr round heapq deque Counter defaultdict vector string cout cin endl printf scanf malloc free System out println Arrays List Map HashMap ArrayList".split(
    " "
  )
);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlight(code: string, lang: CodeLang = "python"): string {
  const py = lang === "python";
  const KW = py ? PY_KW : C_KW;
  // token regex: comments (language-specific), strings, numbers, identifiers
  const comment = py ? `(#.*$)` : `(//.*$|/\\*[\\s\\S]*?\\*/|^\\s*#\\s*\\w+.*$)`;
  const re = new RegExp(`${comment}|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')|(\\b\\d+\\.?\\d*\\b)|([A-Za-z_]\\w*)`, "gm");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const tok = m[0];
    if (m[1]) out += `<span class="t-com">${esc(tok)}</span>`;
    else if (m[2]) out += `<span class="t-str">${esc(tok)}</span>`;
    else if (m[3]) out += `<span class="t-num">${tok}</span>`;
    else if (m[4]) {
      if (KW.has(tok)) out += `<span class="t-kw">${tok}</span>`;
      else if (BUILTIN.has(tok)) out += `<span class="t-bi">${tok}</span>`;
      else out += tok;
    }
    last = m.index + tok.length;
  }
  out += esc(code.slice(last));
  return out;
}
