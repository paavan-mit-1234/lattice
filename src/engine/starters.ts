// Per-language starter templates. Python uses the authored starter (and runs in-browser).
// C/C++/Java are write-and-study scaffolds: in-browser execution of compiled languages is not
// available (no free judge), so these give a sensible skeleton with the problem's parameter names
// rather than a typed harness. Types are left to the learner since they vary per problem.

import { CodeLang } from "../store";
import { Item } from "../data/seed";

function params(item: Item): string {
  const m = item.starter.match(/def\s+\w+\s*\(([^)]*)\)/);
  return m ? m[1].trim() : "";
}

export function starterFor(item: Item, lang: CodeLang): string {
  if (lang === "python") return item.starter;
  const p = params(item);
  const note = `// ${item.title}\n// parameters: ${p || "see prompt"}\n`;

  if (lang === "cpp") {
    return (
      `#include <bits/stdc++.h>\n` +
      `using namespace std;\n\n` +
      note +
      `// pick the real return/param types for this problem.\n` +
      `auto ${item.funcName}(/* ${p} */) {\n` +
      `    // your solution\n` +
      `}\n`
    );
  }
  if (lang === "java") {
    return (
      `import java.util.*;\n\n` +
      `class Solution {\n` +
      `    ${note.replace(/\n/g, "\n    ")}` +
      `    // pick the real return/param types for this problem.\n` +
      `    static Object ${item.funcName}(/* ${p} */) {\n` +
      `        // your solution\n` +
      `        return null;\n` +
      `    }\n` +
      `}\n`
    );
  }
  // c
  return (
    `#include <stdio.h>\n` +
    `#include <stdlib.h>\n\n` +
    note +
    `// pick the real return/param types for this problem.\n` +
    `/* returnType */ ${item.funcName}(/* ${p} */) {\n` +
    `    // your solution\n` +
    `}\n`
  );
}

export const LANG_LABEL: Record<CodeLang, string> = { python: "PY", c: "C", cpp: "C++", java: "JAVA" };
export const RUNNABLE: Record<CodeLang, boolean> = { python: true, c: false, cpp: false, java: false };
