# SEDA Event-Facts Readiness Review

Status: `IN_PROGRESS`

Candidate baseline: working tree diff from baseline ref
`00448b2d76e5889a1760e0fa3b2182af47baf57f`.

Review scope: qualify the completed SEDA event-facts architecture baseline for
readiness without broad refactor or product-policy change. The event log remains
the authoritative state machine; `event-facts.mjs` may construct runtime event
facts and declare static invariants only.

## Scope

In scope:

- Runtime SEDA event construction and static event-fact definitions.
- Append-only event-log invariants.
- Graph-neutral versus score-eligible separation.
- Replay-required field enforcement.
- Dashboard summary counts derived from event-fact definitions.
- Canonical learner-loop projection boundaries.
- Hosted-loop pacing and session rehydration risk.

Out of scope:

- Prompt policy changes.
- Training derivation rule changes.
- Product metric formula redesign.
- Canonical projection cardinality changes beyond direct safe defaults.
- Broad handler or router refactors.

## Source Paths Inspected

Core documents:

- `AGENTS.md`
- `HARNESS.md`
- `HARNESS-TRACEABILITY.md`
- `docs/architecture/seda-event-facts.md`

Core runtime files:

- `lib/seda/event-facts.mjs`
- `lib/seda/next-phase.mjs`
- `lib/seda/event-taxonomy.mjs`
- `lib/seda/dashboard-metrics.mjs`
- `lib/seda/session-rehydration.mjs`
- `lib/seda/handlers/cold-attempt.mjs`
- `lib/seda/handlers/repair-dialogue.mjs`
- `lib/seda/handlers/post-bridge-transfer.mjs`
- `lib/seda/handlers/substrate-gate.mjs`

Core tests:

- `tests/js/event-facts.test.mjs`
- `tests/js/event-facts-contract.test.mjs`
- `tests/js/event-taxonomy.test.mjs`
- `tests/js/dashboard.test.mjs`
- `tests/js/session-rehydration.test.mjs`
- `tests/js/next-phase.test.mjs`

## Candidate Baseline

Current diff summary recorded during Phase 1:

```text
AGENTS.md                                  |  6 ++++
app.mjs                                    |  3 +-
lib/bridge/client.mjs                      |  7 ++---
lib/loop-server/session.mjs                |  3 +-
lib/loop-server/version.mjs                |  2 +-
lib/seda/bridge-fail-closed.mjs            |  9 +++---
lib/seda/dashboard-metrics.mjs             | 46 +++++++++++-------------------
lib/seda/event-taxonomy.mjs                | 38 ++++++++++++++++++++++--
lib/seda/handlers/*.mjs                    | handler append sites migrated to builders
lib/seda/meta-command.mjs                  |  9 +++---
lib/seda/repair-dialogue-helpers.mjs       | 17 +++++------
lib/seda/session-rehydration.mjs           | 20 ++++++-------
public/loop/index.html                     |  2 +-
public/loop/loop.js                        |  2 +-
tests/js/dashboard.test.mjs                | 19 ++++++++++++
tests/js/repair-buckets.test.mjs           |  1 +
30 files changed, 193 insertions(+), 204 deletions(-)
```

New baseline artifacts in the working tree:

- `docs/architecture/seda-event-facts.md`
- `lib/seda/event-facts.mjs`
- `tests/js/event-facts-contract.test.mjs`
- `tests/js/event-facts.test.mjs`

No files were staged, reverted, or rewritten while recording this baseline.

## Requirements Trace Baseline

| Requirement | Source anchors | Implementation anchors | Verification path | Phase 1 status |
| --- | --- | --- | --- | --- |
| Append-only event authority: `events[]` is the authoritative fact chain and must not be mutated in place. | `AGENTS.md` State section; `HARNESS.md` Architectural invariant 1; `HARNESS-TRACEABILITY.md` Horizontal traceability rules; `docs/architecture/seda-event-facts.md` Runtime Event Rules | `lib/seda/event-facts.mjs` builders; migrated handler append sites; `lib/seda/next-phase.mjs` reads only events | `tests/js/event-facts-contract.test.mjs` checks append-site inventory and rejects event-array mutators; `./socratink-harness replay` in final ladder | Pass: focused event-facts contract tests passed |
| Graph-neutral versus score-eligible separation must preserve graph honesty. Source, learner goal, route, scaffolds, `/help`, and `/hint` are context; cold attempts and spaced re-drills are the score-eligible evidence candidates. | `AGENTS.md` Graph Honesty Rules and Boundaries; `HARNESS.md` Event roles and Traversal layers; `docs/architecture/seda-event-facts.md` Runtime Event Rules | `EVENT_FACT_DEFINITIONS` in `lib/seda/event-facts.mjs`; `lib/seda/dashboard-metrics.mjs` derives static type sets from definitions | `tests/js/event-facts.test.mjs` verifies `cold_attempt` and `spaced_redrill` only as score-eligible; `tests/js/event-facts-contract.test.mjs` verifies taxonomy separation | Pass: focused event-facts tests passed |
| `strong_cold_path` must remain graph-neutral routing telemetry, not score-eligible evidence. | `AGENTS.md` Strong cold path rule; `docs/architecture/seda-event-facts.md` KC-required event types; `HARNESS.md` Event roles | `eventBuilders.strongColdPath()`; `EVENT_FACT_DEFINITIONS.strong_cold_path` | `tests/js/event-facts.test.mjs` and `tests/js/event-facts-contract.test.mjs` assert graph-neutral true and score-eligible false | Pass |
| Replay-required fields must be declared centrally and enforced before rehydration depends on them. | `AGENTS.md` State section; `HARNESS.md` Observability surfaces; `HARNESS-TRACEABILITY.md` Operations and maintenance | `required_fields` in `lib/seda/event-facts.mjs`; `requirePersistedFields()` in `lib/seda/session-rehydration.mjs` | `tests/js/event-facts.test.mjs` checks missing required fields fail clearly; `tests/js/session-rehydration.test.mjs` in later phases; final replay command | Pass for focused builder enforcement; broader rehydration covered in phases 2, 3, and 6 |
| Hosted-loop pacing may batch multiple SEDA phases per HTTP turn, but routing truth must still come from append-only events. | `AGENTS.md` Learned Workspace Facts; `HARNESS.md` Orchestrator owns control flow; `HARNESS-TRACEABILITY.md` Sub-system verification | `lib/loop-server/session.mjs`; `lib/seda/next-phase.mjs`; `lib/seda/run-loop.mjs`; `public/loop/loop.js` health/version surfaces | Server-backed `tests/js/loop-chat-ui.test.mjs` in Phase 6; static review in Phase 3 | Pending broader hosted validation |
| Dashboard truth is read-only observability and must not mutate events, routing, or evidence state. | `HARNESS.md` Observability is read-only; `HARNESS-TRACEABILITY.md` Fact -> Audit -> Broadcast; `docs/architecture/seda-event-facts.md` Dashboard Projection Relationship | `lib/seda/dashboard-metrics.mjs` imports static definitions only for summary counts; product metric formulas remain local to dashboard metrics | `tests/js/dashboard.test.mjs` in phases 2, 3, and 6; static diff audit in Phase 3 | Pending broader dashboard validation |
| Ownership non-drift: `event-facts.mjs` must not route, derive training state, define canonical projection cardinality, calculate product metrics, or create learner-facing copy. | `AGENTS.md` Runtime event construction rule; `HARNESS.md` Orchestrator and derivation invariants; `docs/architecture/seda-event-facts.md` Destination Rule and Non-Goals | Routing: `lib/seda/next-phase.mjs`; derivation: `lib/canon/training-derive.js`; taxonomy cardinality: `lib/seda/event-taxonomy.mjs`; formulas: `lib/seda/dashboard-metrics.mjs` | `tests/js/event-facts-contract.test.mjs` checks architecture doc destination rule; Phase 3 independent diff review | Pass for documented boundary; deeper diff audit pending |

## Hazard Review

### Hazards Reduced By Event-Facts Centralization

| Hazard reduced | Severity | Likelihood before -> after | Owner module | Detection / mitigation evidence | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Evidence corruption from hand-authored graph flags, especially repair or transfer events accidentally becoming score-eligible. | Critical | Medium -> Low | `lib/seda/event-facts.mjs`; handler append sites | `EVENT_FACT_DEFINITIONS` centralizes `graph_neutral` and `score_eligible`; `assertEventInvariants()` rejects events that are both graph-neutral and score-eligible; `tests/js/event-facts.test.mjs` verifies evidence events and invariant failures. | Low: future event types still need definition review. |
| `strong_cold_path` counted as evidence instead of routing telemetry. | Critical | Medium -> Low | `lib/seda/event-facts.mjs`; `lib/seda/dashboard-metrics.mjs` | `eventBuilders.strongColdPath()` sets `graph_neutral: true`; `tests/js/event-facts.test.mjs`, `tests/js/event-facts-contract.test.mjs`, and `tests/js/dashboard.test.mjs` prove it is graph-neutral and excluded from evidence candidate counts. | Low: protected by tests and static definitions. |
| Replay/live divergence caused by required event fields being implied in handlers but absent from persisted logs. | High | Medium -> Low | `lib/seda/event-facts.mjs`; `lib/seda/session-rehydration.mjs` | `required_fields` lives in definitions; `session-rehydration.mjs` calls `eventDefinition(event.type).required_fields`; `tests/js/event-facts.test.mjs` verifies missing replay fields fail clearly; `tests/js/session-rehydration.test.mjs` covers resume paths and incomplete route failure. | Medium-low: only fields declared as required are enforced; broader semantic adequacy still needs replay/harness proof. |
| Dashboard graph-neutral and evidence candidate counts drifting from runtime event truth. | High | Medium -> Low | `lib/seda/dashboard-metrics.mjs`; `lib/seda/event-facts.mjs` | Dashboard summary sets are derived from `EVENT_FACT_DEFINITIONS`; `tests/js/dashboard.test.mjs` proves `bridge_error` counts as graph-neutral and `strong_cold_path` stays out of evidence candidates. | Low for summary counts; product metric formulas remain separately owned. |
| Future bypass of `eventBuilders` hiding hand-authored event shape drift. | Medium | Medium -> Medium-low | Handler modules; `tests/js/event-facts-contract.test.mjs` | Append-site inventory and helper-constructed event inventory are characterized; `docs/architecture/seda-event-facts.md` records destination rule and append-site counts. | Medium: tests detect count drift, but code review must still inspect whether new append sites use builders. |

### Hazards Introduced By Event-Facts Centralization

| Hazard introduced | Severity | Likelihood | Owner module | Detection / mitigation evidence | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Static definition drift from `AGENTS.md` / `HARNESS.md` graph-honesty rules. | Critical | Medium | `lib/seda/event-facts.mjs` | `tests/js/event-facts-contract.test.mjs` locks runtime event taxonomy groups; this readiness review traces source anchors to definitions; final replay and full JS suite re-check behavior. | Medium-low: static lists need review whenever pedagogy policy changes. |
| Ownership creep: event-facts becomes a router, derivation engine, canonical taxonomy owner, product metric calculator, or copy source. | High | Medium | `lib/seda/event-facts.mjs`; architecture docs | Destination rule in `docs/architecture/seda-event-facts.md`; `tests/js/event-facts-contract.test.mjs` checks the architecture note names ownership boundaries; Phase 3 diff review inspects imports and responsibilities. | Medium until Phase 3 independent diff audit completes. |
| False confidence from centralized builders: builder shape can pass unit tests while a handler still appends semantically wrong payloads. | High | Medium | SEDA handlers; `lib/seda/session-record.mjs`; harness replay | Focused tests prove representative builders; final `./socratink-harness replay`, routing proof, and full JS suite validate promoted traces. | Medium: representative builder tests are not exhaustive semantic validation. |
| Replay-required field enforcement could reject older/incomplete logs that previously resumed partially. | Medium | Medium | `lib/seda/session-rehydration.mjs` | `CannotRehydrateSession` provides explicit failure instead of partial ctx resume; `tests/js/session-rehydration.test.mjs` covers incomplete route failure. | Medium-low: acceptable fail-closed behavior, but production support should treat old-log incompatibility as an operational residual risk. |
| Dashboard product metrics could be confused with static event summary counts because both import event taxonomy/facts. | High | Low | `lib/seda/dashboard-metrics.mjs`; `lib/seda/event-taxonomy.mjs` | Product metric tests assert denominators from canonical events and metric-specific denominators; `event-facts.mjs` supplies static summary flags only. | Low: tests distinguish summary counts from formulas. |

### Residual Risks After Phase 2

- Medium-low: static event definitions must be reviewed whenever graph-honesty policy changes in `AGENTS.md` or `HARNESS.md`.
- Medium-low: event-builder centralization reduces duplicated shapes but does not by itself prove every handler emits semantically correct payloads; Phase 5 closed the only concrete data-shape mismatch found, and Phase 6 replay/full-suite validation remains required.
- Medium-low: fail-closed rehydration can reject older incomplete logs; this is preferable to partial replay but should be called out in PR risk notes.
- Medium-low: ownership creep remains a future-review risk, but Phase 3 line-level inspection found no current ownership creep.

## Independent Diff Review

### Review Method

Phase 3 inspected the current diff and final files for:

- `lib/seda/event-facts.mjs`
- `lib/seda/next-phase.mjs`
- `lib/seda/event-taxonomy.mjs`
- `lib/seda/dashboard-metrics.mjs`
- `lib/seda/session-rehydration.mjs`
- representative migrated handlers: `cold-attempt.mjs`,
  `repair-dialogue.mjs`, `post-bridge-transfer.mjs`,
  `substrate-gate.mjs`, plus append-site inventory output
- `tests/js/event-facts.test.mjs`
- `tests/js/event-facts-contract.test.mjs`
- `docs/architecture/seda-event-facts.md`

No must-fix runtime findings were identified in Phase 3.

### Findings

| Severity | Finding | Evidence | Classification | Readiness impact |
| --- | --- | --- | --- | --- |
| P2 | `repair_hint_requested` is classified as learner text and lists `text` in persisted fields, but the migrated hint append site recorded hint metadata without a text payload before Phase 5. | `lib/seda/event-facts.mjs:82-93` marks `repair_hint_requested` as learner text; `lib/seda/event-facts.mjs:228-235` lists `text` as persisted; Phase 5 added `text: repairInput` at `lib/seda/handlers/repair-dialogue.mjs:93-101` and a contract guard at `tests/js/event-facts-contract.test.mjs:327-337`. | `closed should-fix` | Closed by narrow observability/data-shape hardening. No graph truth, routing, or score-eligibility behavior changed. |
| P3 | Static definition drift remains a future maintenance risk because graph-neutral, score-eligible, learner-text, routing, KC, and replay lists are centralized. | `lib/seda/event-facts.mjs:52-161`; `tests/js/event-facts-contract.test.mjs` locks expected lists and append-site inventory; `docs/architecture/seda-event-facts.md:45-173` mirrors runtime rules. | `acceptable residual risk` | Acceptable with focused tests, architecture note, and final replay/full-suite gates. |
| P3 | Direct imports from event facts into taxonomy and dashboard could become ownership creep if later changes move formulas or projection cardinality into event facts. | `lib/seda/event-taxonomy.mjs:113-189` imports runtime defaults only for one-to-one runtime mappings; `lib/seda/dashboard-metrics.mjs:206-232` derives summary type sets only; `docs/architecture/seda-event-facts.md:223-270` documents exceptions. | `acceptable residual risk` | Current diff keeps cardinality and formulas outside `event-facts.mjs`; review needed on future edits. |
| P3 | Fail-closed replay can reject older partial logs instead of best-effort resume. | `lib/seda/session-rehydration.mjs:65-73`, `117-142`, `148-149`, and `224-235`; `lib/seda/event-facts.mjs:248-265` required fields; `tests/js/session-rehydration.test.mjs` covers incomplete route failure. | `acceptable residual risk` | This is intentional implementation risk, not product-truth risk: failing closed is safer than reconstructing partial ctx. |

### Coverage Notes

- Routing ownership is unchanged: `nextPhase(events)` remains pure and route
  decisions still live in `lib/seda/next-phase.mjs:30-75`.
- Score eligibility is constrained to `cold_attempt` and `spaced_redrill` in
  `lib/seda/event-facts.mjs:80`; `strong_cold_path` is graph-neutral at
  `lib/seda/event-facts.mjs:52-78` and built via
  `lib/seda/event-facts.mjs:449-453`.
- Dashboard product metric formulas still use canonical events in
  `lib/seda/dashboard-metrics.mjs:257-280`; event facts only drive summary
  memberships at `lib/seda/dashboard-metrics.mjs:206-232`.
- Canonical projection cardinality remains in `lib/seda/event-taxonomy.mjs:93-111`;
  event facts only supply static defaults for safe one-to-one mappings at
  `lib/seda/event-taxonomy.mjs:113-189`.
- Representative handlers now call `eventBuilders` for migrated events, for
  example `lib/seda/handlers/cold-attempt.mjs:75-125`,
  `lib/seda/handlers/post-bridge-transfer.mjs:35-163`,
  `lib/seda/handlers/repair-dialogue.mjs:93-220`, and
  `lib/seda/handlers/substrate-gate.mjs:20-218`.

### Must-Fix Status

No unresolved `must-fix` findings remain after Phase 3. The only concrete
`should-fix` finding, the `repair_hint_requested` observability/data-shape
mismatch, was closed by Phase 5 narrow hardening.

## Qualification Evidence

| Command | Phase | Result |
| --- | --- | --- |
| `node --test tests/js/event-facts.test.mjs tests/js/event-facts-contract.test.mjs` | 1 | Pass: 11 tests, 0 failures, duration 63.078083 ms |
| `git diff --stat` | 1 | Pass: candidate baseline scope recorded above |
| `git diff --check` | 1 | Pass: no whitespace errors |
| `node --test tests/js/event-facts.test.mjs tests/js/event-facts-contract.test.mjs tests/js/dashboard.test.mjs tests/js/session-rehydration.test.mjs` | 2 | Pass: 28 tests, 0 failures, duration 64.35775 ms |
| `git diff --check` | 2 | Pass: no whitespace errors |
| `node --test tests/js/event-facts.test.mjs tests/js/event-facts-contract.test.mjs tests/js/event-taxonomy.test.mjs tests/js/dashboard.test.mjs tests/js/session-rehydration.test.mjs tests/js/next-phase.test.mjs` | 3 | Pass: 51 tests, 0 failures, duration 84.562667 ms |
| `git diff --check` | 3 | Pass: no whitespace errors |
| `node --test tests/js/event-facts.test.mjs tests/js/event-facts-contract.test.mjs` | 4 | Pass: 11 tests, 0 failures, duration 179.935167 ms |
| `git diff --check` | 4 | Pass: no whitespace errors |
| `node --test tests/js/event-facts.test.mjs tests/js/event-facts-contract.test.mjs tests/js/event-taxonomy.test.mjs tests/js/dashboard.test.mjs tests/js/session-rehydration.test.mjs tests/js/next-phase.test.mjs` | 5 | Pass: 52 tests, 0 failures, duration 85.663 ms |
| `git diff --check` | 5 | Pass: no whitespace errors |
| `./scripts/check-canon-drift.sh` | 6 | Pass: vendored canon matches committed checksums |
| `find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print \| sort \| xargs node --test` | 6 | Pass: 181 tests, 0 failures, duration 1841.750125 ms |
| `.venv/bin/pytest tests -q` | 6 | Pass: 119 tests, 1 third-party deprecation warning, duration 35.96 s |
| `./socratink-harness replay` | 6 | Pass: 8 promoted cases |
| `./socratink-harness routing-proof` | 6 | Pass: 8 promoted cases, terminal phase `null` for each |
| Dynamic-port fake-LLM `loop-server.mjs` plus `SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:$PORT node --test tests/js/loop-chat-ui.test.mjs` | 6 | Pass: 19 tests, 0 failures, duration 11697.307375 ms; port `63697`; log `.qa-runs/event-facts-readiness/loop-server-63697.log` |
| `git diff --check` | 6 | Pass: no whitespace errors |

The full validation ladder passed in Phase 6.

## Residual Risks

See Phase 2 residual-risk list above and the Phase 3 finding table. Phase 3
confirmed no `must-fix` findings, and Phase 5 closed the only `should-fix`
observability/data-shape residual.

Accepted residual risks after full validation:

- Static event definitions still require review when graph-honesty policy
  changes.
- Event-facts imports in taxonomy/dashboard remain acceptable only while they
  provide static one-to-one defaults and summary memberships, not projection
  cardinality or product metric formulas.
- Fail-closed rehydration can reject older incomplete logs; this is intentional
  and safer than partial ctx reconstruction.
- Pytest emits one third-party `google.genai` deprecation warning from the local
  environment; it is not introduced by this readiness work.

## Hardening Requirement Before Final Audit

No unresolved hardening is required before Phase 6. Phase 5 added a narrow
contract test that failed before the fix, then added `text: repairInput` to
`repair_hint_requested` events so the handler matches the static learner-text and
persisted-field definition. This was documentation/observability hardening only;
it did not alter routing, graph truth, score eligibility, prompt policy, or
product metric formulas.

## Readiness Decision

`READY_WITH_RESIDUAL_RISK`

The candidate baseline is ready for PR review with residual risks documented
above. No unresolved `must-fix` or `should-fix` findings remain. Final
`git status --short` reports the expected candidate baseline files plus the
readiness package artifacts; no unrelated churn was introduced by this review.
