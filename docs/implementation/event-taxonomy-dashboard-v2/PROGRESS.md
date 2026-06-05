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
