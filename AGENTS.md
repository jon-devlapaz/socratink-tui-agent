# AGENTS.md

Socratink TUI — founder-facing terminal product lab for evidence-weighted
adaptive learning. SEDA (Staged Event-Driven Architecture) pattern with an
append-only event log as the state machine.

Harness substrate contract (layers, invariants, Moss mapping): `HARNESS.md`.
V-model traceability map for agents (requirements ↔ verification tiers): `HARNESS-TRACEABILITY.md`.

## Architecture

```
app.mjs              Thin entry: session bootstrap, prompt I/O, run loop wiring
lib/seda/next-phase.mjs  Pure router: nextPhase(events), DIRECT_PHASE
lib/seda/run-loop.mjs    Phase dispatch loop (handlers passed in; nextPhase owns all transitions)
lib/seda/handlers/       All phase handlers + HANDLERS map
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
bridge.py            Python LLM bridge (4 actions, shells out from Node)
prompt_templates.py  Canonical prompt templates (versioned, testable)
dashboard.mjs        Founder dashboard (case summaries, traces)
```

The TUI is **self-contained**: graph-truth canon (`lib/canon/`) and the Python
LLM seam (`vendor/python/`) are vendored from `socratink-app` and synced via
`scripts/sync-canon-from-app.sh`. socratink-app remains the conceptual owner of
graph truth; the TUI holds a checksum-gated mirror (`scripts/check-canon-drift.sh`).

### SEDA Loop

- `nextPhase(events)` — pure function in `lib/seda/next-phase.mjs`; lookup table +
  special cases (`cold_attempt` classification, `repair_dialogue_turn`
  bridge_ready/escalate/recover/cap). Must not import bridge, handlers, or I/O.
- 12 phase handlers, one turn per invocation
- While-loop dispatches: `handler = HANDLERS[phase]; result = await handler(...); phase = nextPhase(events)`
- 11 event types in `DIRECT_PHASE`, loop exits on `idle_exit`

### Python Bridge (bridge.py)

Five actions dispatched from Node via subprocess. Full function catalog (template
versions, I/O schemas, emitted events, `nextPhase` routing fields):
`HARNESS-BRIDGE-REGISTRY.md` / `lib/bridge/registry.json`.

| CLI arg | Function | Template |
|---|---|---|
| `generate-route` | `generate_route()` | delegates to `ai_service` |
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
1. Update the template in `prompt_templates.py`
2. Bump the version string
3. Run `pytest tests/test_prompt_template.py` (13 tests must pass)
4. Update the corresponding `bridge.py` function if the dynamic slots changed

## Graph Honesty Rules

- **Graph-neutral events**: `cold_help_turn`, `cold_support_exhausted`,
  `gap_identified`, `repair_dialogue_turn`, `repair_abandoned`, `repair`,
  `model_bridge`, `post_bridge_transfer_check`, `repair_state_bucketed`,
  `repair_cap_selected`, `repair_recovery_started`, `repair_recovery_turn`,
  `repair_recovery_closed` — do NOT mutate evidence.
- **Cold help turns**: non-substantive cold text (`answer_mode: help_request`)
  emits `cold_help_turn` only — no `appendAttempt`, no derived evidence change.
  After `MAX_COLD_HELP_TURNS` (2), `cold_support_exhausted` may enter Delta with
  zero-schema framing.
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
  `repair_policy.mjs` (`decideUncertainTurn` / `decidePostJudgeTurn`). This
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

### Python tests
```bash
.venv/bin/pytest tests -q
```

### Prompt evals (L2, fake CI gate)
```bash
.venv/bin/pytest \
  tests/test_prompt_eval_repair_dialogue.py \
  tests/test_prompt_eval_evaluator.py \
  tests/test_repair_dialogue_contract.py \
  tests/test_prompt_template.py -q
```
Cases live under `evals/prompts/`; see `evals/README.md`.
- `test_prompt_template.py` — 13 tests for template system
- `test_workspace_smoke.py` — end-to-end scripted TUI + harness/dashboard

### Harness regression
```bash
./socratink-harness replay
```

### Scripted TUI (fake LLM)
```bash
SOCRATINK_TUI_FAKE_LLM=1 \
SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
./socratink-tui --scripted fixtures/source_less_script.json --color=never
```

Fake mode env vars:
- `SOCRATINK_TUI_FAKE_LLM=1` — use fake evaluators instead of real LLM
- `SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=solid|shallow|thin|misconception`
- `SOCRATINK_TUI_FAKE_SPACED_CLASSIFICATION=solid|shallow|…` — override spaced re-drill evaluator (recapture fixtures)
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

Two channels carry state, and the distinction matters:

- **`events[]` — the append-only fact chain, authoritative.** Never mutate past
  events. The phase router (`nextPhase`) reads the log to determine the next
  phase, evidence derivation reads it to decide graph state, and replay /
  dashboard read it for observability. If routing or truth depends on it, it
  lives here.
- **`ctx` — the mutable blackboard, in-flight working state for the current
  process only.** Handlers share it (`firstNode`, `route`, `repairScaffold`,
  `repairState`, ...). It is NOT replayed and NOT authoritative. Every field, its
  writer, and its readers are documented in `lib/seda/ctx.d.ts`.

Closed-loop rule: a field may be `ctx`-only if it is infra/telemetry **or** fully
reconstructable from `events[]`. Phase-critical working state that is not
reconstructable must be mirrored into the log. Example: `ctx.repairState`
(`escalationLevel`, recovery/hint counters) is set to `null` on repair exit, so
it is snapshotted onto each `repair_dialogue_turn` / `repair_hint_requested`
event via `repairStateSnapshot()` (graph-neutral, never read by `nextPhase`),
keeping a mid-repair session replayable.

## Boundaries

- Cold attempts, repairs, and re-drills are learner text — they ARE evidence
  candidates.
- Source, learner goal, route, scaffolds, and `/help` are context, not evidence.
- `repair_dialogue_turn` and `post_bridge_transfer_check` are graph-neutral —
  they inform routing but do not mutate the graph.
- Route retries: on `SmallestRouteCapExceeded`, retry with retry_guidance
  up to a cap.

## Common Tasks

### Adding a new phase handler
1. Add the event type to the `DIRECT_PHASE` mapping
2. Add the phase entry to the `nextPhase` lookup table
3. Implement the handler function
4. Add to `HANDLERS` dictionary
5. Add a fixture exercising the new path
6. Verify the harness still passes

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
