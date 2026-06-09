# Bridge action registry

Function-catalog contract for the Python LLM seam. Each row is a **wire action**
invoked as `python bridge.py <action>` with JSON on stdin/stdout
(`lib/bridge/client.mjs`). Replace or mock a layer by honoring the same action id
and response shape; the SEDA loop and `nextPhase` stay unchanged.

**Machine-readable source:** [`lib/bridge/registry.json`](../lib/bridge/registry.json)  
**Import:** `lib/bridge/registry.mjs`  
**Drift tests:** `tests/js/bridge-registry.test.mjs`, `tests/test_bridge_registry.py`

<!-- registry:summary:start -->
## Scope

**Covers:** bridge.py subprocess wire actions only
**Excludes:** `nextPhase coarse table`, `handler policy gates`, `training-derive`
**See also:** `HARNESS.md`, `lib/seda/cold-gating.mjs`, `lib/seda/repair-policy.mjs`
**Policy gates:** documented in `registry.json` → `policy_gates` (not subprocess wire).

## Summary table

| Action | Template | Version | Response schema | Handler phase | Emitted event(s) | `nextPhase` reads |
| --- | --- | --- | --- | --- | --- | --- |
| `generate-route` | `route`¹ | `socratink-route-v3` | `ProvisionalMap` + `first_node` | route | route_generated, route_retry | `route_generated` → `cold_attempt` (coarse) |
| `substrate-gate` | `substrate_gate` | `socratink-substrate-gate-v1` | bridge.SubstrateGateDecision | substrate_gate | substrate_seed_offered, substrate_refinement, substrate_support_exhausted, substrate_confirmed | `substrate_confirmed` → `route` (coarse) |
| `evaluate-attempt` | `evaluator` | `socratink-evaluator-v7` | ai_service.DrillEvaluation | cold_attempt, post_bridge_transfer, spaced_redrill | cold_attempt, cold_help_turn, cold_support_exhausted, post_bridge_transfer_check, spaced_redrill, evidence_hold_recorded | See [evaluator routing](#evaluate-attempt) |
| `repair-scaffold` | `delta` | `socratink-delta-v5` | bridge.RepairScaffold | delta | gap_identified | `gap_identified` → `repair_dialogue` (coarse) |
| `socratic-repair-drill` | `socratic_repair_drill` | `socratink-socratic-drill-v3` | bridge.SocraticRepairDrill | delta | gap_identified | — |
| `repair-dialogue` | `repair_dialogue` | `socratink-repair-dialogue-v4` | bridge.RepairDialogueJudge | repair_dialogue, repair_recovery | repair_dialogue_turn, repair_recovery_turn | See [repair dialogue routing](#repair-dialogue) |

¹ **Route template pin:** `prompt_templates.TEMPLATES["route"]` is the versioned
contract (validated by `tests/test_prompt_template.py`). The live prompt is
`ai_service.generate_smallest_provisional_map` in `vendor/python/` — not
`build_prompt()` in `bridge.py`. Bump the route template version when the route *contract*
changes; bump `route_runtime.prompt_sha256` when the runtime prompt file changes.

Regenerate this block: `node scripts/refresh-bridge-registry-doc.mjs`
<!-- registry:summary:end -->

## Transport

```text
Node handler  →  callBridge(action, payload)
              →  spawn: python bridge.py <action>
              →  stdin: JSON request
              →  stdout: JSON response (exit 0) or { error, message } (exit 1)
```

Errors are fail-closed: handlers using `callBridge` throw; route generation uses
`callBridgeResult` for retryable `SmallestRouteCapExceeded`.

## Per-action detail

### `generate-route`

**Request (required):** `concept`, `launch_attempt`  
**Request (optional):** `learner_goal`, `log_raw_llm`, `route_attempt`, `route_retry_reason`

**Response:** `provisional_map`, `first_node`, `llm_call`

**Caller:** `lib/seda/route-generation.mjs` → `handleRoute`

**Routing:** Emits `route_generated`; `nextPhase` uses `DIRECT_PHASE` only (no bridge
fields on the event). Retry emits graph-neutral `route_retry` and re-invokes.

**Graph role:** context (hypothesis map, not evidence)

---

### `evaluate-attempt`

**Request (required):** `node_id`, `node_label`, `node_mechanism`, `learner_text`  
**Request (optional):** `drill_mode`, `knowledge_map`, `repair_drill_context`, `log_raw_llm`

Per-mode contracts live in `registry.json` → `actions.evaluate-attempt.modes`:

| `drill_mode` | Prompt mode | Handler | `nextPhase` routing fields |
| --- | --- | --- | --- |
| `cold_attempt` | `cold_attempt` | `cold-attempt.mjs` | `evaluation.classification` |
| `gap_drill` | `gap_drill` | `post-bridge-transfer.mjs` | (none — coarse only) |
| `spaced_redrill` | `re_drill` | `spaced-redrill.mjs` | (none — coarse only) |

**Response:** `evaluation` (`DrillEvaluation`), `llm_call`

**Key evaluation fields**

| Field | Used by handler | Used by `nextPhase` |
| --- | --- | --- |
| `classification` | store, cold gating | `cold_attempt` → solid? `strong_cold_path` : `delta` |
| `answer_mode`, `score_eligible`, `generative_commitment` | `cold-gating.mjs` substantive gate | indirect via event type (`cold_help_turn` vs `cold_attempt`) |
| `gap_description` | delta scaffold input | — |
| `agent_response` | UI | — |
| `routing` | telemetry on help turns | — |

**Cold path (handler gate before event type):**

```text
isSubstantiveColdEvaluation(evaluation)?
  no  → cold_help_turn (graph-neutral)
        → turn cap? cold_support_exhausted → delta
        → else stay in cold_attempt
  yes → cold_attempt (evidence candidate)
        → nextPhase reads evaluation.classification
```

**Post-bridge / spaced:** `post_bridge_transfer_check` and `spaced_redrill` events
carry `evaluation` for observability and derivation inputs; `nextPhase` uses coarse
`DIRECT_PHASE` only (`spacing` / `idle`).

**Graph role:** evidence candidate (when substantive and scored)

---

### `repair-scaffold`

**Request (required):** `node_label`, `node_mechanism`, `learner_text`  
**Request (optional):** `gap_description`, `evidence_goal`, `blank_hint`, `is_misconception`, `log_raw_llm`

**Response:** `repair_scaffold`, `llm_call`

Post-processed by `repair-scaffold.mjs` (`prepareRepairScaffold`, answer-shape rejection).

**Routing:** Handler emits `gap_identified` → `repair_dialogue`.

**Graph role:** context (scaffold + gap log; graph-neutral event)

---

### `socratic-repair-drill`

**Request (required):** `before`, `after`  
**Request (optional):** `node_label`, `repair_target`, `missing_operation`, `learner_text`, `question_style`, `log_raw_llm`

**Response:** `socratic_question`, `llm_call`

Merged into `ctx.repairScaffold` in delta; single `gap_identified` event covers both
delta calls.

**Graph role:** context

---

### `repair-dialogue`

**Request (required):** `node_label`, `node_mechanism`, `missing_operation`, `before`, `after`, `learner_text`  
**Request (optional):** `gap_id`, `turn_index`, `log_raw_llm`

**Response:** `repair_dialogue` (`RepairDialogueJudge`, normalized by
`_normalize_repair_dialogue_judge`), `llm_call`

Required judge fields include `score_eligible: false` and `graph_neutral: true`;
repair-dialogue turns are routing practice, not graph mastery evidence.

**Pre-bridge gates (no LLM call):** blank text → `repair-policy.decideBlankTurn`;
explicit uncertainty → `repair-policy.decideUncertainTurn`. Both emit
`repair_dialogue_turn` with `bridge_ready: false` and policy-driven
`next_dialogue_action`.

**Event mapping:** `repairDialogueEvent()` copies judge fields onto
`repair_dialogue_turn`.

| Judge field | On event | `nextPhase` |
| --- | --- | --- |
| `bridge_ready` | `bridge_ready` | `true` → `repair` |
| `next_dialogue_action` | `next_dialogue_action` | `escalate` / `recover_uncertainty` → stay; `abandon` → `repair_abandoned` |
| `next_prompt` | `next_prompt` | handler queues prompt (not routing) |
| `turn_index` | `turn_index` | `>= MAX_REPAIR_TURNS` → `repair_abandoned` |

**Handler policy (not in `nextPhase`):** `decidePostJudgeTurn` may close repair state
when judge says abandon or cap hit.

**Recovery branch:** `repair-recovery.mjs` reuses this action; routes via
`repair_recovery_closed.next_phase`, not standard dialogue policy.

**Graph role:** graph-neutral (never mutates evidence)

---

## Policy gates and post-call hooks

Wire actions are only half the control plane. Deterministic gates and normalizers
live in `registry.json` at the top level (not subprocess transport):

| Section | Purpose |
| --- | --- |
| `policy_gates` | Handler-side gates before bridge call or event append (`cold-gating.mjs`, `repair-policy.mjs`) |
| `post_call_hooks` | Bridge normalizers that reshape LLM output before events (`_normalize_tui_evaluation`, `_normalize_repair_dialogue_judge`) |

Drift tests: `tests/js/policy-gates-registry.test.mjs`, `tests/test_bridge_post_call_hooks.py`.

---

## Swapping a layer (iii-style)

| Goal | Keep | Replace |
| --- | --- | --- |
| Fake evaluators in CI | action ids + response shapes | VCR stub behind `SOCRATINK_TUI_FAKE_LLM` (`bridge_fake_lookup.py` + env knobs) |
| New provider | `bridge.py` CLI surface | `vendor/python/llm/` client |
| Stricter cold gate | `evaluate-attempt` wire shape | `cold-gating.mjs` only |
| Different repair judge | `RepairDialogueJudge` fields on event | prompt template + normalizer |
| Live route catalog | `generate-route` response shape | ai_service route generator |

## Changing the registry

1. Add or change action in `bridge.py` and `registry.json`.
2. Bump template version in `prompt_templates.py` if prompt slots change.
3. Run `node scripts/refresh-bridge-registry-doc.mjs`
4. Run `pytest tests/test_bridge_registry.py tests/test_prompt_template.py -q`
5. Run `node --test tests/js/bridge-registry.test.mjs`
6. Update handler event payloads if new routing fields are needed; teach `nextPhase`.

See also [`HARNESS.md`](HARNESS.md) (substrate invariants) and [`AGENTS.md`](AGENTS.md) (prompt rules).
