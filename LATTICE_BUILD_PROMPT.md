# BUILD SPEC: "LATTICE" — an adaptive, model-driven tutor for Data Structures & Algorithms

> Paste this entire document to your coding agent as the build brief. It is intentionally
> opinionated and complete. Where it says MUST, treat it as a hard constraint. Where it says
> SHOULD, deviate only with a stated reason. "LATTICE" is a working codename; rename freely.

## COVER NOTE (read first, then read the whole spec before writing code)

You are starting cold, so here is the context you need. LATTICE is a tutor for Data Structures and
Algorithms aimed at programmers preparing for interviews. The thing that makes it worth building,
and the thing you must not lose sight of, is a real per-learner model of skill mastery plus the
ability to diagnose which specific skill failed when someone gets a problem wrong. A chat box
wrapped around an LLM is explicitly not the product; if you find yourself building one, stop and
re-read section 1. The intellectual lineage is Intelligent Tutoring Systems and Bayesian Knowledge
Tracing, made newly practical because an LLM can now read buggy code and attribute the failure to a
skill, which previously required hand-authored bug libraries. Three rules dominate everything else:
the code sandbox must be securely isolated from line one (section 2.4), the UI must obey the
prohibitions in section 3.2 without exception, and you build the Phase 1 vertical slice end to end
and then stop for review before going further (section 6). Read sections 1 through 7 in full before
you write anything. When something is ambiguous, ask rather than invent scope.

You are building a real product, not a demo. The differentiator is not the chat box. It is a
genuine model of what a specific learner does and does not know, and the ability to diagnose
*which underlying skill* failed when they get a problem wrong. Build accordingly.

---

## 0. ONE-PARAGRAPH SUMMARY

LATTICE is a deliberate-practice tutor for Data Structures & Algorithms. It maintains a live,
per-user probabilistic model of mastery over a graph of fine-grained skills (knowledge
components). When a learner submits code, the system auto-grades it by execution, and on failure
an LLM performs credit assignment: it reads the actual code and the failing test and infers which
specific skill broke, with a confidence score and cited evidence. That signal updates the mastery
model, which in turn schedules the next problem at the edge of the learner's competence (the
"frontier"). The product proves it works by measuring learning gain against a baseline.

---

## 1. PRD (PRODUCT REQUIREMENTS)

### 1.1 Problem
Existing coding-practice tools (LeetCode, flashcard apps, generic AI tutors) track a single bit
per problem: solved or not solved. That is almost useless for learning, because a hard problem
exercises several skills at once, and "wrong" tells you nothing about which one failed. Learners
grind problems without a model of their own gaps, repeat what they already know, and avoid what
they should be practicing. There is no widely available tool that (a) models skill mastery at fine
granularity, (b) attributes failure to a specific skill, and (c) schedules practice against that
model.

### 1.2 Why now
Intelligent Tutoring Systems have chased Bloom's "2 sigma" result (one-to-one tutoring moves the
average learner to the 98th percentile) since the 1990s. They never scaled because building the
skill graph and tagging every problem to skills required armies of domain experts, and because
attributing a wrong answer to a skill required hand-authored bug libraries. LLMs collapse both
costs: they can decompose a domain into knowledge components, tag content, and read a learner's
buggy code to infer the failed skill. That is the enabling shift this product is built on.

### 1.3 Target users
Primary: motivated programmers preparing for technical interviews or strengthening DSA. Secondary:
self-taught developers and students. The builder is in the primary audience (dogfood daily).

### 1.4 v1 scope (the wedge). MUST stay this narrow.
- Domain: Data Structures & Algorithms only.
- Submission language: Python only.
- Skill coverage at first content pass: arrays, two-pointers, sliding window, hashing, binary
  search, stacks/queues, linked lists, trees/BST, recursion, and one DP slice. Roughly 30 to 50
  knowledge components, not hundreds.
- Single learner per account. No social features, no leaderboards, no marketplace.

### 1.5 Explicit non-goals
- Not a full online IDE or a LeetCode clone. The problem set is curated and skill-tagged, not a
  giant unstructured bank.
- Not a chatbot you converse with freely. The LLM is used for diagnosis and content generation,
  not open chat. (A constrained "explain this diagnosis" follow-up is allowed.)
- It models the learner's *skills*, never makes claims about the person. No psychometric or
  demographic profiling.
- No multi-language submissions, no mobile app, no real-time collaboration in v1.

### 1.6 Goals and success metrics
The headline metric is learning efficiency, and measuring it is a first-class feature, not an
afterthought.
- Calibration: the model's predicted P(correct on next attempt of a KC) MUST be measured against
  actual outcomes (reliability diagram). Target: well-calibrated within plus or minus 0.1 across
  bins after sufficient data.
- Learning gain: time-to-mastery per KC under the adaptive scheduler vs a fixed spaced-repetition
  baseline, measured via an A/B assignment. Target direction: adaptive reaches mastery in fewer
  attempts.
- Engagement proxy: median session has the learner working at the frontier (success rate in the
  0.65 to 0.85 "desirable difficulty" band), not too easy and not crushing.
- Honesty metric: fraction of failed attempts where credit assignment confidently named a KC vs
  fell back to "unattributed". Track it; do not hide it.

### 1.7 The core loop (one sentence)
Pick the highest-value problem at the learner's frontier, let them solve it, grade by execution,
diagnose the failed skill on failure, update the mastery model, schedule decay and review, repeat.

---

## 2. TRD (TECHNICAL REQUIREMENTS)

### 2.1 High-level architecture
Five logical components. They MAY share a process in early phases but MUST be cleanly separated by
module boundary.

1. API service (FastAPI): auth, item delivery, attempt intake, reads of mastery state.
2. Grader / sandbox: executes submitted Python against hidden + visible test cases under strict
   isolation. Returns per-test pass/fail, stdout/stderr, runtime.
3. Credit-assignment service (LLM gateway): on failure, produces a structured diagnosis naming the
   failed knowledge component. Also runs the offline content-generation pipelines.
4. Mastery engine (ML): maintains per-user, per-KC posteriors. BKT first, DKT/SAKT later, behind a
   `model_variant` switch so both can run and be compared.
5. Scheduler: selects the next item from the item bank given mastery state, the KC graph, and the
   review queue.

A queue (Redis in local dev, SQS-compatible in cloud) decouples submission intake from grading and
diagnosis, which are slow.

### 2.2 The knowledge component (KC) graph
- A directed acyclic graph. Nodes are fine-grained skills (for example: `sliding-window/shrink`,
  `binary-search/boundary`, `hashmap/frequency-count`). Edges are prerequisite relations
  (`arrays/indexing` precedes `two-pointers/convergent`).
- v1 graph: hand-seed about 30 to 50 nodes, then expand with an LLM-assisted pipeline that a human
  reviews. The graph is versioned (see schema). Never silently mutate a live graph.
- Layer depth (topological rank) is precomputed and stored; the UI lays the graph out by depth.

### 2.3 Item bank
- Each item: a problem statement, difficulty, a canonical solution, a set of test cases (visible
  and hidden), and a weighted mapping to the KCs it exercises.
- KC tagging is LLM-assisted then human-spot-checked. Tag weights express how central each KC is to
  the item.
- Items have a lifecycle status (`draft`, `review`, `live`, `retired`). Only `live` items are
  served.

### 2.4 Grading (sandbox). Security is non-negotiable.
Executing arbitrary user code is the single most dangerous part of this system. The grader MUST:
- Run each submission in an ephemeral, isolated container or microVM (Docker per-run in local dev;
  prefer gVisor/nsjail/Firecracker semantics in cloud).
- Run as a non-root user, with no network access, a hard wall-clock timeout (for example 5s), a CPU
  limit, and a memory cap.
- Apply a seccomp/syscall restriction profile. Never mount host paths writable. Destroy the
  container after each run.
- Treat all submission output as untrusted text. Never `eval` it in the host.
Return: per-test {passed, actual, stderr, runtime_ms}, plus an aggregate verdict.

### 2.5 Credit assignment (the centerpiece)
On a failed attempt, call the LLM with a strict contract. Constrain the candidate KCs to the
item's tagged KCs plus their immediate prerequisites, so the model cannot invent skills.

Input to the model:
- problem statement, the item's tagged KCs (with short descriptions), the learner's submitted
  code, and the first failing test (input, expected, actual, stderr).

Required JSON output (validate against schema; reject and retry on malformed):
```
{
  "failed_kc_slug": "sliding-window/shrink" | "unattributed",
  "confidence": 0.0,
  "evidence": "off-by-one in the window-shrink condition; loop keeps left fixed when sum exceeds target",
  "fault_line": 14,
  "secondary_kc_slugs": ["arrays/indexing"],
  "is_conceptual": true
}
```
Rules:
- If the failure does not pin to a single KC (diffuse problem-solving failure, or a trivial typo),
  return `unattributed`. A graceful "unattributed" is correct behavior, not a bug. Do not force a
  guess.
- Cache by (item_id, sha256(normalized_code)). Identical resubmissions MUST NOT re-bill the LLM.
- Persist the raw model response and the model/prompt version for every diagnosis (auditability and
  later eval).

### 2.6 Mastery engine
Phase A baseline (ship first): Bayesian Knowledge Tracing per KC. Parameters per KC:
`p_init` (prior mastery), `p_transit` (learn rate), `p_slip` (knows but errs), `p_guess` (does not
know but succeeds). Maintain an online posterior `p_mastery` updated on each observation. An
observation is "exercised KC k, outcome correct/incorrect", where incorrect observations are
weighted by the credit-assignment confidence (a low-confidence diagnosis updates the named KC
weakly).

Phase B upgrade: a Deep Knowledge Tracing model (DKT or a SAKT-style transformer) over the
sequence of (kc, correct) events, trained on accumulated interaction logs, served from a
checkpoint. Expose both via `model_variant` so they can run side by side and be compared on
calibration. Keeping the interpretable baseline is deliberate: it is the control in your eval.

Mastery decay: each KC's posterior decays over time toward uncertainty unless refreshed, which is
what drives spaced review.

### 2.7 Scheduler
Select the next item to maximize expected learning at the frontier.
- The frontier = KCs whose prerequisites are already largely mastered but which are themselves not
  yet mastered.
- Prefer items whose central KC is on the frontier and whose predicted success probability for this
  learner sits in the desirable-difficulty band (roughly 0.65 to 0.85). Avoid items that are almost
  certainly trivial or almost certainly too hard.
- Interleave due reviews (decayed KCs) from the review schedule.
- Avoid repeating the same item until its review is due.

### 2.8 Evaluation harness (first-class requirement)
- Log every mastery update to a history table (time series).
- Provide offline analysis (notebooks or a small reporting service) computing: reliability diagram
  (calibration), per-KC learning curves, time-to-mastery distribution, and an A/B comparison of the
  adaptive scheduler vs a fixed spaced-repetition baseline using the cohort assignment in the
  schema.
- Surface a subset of these as an in-app "Instruments" screen (see UI). This screen is part of the
  product, not just internal tooling, because measuring your own learning is a feature the target
  user wants.

### 2.9 Tech stack
- Backend: Python 3.11, FastAPI, SQLAlchemy 2.x, Alembic migrations, Pydantic v2 for all
  contracts. Postgres as the system of record. Redis for queue + cache in local dev.
- ML: NumPy/SciPy for BKT; PyTorch for DKT/SAKT. Keep model serving behind a thin interface so the
  variant switch is trivial.
- LLM: provider-agnostic gateway module with prompt caching, JSON-schema-validated outputs,
  retries, and a recorded model/prompt version on every call.
- Frontend: React + Vite + TypeScript. Build the design system from scratch with plain CSS or
  Tailwind with a fully custom token set. MUST NOT pull a component library that imposes its own
  visual defaults (no Material UI; no default-themed shadcn; if Tailwind is used, set
  `borderRadius` defaults to 0 and define a custom palette). State via a small store (Zustand is
  fine). A real code editor component (CodeMirror 6) for submissions, themed to the design below.
- Observability: structured logging; optional OpenTelemetry instrumentation on the API and grader.
- Local-first dev: the entire vertical slice MUST run with `docker compose up` plus a dev server,
  no cloud dependency.

---

## 3. UI / UX DESIGN

> Read this whole section before writing any component. The aesthetic is specific and the
> prohibitions are hard. The goal is an instrument, not an app: something that looks like a piece of
> lab equipment or an engineering notebook, calm and information-dense, that a serious person trusts.

### 3.1 Concept
"Instrument-grade engineering notebook." References: an oscilloscope readout, a printed lab
logbook, aviation instrument labeling, Teenage Engineering device silkscreen. Calm, dense, precise,
monochrome with one signal color. Keyboard-first. The learner's knowledge is rendered as a physical
lattice that fills in, like ink on graph paper.

### 3.2 HARD PROHIBITIONS (do not ship any of these)
- No purple, no violet, no indigo, no blue-to-pink gradients. No gradients at all except a single
  flat duotone if ever needed.
- No rounded corners anywhere. Border-radius is 0 on every element: buttons, inputs, cards,
  tags, images, avatars. Avatars are square monogram tiles, never circles.
- No emoji anywhere, in UI or copy.
- No em dashes in any copy. Use periods, colons, or parentheses.
- No left sidebar navigation. No hamburger drawer.
- No soft blurred drop shadows, no glassmorphism, no frosted blur, no neumorphism.
- No pill-shaped badges, no gradient buttons, no glowing call-to-action.
- No cheerful mascot, no confetti, no "Great job!!" copy, no exclamation marks in feedback.
- No generic stock illustration, no 3D blobs, no isometric clipart.

### 3.3 Color
Two themes. "Paper" (light) is default; "Console" (dark) is a toggle. Mastery is NEVER shown as a
hue rainbow; it is shown as fill density on a monochrome ramp.

Paper (light):
- Background (canvas): `#ECE7DB` (warm bone)
- Surface (panels): `#F5F1E8`
- Ink (primary text/lines): `#1A1915`
- Muted ink (secondary): `#6C685E`
- Hairline (borders/grid): `#C8C2B2`
- Signal (the only accent, used sparingly for "live"/frontier/active): `#E0451C` (vermilion)
- Stable-mastery fill (optional, used small): `#1E5848` (ink teal)

Console (dark):
- Background: `#131310`
- Surface: `#1C1B16`
- Ink: `#E9E4D6`
- Muted ink: `#8A8576`
- Hairline: `#34322A`
- Signal: `#F2521E`
- Stable-mastery fill: `#2E7A63`

Usage rules: the signal color appears on roughly 5 percent of the screen at most. It marks the
frontier, the active item, the diagnosed fault line. Everything else is ink on paper. Mastery level
inside a KC node is a 5-step monochrome density ramp (empty, 25, 50, 75, full ink fill), like a
battery or an ink gauge.

### 3.4 Typography
- Display and UI sans: "Schibsted Grotesk" (distinctive, free on Google Fonts), fallback to a
  system neo-grotesque. Tight tracking on large sizes.
- Data, numerals, labels, code, gauges: "IBM Plex Mono". All numbers in the UI are monospace and
  tabular-aligned.
- Micro-labels: ALL CAPS, mono, small (about 11px), wide letter-spacing (about 0.12em). These label
  every panel and gauge, like silkscreen on an instrument (for example `MASTERY`, `FRONTIER`,
  `STREAK`, `CONFIDENCE`).
- Type scale (suggested, px): 11 micro-label, 13 body-small, 15 body, 19 subhead, 28 section, 44
  data-hero. No fluffy oversized hero marketing type.
- MUST NOT use Inter, Geist, Poppins, or Nunito (the slop defaults).

### 3.5 Layout
- No sidebar. A fixed top instrument bar spans the width: left is a square monogram tile plus the
  wordmark in mono caps; center is a row of section tabs (square, active tab marked by a 2px ink
  underline rule, never a pill or highlight fill); right is the command-palette trigger and a
  compact session/status readout.
- Keyboard-first. Cmd/Ctrl-K opens a command palette that is the primary means of navigation and
  action. Every primary action has a documented shortcut, shown in the palette in mono.
- Content is composed of modular panels on a visible 8px base grid. Panels are divided by 1px
  hairlines, never by shadow. Each panel carries a top-left mono caps label with an index, like
  `01 / FRONTIER`, `02 / SESSION`, `03 / DIAGNOSIS`. This indexing is part of the identity.
- The canvas carries a very low-contrast graph-paper grid (hairline at about 6 percent opacity).
- Density is a feature. Prefer showing more true information compactly over airy whitespace.

### 3.6 The signature screen: the LATTICE
The home view is the learner's knowledge state rendered as a literal lattice.
- Each KC is a square node. Inside the square, a monochrome fill shows mastery (the 5-step ramp).
- Nodes are arranged left to right (or top to bottom) by prerequisite depth. Prerequisite edges are
  thin hairlines.
- Frontier nodes (next reachable skills) are outlined in the signal color. Decaying nodes show a
  small hatch overlay.
- Hover or focus a node to see its label, current P(mastery) as a mono number, last practiced time,
  and a "PRACTICE THIS" action.
- The lattice updates mechanically after each attempt: the relevant square's fill ticks up or down
  in a single stepped transition. No springy animation.

### 3.7 The practice screen
Three panels:
- `01 / PROBLEM`: statement in clean prose, mono for any code/IO examples, the target KC shown as a
  square tag in the corner.
- `02 / EDITOR`: CodeMirror, ink on paper, line numbers in mono, no rounded gutter. On a diagnosed
  failure the fault line gets a 2px signal-color gutter mark.
- `03 / READOUT`: the grader result and, on failure, the diagnosis, styled as a printed fault
  report (see component below).

### 3.8 Signature component: the FAULT REPORT
When credit assignment returns, render a printed-readout card:
- A header strip in ink with mono caps: `FAULT REPORT`.
- The inferred KC as a square tag, the evidence sentence in body text, the failing test shown as a
  small mono table (input / expected / actual), and confidence as a horizontal mono bar with the
  numeric value (for example `CONFIDENCE 0.78`).
- If `unattributed`, say so plainly: `KC: UNATTRIBUTED. Failure did not localize to a single skill.`
- Copy is terse and diagnostic. Example: `FAULT: off-by-one in window-shrink condition. KC:
  sliding-window/shrink. The window never contracts when the running sum exceeds the target.` No
  encouragement, no apology. The reward is the lattice filling, not a compliment.

### 3.9 Other screens
- `INSTRUMENTS` (the eval/insights screen): calibration reliability diagram, mastery-over-time
  lines, time-to-mastery, success-rate band. Plotted as spare technical charts: hairline axes, mono
  tick labels, ink lines, signal only for the highlighted series. No chart-library default
  rounded-bar candy.
- `REVIEW`: the due-for-retrieval queue, as a dense mono table.
- `SETTINGS`: theme toggle (Paper/Console), model variant toggle (BKT/DKT) exposed for the curious,
  data export, sound toggle.

### 3.10 Motion and tone
- Motion is mechanical and terse: transitions 80 to 140ms, linear or ease-out only. No spring, no
  bounce, no parallax. State changes feel like a relay ticking, not a bubble popping.
- Numeric gauges may count up in discrete ticks.
- Optional and off by default: subtle mechanical tick sounds on submit and on lattice update.
- Voice and copy throughout: precise, technical, honest, lowercase-friendly, no exclamation, no
  emoji, no em dashes. The product respects the user's intelligence.

### 3.11 Accessibility
- Do not encode meaning in color alone. Mastery is fill density (works in grayscale); frontier
  state also carries an outline and a tag, not just the signal hue.
- Maintain WCAG AA contrast for text on both themes. Full keyboard operability (it is keyboard-first
  by design). Respect `prefers-reduced-motion` by disabling the ticks.

---

## 4. APP FLOW

### 4.1 First run (placement / calibration)
1. Minimal account creation (handle only in v1; local persistence acceptable for the slice).
2. Short adaptive placement: the scheduler selects items by expected information gain to seed
   priors, not a long fixed quiz. About 8 to 12 items. The learner may skip ("I have not learned
   this yet") which itself updates priors.
3. On completion the lattice renders with initial fills. The user lands on the lattice home.

### 4.2 The core practice loop
1. From the lattice home or `START SESSION`, the scheduler picks the next item at the frontier.
2. Practice screen opens with the problem and editor. Target KC is shown.
3. User writes Python and submits (Cmd/Ctrl-Enter).
4. Submission is queued, run in the sandbox against tests. Live "running" state in the readout.
5. On pass: confirm the KCs exercised, update posteriors upward, tick the lattice, schedule future
   review/decay, advance to the next item.
6. On fail: the first failing test is shown immediately; in parallel the credit-assignment service
   produces a diagnosis. The fault report renders, the fault line is marked, the named KC's
   posterior updates downward (weighted by confidence), the lattice ticks. The user may retry the
   same item or accept the diagnosis and move on. An optional "explain this diagnosis" follow-up is
   available (constrained LLM call, not open chat).
7. Loop continues until the user ends the session. A terse session summary is recorded (items, KCs
   touched, net mastery change).

### 4.3 Review flow
Decayed KCs surface in the `REVIEW` queue. Reviews are interleaved into normal sessions by the
scheduler and also reachable directly. Successful review refreshes the posterior and pushes the
next review out; failure pulls it in and may trigger diagnosis.

### 4.4 Insights flow
The `INSTRUMENTS` screen is always available and updates as data accrues. Early on it honestly
shows "insufficient data" states rather than fabricating curves.

---

## 5. BACKEND SCHEMA (Postgres)

> SQLAlchemy 2.x + Alembic. UUID primary keys. `created_at`/`updated_at` on mutable tables. All
> timestamps timezone-aware UTC. Money/probabilities as `double precision` or `numeric` as noted.
> Indexes called out where they matter.

### 5.1 Identity
- `users`: `id` (uuid pk), `handle` (text unique), `created_at`, `settings` (jsonb: theme,
  model_variant, sound). v1 auth is minimal; design the table so real auth slots in later.

### 5.2 Knowledge model (versioned)
- `kc_graph_versions`: `id` (uuid pk), `version` (int), `created_at`, `notes`, `is_live` (bool).
- `knowledge_components`: `id` (uuid pk), `graph_version_id` (fk), `slug` (text, for example
  `sliding-window/shrink`), `title`, `description`, `layer_depth` (int, precomputed topo rank),
  `domain` (text). Unique (`graph_version_id`, `slug`).
- `kc_edges`: `id` (uuid pk), `graph_version_id` (fk), `prereq_kc_id` (fk), `dependent_kc_id` (fk),
  `weight` (double). DAG; enforce no cycles in application logic. Index on both fk columns.

### 5.3 Content
- `items`: `id` (uuid pk), `slug`, `title`, `prompt_md` (text), `difficulty` (int 1 to 5),
  `canonical_solution` (text), `lang` (text, "python"), `source` (text), `status` (enum: draft,
  review, live, retired), `created_at`.
- `item_kcs`: `id` (uuid pk), `item_id` (fk), `kc_id` (fk), `weight` (double, centrality of this KC
  to the item). Unique (`item_id`, `kc_id`). Index on `kc_id` (scheduler queries by KC).
- `item_tests`: `id` (uuid pk), `item_id` (fk), `ord` (int), `input` (text), `expected` (text),
  `is_hidden` (bool), `comparator` (text: exact, numeric-tol, set-equal).

### 5.4 Interaction
- `sessions`: `id` (uuid pk), `user_id` (fk), `started_at`, `ended_at` (nullable), `item_count`
  (int), `summary` (jsonb).
- `attempts`: `id` (uuid pk), `user_id` (fk), `item_id` (fk), `session_id` (fk nullable),
  `submitted_code` (text), `code_sha256` (text), `lang` (text), `started_at`, `submitted_at`,
  `verdict` (enum: pass, fail, error, timeout), `runtime_ms` (int), `passed_count` (int),
  `failed_count` (int). Index (`user_id`, `submitted_at`).
- `attempt_test_results`: `id` (uuid pk), `attempt_id` (fk), `item_test_id` (fk), `passed` (bool),
  `actual` (text), `stderr` (text), `runtime_ms` (int).

### 5.5 Diagnosis (credit assignment)
- `diagnoses`: `id` (uuid pk), `attempt_id` (fk), `inferred_kc_id` (fk nullable; null means
  unattributed), `confidence` (double), `is_conceptual` (bool), `fault_line` (int nullable),
  `evidence` (text), `secondary_kc_ids` (uuid[]), `raw_response` (jsonb), `model_version` (text),
  `prompt_version` (text), `created_at`. Index on `attempt_id`.
- `diagnosis_cache`: `id` (uuid pk), `item_id` (fk), `code_sha256` (text), `diagnosis_id` (fk).
  Unique (`item_id`, `code_sha256`). Avoids re-billing identical resubmissions.

### 5.6 Mastery
- `mastery_states`: `id` (uuid pk), `user_id` (fk), `kc_id` (fk), `model_variant` (enum: bkt, dkt),
  `p_mastery` (double 0 to 1), `n_observations` (int), `last_updated`, `decay_at` (timestamp; when
  this posterior should be considered stale). Unique (`user_id`, `kc_id`, `model_variant`). This is
  the current-state table the UI reads.
- `mastery_history`: `id` (uuid pk), `user_id` (fk), `kc_id` (fk), `model_variant` (enum),
  `p_mastery` (double), `attempt_id` (fk nullable), `observed_at`. Append-only time series for eval
  and the lattice timeline. Index (`user_id`, `kc_id`, `observed_at`).
- `bkt_params`: `id` (uuid pk), `kc_id` (fk), `p_init`, `p_transit`, `p_slip`, `p_guess` (all
  double). Per-KC BKT parameters (start with sane defaults, fit later).

### 5.7 Scheduling
- `review_schedule`: `id` (uuid pk), `user_id` (fk), `kc_id` (fk), `due_at` (timestamp),
  `interval_hours` (double), `ease` (double). Unique (`user_id`, `kc_id`). Index on `due_at`.

### 5.8 Evaluation
- `experiment_assignments`: `id` (uuid pk), `user_id` (fk), `experiment` (text, for example
  "scheduler-v1"), `cohort` (text: adaptive, baseline), `assigned_at`. Drives the A/B.
- `eval_snapshots` (optional): periodic rollups of calibration and learning-gain metrics for fast
  reads on the INSTRUMENTS screen.

### 5.9 LLM provenance
- `llm_calls`: `id` (uuid pk), `purpose` (text: diagnosis, kc-gen, item-tag), `model` (text),
  `prompt_version` (text), `input_tokens`, `output_tokens`, `cached` (bool), `latency_ms`,
  `created_at`. For cost/audit; reference from `diagnoses` via `model_version`.

---

## 6. IMPLEMENTATION PLAN

> Build the smallest end-to-end loop first so the core feeling is real before scaling content or
> models. Each phase lists deliverables and acceptance criteria. Do not start a later phase until
> the prior phase's acceptance criteria pass.

### Phase 0: Scaffold (foundation)
Deliverables: monorepo (`api/`, `grader/`, `ml/`, `web/`, `infra/`), `docker compose` for Postgres
+ Redis, Alembic baseline migration for the full schema above, CI running lint + a smoke test,
frontend design tokens (colors, type, spacing, the 0-radius rule) wired before any component.
Acceptance: `docker compose up` brings up Postgres + Redis; migrations apply; the web app renders a
themed empty shell (instrument bar, graph-paper canvas, Paper/Console toggle) with zero rounded
corners and zero prohibited patterns.

### Phase 1: Vertical slice (the "feel it" loop). Highest priority.
Deliverables:
- Hand-seed a tiny KC graph (about 12 nodes: arrays/indexing, two-pointers/convergent,
  sliding-window/expand, sliding-window/shrink, hashing/frequency, binary-search/boundary, plus
  prerequisites).
- Author about 15 items with visible + hidden tests and KC tags.
- Grader: Docker-per-run sandbox executing Python with timeout, no network, non-root, memory cap;
  returns per-test results.
- Mastery: BKT with default params; online update on each observation.
- Credit assignment: one LLM call with the strict JSON contract and schema validation, constrained
  to the item's KCs plus prerequisites, with the unattributed fallback and the (item, code-hash)
  cache.
- UI: the lattice home (12 nodes with fill), the practice screen (problem + CodeMirror + readout),
  and the fault report component.
Acceptance: a learner can open a frontier problem, submit Python, get an execution verdict, and on
failure see a fault report that names a plausible failed KC with evidence and a marked fault line,
and watch the corresponding lattice node tick down. On success the node ticks up. End to end, local,
no cloud.

### Phase 2: Scheduler, placement, review
Deliverables: the frontier-aware scheduler with the desirable-difficulty band; the adaptive
placement flow; mastery decay and the review queue with interleaving; the session summary.
Acceptance: a fresh user completes placement and gets a sensible initial lattice; subsequent
sessions serve problems concentrated at the frontier (measurable success rate in the target band);
decayed KCs resurface for review.

### Phase 3: Content scale-up
Deliverables: LLM-assisted pipelines to (a) expand the KC graph to 30 to 50 nodes with reviewed
prerequisite edges, (b) generate and tag items, (c) human spot-check tooling. Graph versioning
exercised.
Acceptance: coverage across the v1 skill list; tagging quality spot-checked at an agreed accuracy
bar; serving only `live` items.

### Phase 4: Deep model + eval (the research flex)
Deliverables: a DKT/SAKT model trained on accumulated interaction logs, served behind the
`model_variant` switch; the INSTRUMENTS screen with calibration reliability diagram, learning
curves, and time-to-mastery; the A/B harness using `experiment_assignments` comparing adaptive vs
fixed spaced-repetition baseline.
Acceptance: both model variants run and are compared on calibration over real logs; INSTRUMENTS
renders truthful charts (including honest "insufficient data" states); the A/B produces a directional
learning-gain result with the methodology written down.

### Phase 5: Hardening and deploy
Deliverables: real persistence and account handling; sandbox hardening review; rate limiting and
LLM cost controls; optional cloud deploy reusing a production-shaped pattern; OpenTelemetry
instrumentation on API and grader.
Acceptance: a stranger can use it without breaking the sandbox; costs are bounded; a deploy runbook
exists; teardown is documented.

---

## 7. INSTRUCTIONS TO THE AGENT (read before coding)
- Implement Phase 1 fully and stop for review before Phase 2. Do not scaffold all phases at once.
- Treat the sandbox security requirements in 2.4 as non-negotiable from the first line of grader
  code. Never execute untrusted code outside isolation, not even "temporarily".
- Treat the UI prohibitions in 3.2 as hard constraints. Before declaring any screen done, re-read
  3.2 and confirm none are present.
- Keep the LLM strictly in its two roles (diagnosis, content generation). Do not add a freeform
  chat surface.
- Every LLM output that drives state MUST be schema-validated; reject and retry on malformed JSON;
  persist provenance.
- Ask for clarification rather than inventing scope. State assumptions explicitly in code comments
  where you must assume.
- Write the eval harness as you go, not at the end. Logging mastery history starts in Phase 1.
