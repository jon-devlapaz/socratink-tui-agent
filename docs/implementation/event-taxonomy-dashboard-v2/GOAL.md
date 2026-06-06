# Event Taxonomy Dashboard V2 Goal

## Objective

Establish a versioned canonical learner-loop event taxonomy and make dashboard product metrics a read-only projection of that contract, verified by focused JS/Python tests, harness replay, and fake-loop smoke, while preserving append-only `events[]` semantics, graph-neutral/evidence boundaries, pure `nextPhase(events)` routing, and existing promoted-trace compatibility.

## Scope

Use only:

- `lib/seda/event-taxonomy.mjs` or equivalent
- `lib/seda/session-record.mjs`
- `lib/observability/dashboard-metrics.mjs`
- `lib/seda/meta-command.mjs`
- `lib/seda/handlers/**` event append sites as needed
- `lib/loop-server/session.mjs` and `lib/loop-server/http-server.mjs` only if response exposure is required
- `tests/js/**` focused contract/dashboard/meta/session tests
- `tests/test_workspace_smoke.py` if event-log invariants need coverage
- `docs/HARNESS*.md` only for concise contract documentation
- `lib/loop-server/version.mjs` for the required PR version bump

Do not start dashboard visual redesign, broad UI work, deployment work, dependency installs, or prompt/LLM behavior changes.

## Canonical Event Contract

Define a canonical event envelope or compatibility adapter with:

- `event_type`
- `event_version`
- `session_id`
- `case_id`
- `kc_id` when applicable
- `phase`
- `timestamp`
- `graph_neutral`
- `score_eligible`
- `payload`

Preserve legacy `event.type` compatibility for `nextPhase` and existing traces unless tests prove a safe migration path.

Include at least these canonical learner-loop events or explicit staged aliases for current names:

- `loop_started`
- `source_submitted`
- `goal_submitted`
- `substrate_seed_requested`
- `substrate_seed_shown`
- `substrate_refinement_submitted`
- `substrate_confirmed`
- `cold_attempt_prompted`
- `cold_attempt_submitted`
- `cold_attempt_evaluated`
- `repair_prompted`
- `repair_submitted`
- `bridge_prompted`
- `bridge_submitted`
- `case_completed`
- `spaced_redrill_scheduled`
- `spaced_redrill_submitted`
- `meta_requested`
- `meta_returned`

Do not append prompt-only canonical events into authoritative `events[]` unless `nextPhase` compatibility tests prove they cannot alter routing. Prefer a canonical projection/adapter for prompted/scheduled events when those facts are already represented by awaiting state, handler phase, or existing events.

Make Substrate Gate events `graph_neutral=true` and `score_eligible=false`. Cold Attempt remains the first score-eligible reconstruction surface. `/meta` remains graph-neutral, score-ineligible, same-phase, no evaluator call, and no answer-shaped hint.

## Dashboard Product Metrics

Add dashboard metric definitions that name canonical event source and denominator for:

- `meaningful_cold_attempt_rate`
- `substrate_seed_use_rate`
- `bridge_reach_rate`
- `repair_load_rate`
- `case_complete_rate`
- `evidence_hold_rate`
- `meta_use_rate` if `/meta` is present or staged

Each dashboard product metric must expose:

- `numerator_count`
- `denominator_count`
- `source_event_types`
- `formula_label`
- `empty_state_reason` when the denominator is zero

Update dashboard metric computation so every product metric derives from canonical events only, not ctx-only fields, UI state, run friction tags, or `product_loop` summaries.

If `evidence_hold_rate` cannot be reconstructed from current events without adding a canonical fact, add the smallest graph-neutral canonical event needed or stop if the required product decision is ambiguous.

## Checkpoints

1. Run `rtk git status --short` and baseline validation for the relevant current tests.
2. Add taxonomy contract tests before implementation.
3. Implement the envelope/adapter and append-site compatibility in one bounded slice.
4. Adapt dashboard metric definitions and derivation.
5. Add promotion-gate tests proving:
   - metrics source/denominator metadata
   - substrate graph-neutral score-ineligible status
   - Cold Attempt first score-eligible status
   - `/meta` safety
   - pure `nextPhase` compatibility
   - no dashboard field becomes product truth unless reconstructable from `events[]`

Keep a short progress log at `docs/implementation/event-taxonomy-dashboard-v2/PROGRESS.md` with baseline, changed files, validation commands, and evidence after each checkpoint.

## Validation

Run:

```bash
rtk ./scripts/check-canon-drift.sh
rtk .venv/bin/pytest tests/test_prompt_template.py tests/test_workspace_smoke.py -q
rtk proxy find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test
rtk ./socratink-harness replay
rtk ./socratink-harness routing-proof
rtk env SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow ./socratink-tui --scripted fixtures/source_less_script.json --color=never
```

Narrower pytest gates are acceptable only if unchanged areas do not need full smoke coverage. Document the rationale in the progress log.

## Stop Condition

Stop only when the taxonomy contract, dashboard metric definitions, compatibility tests, and promotion gates are green and documented in the progress log.

## Blocked Conditions

If blocked because product naming conflicts, `evidence_hold_rate` needs a new truth event beyond the stated contract, existing dirty-tree changes overlap target files, promoted traces require an incompatible migration, or validation exposes a routing/evidence regression outside the bounded surface, stop and report:

- attempted paths
- evidence gathered
- blocker
- next input needed
