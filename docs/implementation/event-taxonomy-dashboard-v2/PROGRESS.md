# Event Taxonomy Dashboard V2 Progress

## Checkpoint 1 - Baseline

- Branch: `codex/event-taxonomy-dashboard-v2`
- Starting status: `?? docs/implementation/event-taxonomy-dashboard-v2/`
- Baseline validation:
  - `rtk ./scripts/check-canon-drift.sh` - pass
  - `rtk .venv/bin/pytest tests/test_prompt_template.py tests/test_workspace_smoke.py -q` - pass, 24 tests
  - `rtk proxy find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test` - pass, 119 tests
  - `rtk ./socratink-harness replay` - pass, 8 cases
  - `rtk ./socratink-harness routing-proof` - pass, 8 cases
  - `rtk env SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow ./socratink-tui --scripted fixtures/source_less_script.json --color=never` - pass
- Command compatibility note: the literal GOAL command forms for compound `find` and leading env assignment do not execute under `rtk`; the measured baseline used `rtk proxy find ...` and `rtk env ...`.

## Checkpoint 2 - Contract Tests First

- Added failing taxonomy contract tests in `tests/js/event-taxonomy.test.mjs`.
- Added failing dashboard product metric tests in `tests/js/dashboard.test.mjs`.
- RED validation:
  - `rtk node --test tests/js/event-taxonomy.test.mjs` - expected fail, missing `lib/seda/event-taxonomy.mjs`
  - `rtk node --test tests/js/dashboard.test.mjs` - expected fail, product metrics still scalar rates without numerator/denominator/source metadata

## Checkpoint 3 - Canonical Envelope Adapter

- Added `lib/seda/event-taxonomy.mjs`.
- Defined `learner-loop-event-taxonomy-v1` with canonical envelope fields:
  `event_type`, `event_version`, `session_id`, `case_id`, `kc_id`, `phase`,
  `timestamp`, `graph_neutral`, `score_eligible`, and `payload`.
- Preserved legacy `event.type`; no append sites were migrated because the
  bounded solution is a read-only canonical projection.
- Compatibility evidence:
  - `rtk node --test tests/js/event-taxonomy.test.mjs` - pass, 4 tests

## Checkpoint 4 - Dashboard Metric Projection

- Updated `lib/seda/dashboard-metrics.mjs` product metrics to derive from
  `canonicalEventsForSession(session)` only.
- Product metrics now expose `rate`, `numerator_count`, `denominator_count`,
  `source_event_types`, `formula_label`, and `empty_state_reason`.
- `evidence_hold_rate` is reconstructed from canonical cold/spaced evaluation
  classifications, not `session.evidence_holds`.
- Compatibility evidence:
  - `rtk node --test tests/js/dashboard.test.mjs` - pass, 8 tests

## Checkpoint 5 - Promotion Gates and Final Validation

- Added promotion-gate coverage for:
  - metric numerator/denominator/source metadata
  - substrate canonical graph-neutral and score-ineligible status
  - Cold Attempt as first score-eligible reconstruction surface
  - `/meta` graph-neutral score-ineligible projection
  - pure `nextPhase(events)` compatibility with prompt-only canonical projection
  - product metrics ignoring non-event `session.evidence_holds`
- Bumped `LOOP_APP_VERSION_DEFAULT` in `lib/loop-server/version.mjs` from
  `v0.04` to `v0.05` within the GOAL-scoped file list.
- Final validation:
  - `rtk ./scripts/check-canon-drift.sh` - pass
  - `rtk .venv/bin/pytest tests/test_prompt_template.py tests/test_workspace_smoke.py -q` - pass, 24 tests
  - `rtk proxy find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test` - pass, 125 tests
  - `rtk ./socratink-harness replay` - pass, 8 cases
  - `rtk ./socratink-harness routing-proof` - pass, 8 cases
  - `rtk env SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow ./socratink-tui --scripted fixtures/source_less_script.json --color=never` - pass

## QA Addendum - Truth-Layer Regression Suite

- Added `tests/js/event-taxonomy-dashboard-qa.test.mjs` as an adversarial QA suite
  for the event-taxonomy/dashboard contract.
- QA coverage added for:
  - prompt-only canonical events remain projections and are not runtime
    `events[]` append types
  - unknown legacy events do not become canonical product truth
  - Cold Attempt remains the first score-eligible canonical reconstruction
    surface
  - dashboard product metrics ignore `product_loop`, `evidence_holds`, and
    friction-tag lures
  - score-ineligible canonical evidence does not count toward meaningful cold
    attempt, case completion, or evidence-hold metrics
  - every dashboard product metric exposes decision-grade provenance fields
- QA found and fixed one metric gap: product metric numerators were checking
  canonical event presence but not `score_eligible=true` for evidence-bearing
  metrics. `lib/seda/dashboard-metrics.mjs` now requires score-eligible
  canonical projections for meaningful cold attempts, case completion, and
  evidence-hold counting.
- Validation:
  - `rtk node --test tests/js/event-taxonomy-dashboard-qa.test.mjs` - pass, 7 tests
  - `rtk node --test tests/js/event-taxonomy.test.mjs tests/js/dashboard.test.mjs` - pass, 12 tests
  - `rtk proxy find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test` - pass, 132 tests
  - `rtk .venv/bin/pytest tests/test_workspace_smoke.py -q` - pass, 10 tests
  - `rtk ./scripts/check-canon-drift.sh` - pass

## Checkpoint 6 - Metric Contract Tightening Baseline

- Branch/status before edits:
  - `rtk git status --short --branch` - `## codex/event-taxonomy-dashboard-v2`, clean worktree
  - `rtk git log --oneline --decorate --max-count=1` - `0c759e8 feat(dashboard): add event tax...`
- Focused pre-change baseline:
  - `rtk node --test tests/js/event-taxonomy.test.mjs tests/js/dashboard.test.mjs tests/js/event-taxonomy-dashboard-qa.test.mjs tests/js/meta-command.test.mjs tests/js/prompt-help.test.mjs` - pass, 24 tests

## Checkpoint 7 - Explicit Denominators, Meta Gate, Vocabulary Guard

- RED validation after writing focused tests first:
  - `rtk node --test tests/js/event-taxonomy.test.mjs tests/js/dashboard.test.mjs tests/js/event-taxonomy-dashboard-qa.test.mjs tests/js/meta-command.test.mjs tests/js/prompt-help.test.mjs tests/js/feedback-commands.test.mjs tests/js/http-prompt-meta.test.mjs` - expected fail, 13 pass / 10 fail. Failures covered missing `assertPublicVocabularySafe`, missing meta feature flag helpers, `meta_use_rate` still published, missing `critical_path`, blanket metric denominators, and disabled `/meta` still appending `meta_turn`.
- Implementation:
  - `lib/seda/dashboard-metrics.mjs` now derives six critical-path product metrics with metric-specific numerator and denominator counts:
    `meaningful_cold_attempt_rate`, `bridge_reach_rate`, `case_complete_rate`,
    `repair_load_rate`, `evidence_hold_rate`, and `substrate_seed_use_rate`.
  - `evidence_hold_rate` now means insufficient score-eligible cold evaluation over score-eligible cold evaluations; it ignores `product_loop`, `evidence_holds`, friction tags, and UI state.
  - `meta_use_rate` is omitted because `eligible_loop_turns` telemetry is not available.
  - `/meta` is default-off behind `SOCRATINK_TUI_META_COMMAND`; when disabled it is hidden from learner help/chrome and reserved so it is not appended or scored as learner text.
  - Public dashboard rendering accepts metric objects and omits unavailable `meta_use_rate`.
  - Public vocabulary guard rejects the deprecated repair-rep phrase unless it is intentionally re-canonized.
- Focused green validation:
  - `rtk node --test tests/js/event-taxonomy.test.mjs tests/js/dashboard.test.mjs tests/js/event-taxonomy-dashboard-qa.test.mjs tests/js/meta-command.test.mjs tests/js/prompt-help.test.mjs tests/js/feedback-commands.test.mjs tests/js/http-prompt-meta.test.mjs` - pass, 35 tests
- Broader validation:
  - `rtk proxy find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test` - pass, 140 tests
  - `rtk ./scripts/check-canon-drift.sh` - pass
  - `rtk .venv/bin/pytest tests/test_workspace_smoke.py -q` - pass, 10 tests
  - `rtk ./socratink-harness replay` - pass, 8 cases
  - `rtk ./socratink-harness routing-proof` - pass, 8 cases
  - `rtk env PORT=8793 SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow node --no-warnings loop-server.mjs` plus `rtk env SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8793 node --test tests/js/loop-chat-ui.test.mjs` - pass, 19 tests
  - `rtk git diff --check` - pass

## Checkpoint 8 - Review Fix: Event-Backed Evidence Hold Metric

- Cursor review found that `evidence_hold_rate` was still labeled as an
  evidence-hold metric while counting non-solid cold evaluations. That was a
  semantic proxy, not an event-backed evidence hold.
- Fixed by appending a graph-neutral, score-ineligible
  `evidence_hold_recorded` event from `spaced-redrill` only when
  `buildEvidenceHold()` fires.
- Added the event to canonical taxonomy projection, `nextPhase(events)` routing
  (`evidence_hold_recorded -> idle`), graph-neutral dashboard telemetry, hosted
  case-complete compatibility, and bridge registry documentation.
- Updated `evidence_hold_rate` to:
  `evidence_hold_recorded / cold_attempt_evaluated`.
- Removed staged pseudo-event names from product metric provenance:
  `meaningful_cold_attempt_rate` now reports
  `cold_attempt_submitted / cold_attempt_prompted`.
- Tightened TUI idle `/meta` gating to use the same injectable env option as
  HTTP prompt helpers; added focused coverage for disabled and enabled idle
  command behavior.
- Added QA coverage proving shallow/non-solid cold attempts do not count as
  evidence holds unless the explicit hold event exists.
- Added handler-level coverage proving `spaced-redrill` appends
  `evidence_hold_recorded` when derivation holds a solid spaced reconstruction
  below `solidified`.
- Validation:
  - `rtk node --test tests/js/event-taxonomy.test.mjs tests/js/dashboard.test.mjs tests/js/event-taxonomy-dashboard-qa.test.mjs tests/js/next-phase.test.mjs tests/js/bridge-registry.test.mjs` - pass, 50 tests
  - `rtk node --test tests/js/spaced-redrill-evidence-hold.test.mjs` - pass, 1 test
  - `rtk proxy find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test` - pass, 146 tests
  - `rtk ./scripts/check-canon-drift.sh` - pass
  - `rtk .venv/bin/pytest tests/test_prompt_template.py tests/test_workspace_smoke.py -q` - pass, 24 tests
  - `rtk ./socratink-harness replay` - pass, 8 cases
  - `rtk ./socratink-harness routing-proof` - pass, 8 cases
  - `rtk env SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow ./socratink-tui --scripted fixtures/source_less_script.json --color=never` - pass
  - `rtk env PORT=8796 SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow node --no-warnings loop-server.mjs` plus `rtk env SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8796 node --test tests/js/loop-chat-ui.test.mjs` - pass, 19 tests

## Checkpoint 8 - Merge-Gate Refresh, 2026-06-05

- Branch/status before refresh:
  - `rtk git status --short --branch` - branch `codex/metric-contract-meta-gating...origin/codex/metric-contract-meta-gating` with this progress note unstaged
- Revalidated the Checkpoint 8 merge gate after the review-fix implementation was already present:
  - `rtk ./scripts/check-canon-drift.sh` - pass
  - `rtk .venv/bin/pytest tests/test_prompt_template.py tests/test_workspace_smoke.py -q` - pass, 24 tests
  - `rtk ./socratink-harness replay` - pass, 8 cases
  - `rtk ./socratink-harness routing-proof` - pass, 8 cases
  - `rtk proxy bash -lc "find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test"` - pass, 147 tests
  - `rtk env SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow ./socratink-tui --scripted fixtures/source_less_script.json --color=never` - pass; saved log under `.qa-runs/socratink-tui/2026-06-05T06-33-14.804Z/session.json`
  - `rtk env PORT=8798 SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow node --no-warnings loop-server.mjs` plus `rtk env SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8798 node --test tests/js/loop-chat-ui.test.mjs` - pass, 19 tests
  - `rtk git diff --check` - pass
