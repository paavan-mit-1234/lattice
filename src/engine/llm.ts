// Real LLM credit assignment. Replaces the heuristic in diagnose.ts when a provider + key are
// configured. Same Diagnosis contract, so callers fall back to the heuristic on any failure
// (no key, network/CORS error, malformed JSON). Candidate skills are constrained to the item's
// tagged KCs plus prerequisites so the model cannot invent skills.
//
// Supports Anthropic, Google Gemini, and any OpenAI-compatible endpoint (OpenRouter, Groq,
// Together, etc). All calls go directly from the browser using a user-supplied key. That is fine
// for a personal/dogfood tool but NOT production: a real deployment proxies through a server so
// the key never reaches the client.

import { kcBySlug, prereqsOf } from "../data/seed";
import { Diagnosis, FailContext } from "./diagnose";

export type Provider = "anthropic" | "gemini" | "openai";
export type LlmCfg = { provider?: Provider; key: string; model: string; baseUrl?: string };

const SYS =
  "You are the diagnostic engine of a programming tutor. A student's Python solution FAILED a test. " +
  "Identify which ONE knowledge component (skill) most likely caused the failure. You MUST pick a slug " +
  'from the candidate list, or "unattributed" if the failure does not localize to a single skill (a ' +
  "trivial typo, or diffuse confusion). Never reveal or write the correct solution. " +
  "Respond with ONLY a JSON object and no other text, of the form " +
  '{"failed_kc": string, "confidence": number, "evidence": string, "fault_line": number|null, "secondary": string[], "conceptual": boolean}.';

function buildUserPrompt(ctx: FailContext, candList: string): string {
  const { item } = ctx;
  return `PROBLEM: ${item.title}
${item.prompt}

CANDIDATE SKILLS (failed_kc must be one of these slugs, or "unattributed"):
${candList}

STUDENT CODE:
\`\`\`python
${ctx.code}
\`\`\`

FIRST FAILING TEST:
args = ${JSON.stringify(ctx.failedArgs)}
expected = ${JSON.stringify(ctx.expected)}
actual = ${ctx.actual ?? "null"}
error = ${ctx.error ?? "none"}

Reply with ONLY the JSON object.`;
}

async function callAnthropic(cfg: LlmCfg, user: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: cfg.model, max_tokens: 400, system: SYS, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error("anthropic " + res.status);
  const data = await res.json();
  return data?.content?.[0]?.text ?? "";
}

async function callGemini(cfg: LlmCfg, user: string): Promise<string> {
  const base = cfg.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const res = await fetch(`${base}/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYS }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 600, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error("gemini " + res.status);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callOpenAICompatible(cfg: LlmCfg, user: string): Promise<string> {
  const base = cfg.baseUrl || "https://openrouter.ai/api/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 600,
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error("openai " + res.status);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

export async function llmDiagnose(ctx: FailContext, cfg: LlmCfg): Promise<Diagnosis | null> {
  if (!cfg.key) return null;
  const { item } = ctx;

  const candidates = new Set<string>();
  for (const k of item.kcs) {
    candidates.add(k.slug);
    for (const p of prereqsOf(k.slug)) candidates.add(p);
  }
  const candList = [...candidates].map((s) => `- ${s}: ${kcBySlug(s).blurb}`).join("\n");
  const user = buildUserPrompt(ctx, candList);
  const provider = cfg.provider || "anthropic";

  try {
    let text: string;
    if (provider === "gemini") text = await callGemini(cfg, user);
    else if (provider === "openai") text = await callOpenAICompatible(cfg, user);
    else text = await callAnthropic(cfg, user);

    text = (text || "").trim();
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const json = JSON.parse(match ? match[0] : cleaned);

    let slug: string | null = json.failed_kc === "unattributed" ? null : String(json.failed_kc);
    if (slug && !candidates.has(slug)) slug = item.kcs[0].slug; // clamp invented slugs
    return {
      kcSlug: slug,
      confidence: Math.max(0, Math.min(1, Number(json.confidence) || 0.5)),
      evidence: String(json.evidence || "Model returned no evidence."),
      faultLine: json.fault_line == null ? null : Number(json.fault_line),
      secondary: Array.isArray(json.secondary) ? json.secondary.filter((s: string) => candidates.has(s)) : [],
      conceptual: !!json.conceptual,
      source: "llm",
    };
  } catch {
    return null;
  }
}
