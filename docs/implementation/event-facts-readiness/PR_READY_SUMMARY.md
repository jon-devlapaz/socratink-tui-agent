# PR Ready Summary: SEDA Event-Facts Readiness

## Context & Intent

- This package qualifies the SEDA event-facts migration from a mission-assurance
  stance before PR review.
- The candidate baseline centralizes runtime event construction and static event
  invariants in `lib/seda/event-facts.mjs`.
- The review checks whether graph truth, routing, replay, dashboard metrics, and
  canonical taxonomy ownership stayed in their proper modules.
- Track: MVP stabilization / SEDA architecture qualification.

## Implementation Details

- Added `lib/seda/event-facts.mjs` as the static runtime event-fact and builder
  seam.
- Migrated representative SEDA append sites to `eventBuilders` while preserving
  append-only event semantics.
- Updated dashboard summary counts to derive graph-neutral and score-eligible
  event type membership from static definitions.
- Updated session rehydration to read replay-required persisted fields from
  `eventDefinition(event.type).required_fields`.
- Kept routing in `lib/seda/next-phase.mjs`, training derivation in canon,
  canonical projection cardinality in `lib/seda/event-taxonomy.mjs`, and product
  metric formulas in `lib/observability/dashboard-metrics.mjs`.

## MVP / Deployment Risk Check

- [ ] Does this logic rely on local behavior that might fail in Vercel serverless?
  No. This is TUI/loop-server runtime logic and documentation; the dynamic-port
  hosted loop validation passed in Phase 6.
- [ ] Are there SSRF or error leakage risks in new external calls?
  No new external calls are introduced by the readiness package.
- [ ] If dealing with ingestion, is the manual fallback preserved?
  Not applicable.

## UX Framework Alignment

- [ ] Does this strictly enforce Generation Before Recognition?
  Yes. Score-eligible evidence remains limited to learner reconstruction events:
  `cold_attempt` and `spaced_redrill`.
- [ ] Does the graph still tell the truth?
  Yes with documented residual risk. Full validation passed, and
  `strong_cold_path`, repair dialogue, post-bridge transfer, scaffolds, help,
  and route/context events remain graph-neutral.
- [ ] Is the active cognitive target explicitly clear to the user?
  No learner-facing copy changes are introduced by the readiness package.

## Validation Evidence

Completed so far:

- Phase 1: `node --test tests/js/event-facts.test.mjs tests/js/event-facts-contract.test.mjs`
  passed, 11 tests.
- Phase 1: `git diff --stat` recorded candidate baseline scope.
- Phase 1: `git diff --check` passed.
- Phase 2: focused event-facts/dashboard/session-rehydration suite passed,
  28 tests.
- Phase 2: `git diff --check` passed.
- Phase 3: focused event-facts/taxonomy/dashboard/rehydration/router suite
  passed, 51 tests.
- Phase 3: `git diff --check` passed.
- Phase 4: focused event-facts suite passed, 11 tests.
- Phase 4: `git diff --check` passed.
- Phase 5: focused event-facts/taxonomy/dashboard/rehydration/router suite
  passed, 52 tests.
- Phase 5: `git diff --check` passed.
- Phase 5: the new repair-hint contract test failed before the handler fix, then
  passed after adding `text: repairInput` to `repair_hint_requested`.
- Phase 6: `./scripts/check-canon-drift.sh` passed.
- Phase 6: full self-contained JS suite excluding loop UI passed, 181 tests.
- Phase 6: `.venv/bin/pytest tests -q` passed, 119 tests with one third-party
  deprecation warning.
- Phase 6: `./socratink-harness replay` passed, 8 promoted cases.
- Phase 6: `./socratink-harness routing-proof` passed, 8 promoted cases.
- Phase 6: dynamic-port loop UI passed, 19 tests, port `63697`, log
  `.qa-runs/event-facts-readiness/loop-server-63697.log`.
- Phase 6: `git diff --check` passed.

## Residual Risks

- Closed in Phase 5: `repair_hint_requested` now persists the learner command
  text and has a contract guard.
- `acceptable residual risk`: static definition drift can recur if graph-honesty
  policy changes without updating event-facts tests.
- `acceptable residual risk`: event-facts imports into taxonomy/dashboard are
  safe in the current diff but require review to prevent future ownership creep.
- `acceptable residual risk`: fail-closed rehydration may reject older partial
  logs.

## Readiness Decision

`READY_WITH_RESIDUAL_RISK`

The readiness package has no unresolved `must-fix` or `should-fix` findings.
Residual risks are documented and accepted for PR review.
