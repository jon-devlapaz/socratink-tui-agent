# AGENTS.md

Socratink TUI — founder-facing terminal product lab for evidence-weighted
adaptive learning. SEDA (Staged Event-Driven Architecture) pattern with an
append-only event log as the state machine.

Harness substrate contract (layers, invariants, Moss mapping): `HARNESS.md`.
V-model traceability map for agents (requirements ↔ verification tiers): `HARNESS-TRACEABILITY.md`.
Product vocabulary (glossary only): `CONTEXT.md`.

## Doc map (one owner per concern)

| Concern | Owner | Others should |
| --- | --- | --- |
| Throughline, graph honesty, agent tasks | this file | Link here; do not restate routing rules |
| Product vocabulary | `CONTEXT.md` | Glossary only — no implementation or test commands |
| Substrate invariants, Moss map, observability | `HARNESS.md` | Link inward; no release ladder duplication |
| V-model tiers, release ladder, merge checklist | `HARNESS-TRACEABILITY.md` | Executable gates only — not pedagogy or graph-honesty lists |
| Human onboarding | `README.md` | Point to spine + release ladder; no architecture depth |

**Fast spine gate:** `./scripts/check-seda-spine.sh`. **Full release ladder:** `HARNESS-TRACEABILITY.md` § Release ladder.

## Throughline (read before editing)

One story about state — everything else is detail:

```text
Handler turn  →  events.push(fact[s])    append-only, authoritative
              →  derive training          audit (canon); not a router input
              →  phase = nextPhase(events)   pure; the only control-flow owner
```

**Handlers do lane work and append facts. They do not route.** Skipping a step
still emits a fact (e.g. `post_bridge_transfer_skipped`).

### SEDA authority boundaries

Phase/lane selection is exclusively owned by `nextPhase(events)`. Handlers
append facts; they do not choose the next phase.

A handler may append multiple facts in one turn. The routing-relevant fact must
be appended **last** because `nextPhase` reads `events.at(-1)`.

Bridge output is evidence or procedural signal, not graph truth and not an
independent lane router. Bridge may classify, scaffold, judge, generate a
provisional map, or emit route hints, but `nextPhase` owns lane selection.

Do not conflate the three “solid” concepts:

- `evaluation.classification === "solid"` — evaluator evidence (routing input).
- `repair_dialogue_turn.bridge_ready === true` — repair-exit procedural readiness.
- `derived.nodes[].state === "solidified"` — graph truth (derivation only).

Pre-map substrate, repair, help, scaffold, reveal, and model-bridge events are
graph-neutral and not score-eligible.

Graph truth is derived only from score-eligible attempts (`cold_attempt`,
`spaced_redrill`), with spacing and strong spaced re-drill acting as derivation
gates. A `cold_attempt` event co-locates learner `text` and bridge
`evaluation`; treat it as “attempt as interpreted at that time,” not as graph
truth.

| Concern | Owner | Do not |
| --- | --- | --- |
| Control flow | `lib/seda/next-phase.mjs` | Pick the next phase in handlers; add imports to `nextPhase` |
| Runtime facts | `lib/seda/event-facts.mjs` (`eventBuilders`) | Hand-author event shapes in handlers |
| Working scratch | `ctx` — see `lib/seda/ctx.d.ts` | Leave unreconstructable routing state only in `ctx` |
| Dashboard vocabulary | `lib/seda/event-taxonomy.mjs` | Use taxonomy for routing or append sites |
| Product metrics | `lib/observability/dashboard-metrics.mjs` | Duplicate routing state or drive `nextPhase` |
| LLM I/O | `bridge.py` + `prompt_templates.py` | Inline prompts in Node |

Orchestration: `lib/seda/run-loop.mjs` (terminal) and `lib/loop-server/session.mjs`
(hosted — same `nextPhase`; HTTP pacing stops are transport only, not routing).
The hosted session adapter calls `runSedaLoop` and uses `afterHandler` only to
stop at HTTP pacing boundaries after facts have been appended.
Enforced in CI: `tests/js/architecture-fitness.test.mjs`.

**Smallest-change rule:** every diff should trace to one fact type, one router
branch, or one handler lane. If you need a second state machine, stop.

### Agent anti-patterns

- Routing inside handlers without an event `nextPhase` understands
- Using `event-taxonomy` or dashboard metrics for runtime append or routing
- Mutating `events[]` in place (`pop`, `splice`, … — fitness test fails)
- Confusing `substrate_support_exhausted` (pre-map) with `cold_support_exhausted`
  (post-map help cap) — see `CONTEXT.md`
- Refactoring adjacent handlers while fixing an unrelated bug
- Replacing readable `nextPhase` branches with a generic router framework
- Appending telemetry, audit, or closure events **after** the routing fact in a
  handler turn (breaks `nextPhase` because it reads `events.at(-1)`)
- Treating bridge `evaluation` fields as graph truth or independent lane routing

## Closed-loop agent operating model

This repo is designed for closed-loop agentic engineering. Treat every task as a traceable loop:

intent → requirements → design → implementation → verification → validation → feedback

Before implementation, define the success criteria and the evidence path: test, typecheck, lint, eval, trace, browser run, manual review, or explicit rationale. During implementation, make the smallest coherent change that advances the target. After implementation, report the verification evidence and any remaining validation risk.

Classify failures before fixing them. If a test fails, inspect implementation or design. If the system meets the spec but misses the user need, revisit requirements or intent. If a metric improves while quality worsens, treat the evaluator as suspect. Do not retry blindly.

Use minimal durable context. Reference canonical files, ADRs, tests, and examples instead of copying large docs into instructions. Update `AGENTS.md` only when a repeated agent failure reveals a stable repo rule.


## Architecture

```
app.mjs              Thin entry: session bootstrap, prompt I/O, run loop wiring
lib/seda/next-phase.mjs  Pure router: nextPhase(events), DIRECT_PHASE
lib/seda/run-loop.mjs    Phase dispatch loop (handlers passed in; nextPhase owns all transitions)
lib/seda/event-facts.mjs  Runtime append + invariants (`eventBuilders`)
lib/seda/event-taxonomy.mjs  Dashboard canonical projection (read model only)
lib/seda/repair-policy.mjs  Pure repair dialogue ladder policy
lib/seda/handlers/       All phase handlers + HANDLERS map
lib/loop-server/session.mjs  Hosted orchestration (same nextPhase; HTTP pacing stops)
lib/observability/       Read-only dashboard metrics and operator projections
lib/ui/                  Terminal sections and map legend formatters
lib/seda/cold-gating.mjs Cold substantive vs help_request evidence gates
lib/seda/repair-scaffold.mjs  Answer-shaped scaffold rejection (generation before recognition)
lib/seda/study-reveal.mjs     Zero-schema study unlock without model bridge
lib/seda/repair-dialogue-helpers.mjs  Repair turn events, hints, recovery copy (graph-neutral)
lib/seda/repair-recovery-config.mjs    Recovery branch env gate and policy version
lib/seda/prompt-commands.mjs  /help and /hint command detection
lib/seda/training-summary.mjs  Derived training snapshots for handler telemetry
lib/bridge/client.mjs    Bridge subprocess I/O (no routing, no event append)
lib/config/paths.mjs     Workspace/vendor/bridge/python path resolution
lib/canon/               Vendored graph-truth JS (training-store/derive) + checksums
vendor/python/           Vendored LLM seam (ai_service, llm/, models/, app_prompts/)
bridge.py            Python LLM bridge (6 actions, shells out from Node)
prompt_templates.py  Canonical prompt templates (versioned, testable)
dashboard.mjs        Founder dashboard (case summaries, traces)
```

The TUI is **self-contained**: graph-truth canon (`lib/canon/`) and the Python
LLM seam (`vendor/python/`) are vendored from `socratink-app` and synced via
`scripts/sync-canon-from-app.sh`. socratink-app remains the conceptual owner of
graph truth; the TUI holds a checksum-gated mirror (`scripts/check-canon-drift.sh`).

### SEDA Loop

See **Throughline** above. Implementation map:

- `nextPhase(events)` — pure function in `lib/seda/next-phase.mjs`; `DIRECT_PHASE`
  table + special cases (`cold_attempt` classification, `repair_dialogue_turn`
  bridge_ready/escalate/recover/cap). Must not import bridge, handlers, or I/O.
- 15 phase handlers in `HANDLERS` — one handler invocation per loop turn
- `runSedaLoop` dispatches: `handler = HANDLERS[phase]; await handler(...); phase = nextPhase(events)`
- Loop exits when `nextPhase` returns `null` (e.g. after `idle_exit`)

### Python Bridge (bridge.py)

Six actions dispatched from Node via subprocess. Full function catalog (template
versions, I/O schemas, emitted events, `nextPhase` routing fields):
`HARNESS-BRIDGE-REGISTRY.md` / `lib/bridge/registry.json`.

| CLI arg | Function | Template |
|---|---|---|
| `generate-route` | `generate_route()` | delegates to `ai_service` |
| `substrate-gate` | `substrate_gate()` | `TEMPLATES["substrate_gate"]` |
| `evaluate-attempt` | `evaluate_attempt()` | `TEMPLATES["evaluator"]` |
| `repair-scaffold` | `build_repair_scaffold()` | `TEMPLATES["delta"]` |
| `socratic-repair-drill` | `build_socratic_repair_drill()` | `TEMPLATES["socratic_repair_drill"]` |
| `repair-dialogue` | `judge_repair_dialogue()` | `TEMPLATES["repair_dialogue"]` |

## Prompt Engineering

**All LLM prompts MUST go through `prompt_templates.py`.** Never add inline
prompt strings to `bridge.py`. Each template has:

- `version` — track changes (e.g. `socratink-delta-v1`)
- `fixed` — role, task, output_rules (never change per request)
- `dynamic` — `{key}` template slots populated at call time

To add or modify a prompt:
1. Update the template in `prompt_templates.py` (repo root only — `bridge.py` prepends the workspace root to `sys.path`)
2. Bump the version string
3. Run `pytest tests/test_prompt_template.py` (13 tests must pass)
4. Update the corresponding `bridge.py` function if the dynamic slots changed

## Graph Honesty Rules

- **Graph-neutral events**: `substrate_seed_offered`, `substrate_refinement`,
  `substrate_support_exhausted`, `substrate_confirmed`, `cold_help_turn`,
  `cold_support_exhausted`, `gap_identified`, `repair_dialogue_turn`,
  `repair_abandoned`, `repair`, `model_bridge`, `post_bridge_transfer_check`,
  `repair_state_bucketed`, `repair_cap_selected`, `repair_recovery_started`,
  `repair_recovery_turn`, `repair_recovery_closed` — do NOT mutate evidence.
- **Cold help turns**: non-substantive cold text (`answer_mode: help_request`)
  emits `cold_help_turn` only — no `appendAttempt`, no derived evidence change.
  After `MAX_COLD_HELP_TURNS` (2), `cold_support_exhausted` may enter Delta with
  zero-schema framing.
  Do not confuse this with `substrate_support_exhausted`: that is the pre-map
  Substrate Seed/Refinement cap defined in `CONTEXT.md`.
- **KC ID tracking**: `kc_id` must be present on `cold_attempt`,
  `repair_dialogue_turn`, `repair`, `spaced_redrill`, `strong_cold_path`,
  and `post_bridge_transfer_check`.
- **Evidence derivation**: only spaced strong reconstruction may derive
  `solidified`. Two strong spaced reconstructions required if the cold
  attempt was not strong.
- **Evidence hold**: `primed` stays `primed` until the derivation gate is met.
- **Strong cold path**: `solid` cold attempt → `strong_cold_path` event →
  skip repair → spacing → redrill → solidify.
- **Uncertainty ladder (recovery branch)**: first uncertainty at the direct
  prompt escalates once to the analogical prompt (`escalationLevel` 0 → 1).
  Subsequent uncertainty descends a bounded recovery ladder
  (`bounded_causal_link` → `keyword_to_sentence`, `MAX_UNCERTAINTY_RECOVERY_STEPS`),
  preserving generation at lower load, then abandons once the ladder is
  exhausted or the turn cap (`MAX_REPAIR_TURNS`) is hit. Policy lives in
  `lib/seda/repair-policy.mjs` (`decideUncertainTurn` / `decidePostJudgeTurn`). This
  recovery-ladder behavior (Policy B) supersedes the older "fade-back rule"
  that abandoned at the analogical stage; the learning-science review favored
  contingent load reduction over early abandonment.
- **Misconception handling**: `is_misconception` flag triggers
  `misconception_counter` in the bridge scaffold.
- **Mechanism-first scaffolds**: Delta emits `hinge_focus` (verb-led process)
  and `contrast_prompt` (in-domain curiosity hook). JS sanitization in
  `repair-scaffold.mjs` rejects meta before/after phrasing and off-domain
  analogies; learner copy should use hinge/contrast, not abstract slot labels.

## Testing

Tiered commands live in **`HARNESS-TRACEABILITY.md` § Release ladder** (spine →
merge → prompt evals → hosted UI). Use `./scripts/check-seda-spine.sh` for
architecture/router/event-fact changes; run the full ladder before release.

Prompt eval cases: `evals/prompts/` (`evals/README.md`). Key suites:
`test_prompt_template.py` (13 template tests), `test_workspace_smoke.py`
(end-to-end scripted TUI + harness/dashboard).

Fake mode env vars (bridge **VCR stub**: knobs → lookup → defaults):
- `SOCRATINK_TUI_FAKE_LLM=1` — use VCR stub instead of real LLM subprocess calls
- `SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=solid|shallow|thin|misconception|deep`
- `SOCRATINK_TUI_FAKE_SPACED_CLASSIFICATION=solid|shallow|…` — override spaced re-drill evaluator (recapture fixtures)
- `SOCRATINK_TUI_FAKE_SUBSTRATE_CLASSIFICATION=fast|slow|minimal`
- `SOCRATINK_TUI_FAKE_ROUTE_FAIL_ONCE=1` — test route retry
- `SOCRATINK_TUI_FAKE_ROUTE_FAIL_ALWAYS=1` — test route exhaustion
- `SOCRATINK_TUI_LOG_ROOT=/path` — session log destination

### Creating a test fixture
Scripted fixtures live in `fixtures/`. Format:
```json
{
  "concept": "Topic",
  "learner_goal": "What the learner wants to explain",
  "launch_attempt": "Starting model",
  "cold_attempt": "First generative attempt",
  "repair_dialogue_turns": ["turn 1", "turn 2"],
  "run_gap_drill": true,
  "gap_attempt": "Post-bridge transfer check answer",
  "spaced_attempt": "Delayed retrieval answer"
}
```

## State: event log (authoritative) + `ctx` (working state)

Two channels — see **Throughline**. Details:

- **`events[]`** — append-only fact chain. `nextPhase`, derivation, replay, and
  dashboard read it. If routing or truth depends on it, it lives here.
- **Append via `eventBuilders`** in `lib/seda/event-facts.mjs` only — static
  invariants (`graph_neutral`, `score_eligible`, `required_fields`), not routing
  or product-metric formulas. Canonical dashboard projection lives separately in
  `lib/seda/event-taxonomy.mjs` (read model; never an append site).
- **`ctx`** — in-flight blackboard documented in `lib/seda/ctx.d.ts`. Safe
  ctx-only fields are infra/telemetry or fully reconstructable from `events[]`.
  Phase-critical state that is not reconstructable must be mirrored into the log
  (example: `repairStateSnapshot()` on each `repair_dialogue_turn`).

## Boundaries

- Cold attempts and spaced re-drills are learner text that may affect evidence.
  Repair dialogue and `repair` events are graph-neutral routing/telemetry, not
  evidence candidates.
- Source, learner goal, route, scaffolds, and `/help` are context, not evidence.
- `repair_dialogue_turn` and `post_bridge_transfer_check` are graph-neutral —
  they inform routing but do not mutate the graph.
- Route retries: on `SmallestRouteCapExceeded`, retry with retry_guidance
  up to a cap.

## Common Tasks

### Adding a new phase handler
1. Add the event type to `DIRECT_PHASE` and/or a fine branch in `nextPhase`
2. Add `eventBuilders.*` in `lib/seda/event-facts.mjs` if the fact is new
3. Implement the handler (append facts; do not route)
4. Register in `HANDLERS` (`lib/seda/handlers/index.mjs`)
5. Add a fixture exercising the new path
6. Run `./scripts/check-seda-spine.sh` and `./socratink-harness replay`

### Loop release version (auto on PR to `main`)

CI bumps `LOOP_APP_VERSION` on the PR branch before merge (`bump-loop-version`
job → `scripts/bump-loop-version.mjs` syncs `lib/loop-server/version.mjs`,
`public/loop/index.html`, `public/loop/loop.js`, and `package.json`). Deploy
reads the merged constant — no post-merge git push. Local preview: `npm run
bump:loop`. `npm run version:check` runs in lint CI.

### Modifying an evaluator prompt
1. Edit `TEMPLATES["evaluator"]` in `prompt_templates.py`
2. Bump the version
3. Update `evaluate_attempt()` in `bridge.py` if dynamic slots changed
4. Run `pytest tests/test_prompt_template.py`
5. Run a scripted session to verify the full loop

### Debugging a session
1. Check `SOCRATINK_TUI_LOG_ROOT/<timestamp>/session.json` for the event trace
2. Events have `classification`, `bridge_ready`, `graph_neutral`, `kc_id`,
   `support_level`, and `next_dialogue_action` fields
3. The `product_loop` block shows `strong_cold_path`, `repair_position`,
   and `graph_truth` metadata
4. Replay with `./socratink-harness replay`

## Learned User Preferences

- Prefer pragmatic, minimum-impact implementations for user-facing features (e.g. `/feedback` via webhook rather than heavy email infra).
- Loop chat UI must not expose `/redrill` in startup help; spaced re-drill is automatic, not a learner command.
- For main-app loop integration, use path proxy at `app.socratink.ai/loop` (sibling `socratink-app`) over native SPA embed until graph integration is needed.
- For substantial feature implementation, prefer **Codex (gpt-5.5, high reasoning)** in an isolated worktree; Cursor owns spec (`CONTEXT.md`, ADRs), review, verification, and merge.
- For lab/persona orchestration, prefer spawning the existing CLI with file-based progress (`lab-progress.json`) over in-process runners or fork+IPC workers on loop-server.
- After lab ship, prefer outer persona validation (substrate/repair via `novice-immune-memory`, one traceable product fix) over more lab infrastructure.
- Use **Confirmed Substrate**, **Substrate Gate**, and related terms from `CONTEXT.md`; avoid informal **floor** in code, docs, and prompts.
- For agent-facing doc triage, dedupe, and `docs/implementation/**` disposition, use `agent_doc_pruner_skill`; diagnose-only unless asked to apply or commit edits.

## Learned Workspace Facts

- Product vocabulary and substrate-gate decisions live in `CONTEXT.md` and `docs/adr/`; pre-map substrate is graph-neutral routing only — evidence still begins at **Cold Attempt**.
- GitHub remote is `jon-devlapaz/socratink-tui-agent` on `main`; branch protection requires PRs, passing Smoke CI, and strict up-to-date. CodeRabbit `CHANGES_REQUESTED` can block merge despite green CI — use `gh pr merge --admin` when appropriate.
- Hosted loop: `loop-server.mjs` serves `/loop`, `/dashboard`, and `/api/session/*`; **production deploy** is automatic on merge to `main` (Railway GitHub connection + Smoke CI var sync/verify — `deploy/RAILWAY.md`). Production URL `app.socratink.ai/loop` via `socratink-app` FastAPI proxy (`loop_backend_proxy.py`; `LOOP_BACKEND_URL` → Railway; see `deploy/LOOP-HOSTING.md`). `public/loop/loop.js` polls `/health` (not `/api/health`); avoid duplicate Vercel rewrites for the same paths.
- Loop server `advanceSession` may run several handler turns per HTTP request until
  `PROMPT_REQUIRED`; pacing stops (`lib/loop-server/pacing-stops.mjs`) are transport
  only — routing truth still comes from append-only events and `nextPhase`.
- Dogfood deploy default: live Gemini on Railway with no browser `SOCRATINK_LOOP_API_KEY` (fine for obscure URLs; add auth before main-app nav).
- `LOOP_APP_VERSION_DEFAULT` in `lib/loop-server/version.mjs` is the canonical loop chrome label (`/health` → `app_version`). **CI auto-bumps on PRs to `main`**. Production uses the baked-in constant from the deployed image — do not set `LOOP_APP_VERSION` on Railway (stale override without restart). Optional `LOOP_APP_VERSION` in `.env` overrides locally.
- Vendored canon may be intentionally ahead of `socratink-app`; if drift CI fails after in-tree edits, regenerate `lib/canon/checksums.sha256` instead of blind `sync-canon-from-app.sh` (sync can regress local contract tests).
- Smoke CI syncs Railway secrets with `railway variable set --skip-deploys --project …`, deletes stale `LOOP_APP_VERSION`, then `railway redeploy --from-source` before health verify (no `railway link`).
- **Founder Lab + persona runs:** `/lab` at `http://127.0.0.1:8787/lab` when `SOCRATINK_LAB_ENABLED=1` (loopback-only); lab spawns `loop-persona-live.mjs` and reads `lab-progress.json`. Persona `--out` dirs get `session.json` (full event log) on `caseComplete`. Shared runner `lib/lab/persona-runner.mjs`, cartridges in `pedagogical_agents/cartridges/`, CLI `./socratink-persona-lab`; local mock student via `PERSONA_LLM_*` (LM Studio `openai_compatible`).
- Fast doc/architecture gate before doc trims: `./scripts/check-seda-spine.sh`; full release ladder lives in `HARNESS-TRACEABILITY.md`.
- Persona cartridges: `jordan-ai` = lab instrument smoke only; `novice-immune-memory` (or substrate matrix) validates substrate seed/refinement and repair paths.
- Separate from sibling `../socratink-tui`: own git history; do not copy remotes or history from the old lab checkout.
