# Karpathy-Like Baseline

Created: 2026-06-07

Final assessment: before `6.5/10`, after `8.0/10`. The SEDA spine was already
simple; this run tightened the surrounding repo surface by naming the spine
check, correcting ambiguous evidence/completion wording, and adding focused
anti-drift guards.

## Simple SEDA Spine

1. Handlers in `lib/seda/handlers/` do lane work and append runtime facts.
2. Runtime facts are built through `lib/seda/event-facts.mjs`.
3. `lib/seda/next-phase.mjs` owns `nextPhase(events)` routing.
4. `lib/seda/run-loop.mjs` dispatches the next handler; `lib/loop-server/session.mjs` adapts the same loop for HTTP.
5. `lib/seda/event-taxonomy.mjs` and `lib/observability/dashboard-metrics.mjs` are read-only projections.

## Non-Negotiables

- `events[]` stays append-only and authoritative.
- `nextPhase(events)` stays pure and is the only control-flow owner.
- Graph-neutral events stay separate from score-eligible evidence.
- Bridge prompts stay in `prompt_templates.py`; Node calls `bridge.py` through `lib/bridge/client.mjs`.
- Hosted pacing stops are transport boundaries after facts are appended, not runtime routing.

## Current Friction Table

| Friction | Evidence | Classification | Reason |
| --- | --- | --- | --- |
| Large runtime and test surfaces | `vendor/python/ai_service.py` ~956 lines, `bridge_fake.py` ~848 lines, `lib/observability/dashboard-metrics.mjs` ~743 lines, `tests/js/loop-chat-ui.test.mjs` ~649 lines | leave-alone | Heavy files are real product seams; changing them for size alone would be refactor theater. |
| Historical trace/log artifacts dominate raw line counts | `learning_cases/traces/**/session.json` and `.qa-runs/**/session.json` appear in the largest-file scan | leave-alone | They are replay evidence, not code complexity. |
| Overlapping architecture docs | `AGENTS.md`, `HARNESS.md`, `HARNESS-TRACEABILITY.md`, `CONTEXT.md`, README, and implementation reports all describe parts of the SEDA contract | fix-now | Keep canonical docs crisp and point to the right owner instead of letting overloaded terms drift. |
| Validation command spread | README, `AGENTS.md`, `HARNESS.md`, `HARNESS-TRACEABILITY.md`, CI, and implementation reports each list different slices | fix-now | Agents need one obvious spine check and a separate full release ladder. |
| Recently corrected terminology is easy to regress | Current searches show `floor`, `caseComplete`, hosted `complete`, `session complete`, `prompt-required`, evidence candidates, and repair wording across canonical docs | guard | Terms are product-truth boundaries; executable/static guards are cheaper than repeated review comments. |
| Server-backed loop UI test mixed into broad mental model | README and `AGENTS.md` correctly exclude `loop-chat-ui.test.mjs` from self-contained JS, but older docs include broad globs | guard | Keep hosted browser proof separate from fast spine validation. |
| Future router abstraction temptation | `AGENTS.md` already warns against replacing readable `nextPhase` branches with a generic router framework | leave-alone | The rule exists and should be preserved, not expanded into a second framework. |

## Spine Check Entrypoint

Use `./scripts/check-seda-spine.sh` when changing the SEDA spine or reviewing a
small architecture patch. It runs existing checks for router purity, append-only
event writes, event-fact invariants, hosted pacing boundaries, static routing
proofs, and promoted trace routing via `./socratink-harness routing-proof`.

Use the full release ladder for broader changes: canon drift, all self-contained
JS tests, Python tests, harness replay, routing proof, server-backed loop UI, and
`git diff --check`.

Final full ladder evidence is recorded in `REPORT.md`.

## Language Changes Log

- `AGENTS.md`: repaired the boundary section so `repair` is graph-neutral
  routing/telemetry, not an evidence candidate.
- `CONTEXT.md`: sharpened `Hosted Turn Boundary` as a glossary distinction
  between prompt-required learner pauses and post-handler pacing stops.
- `HARNESS.md`: changed the repair-path label so case completion is not
  conflated with session completion or graph solidification.
- `docs/greenfield-ai-native-implementation-plan.md`: corrected historical
  planning wording that grouped repairs with evidence candidates.

## Guard Map

| Confusion prevented | Guard | Status |
| --- | --- | --- |
| `repair` reintroduced as an evidence candidate | `tests/js/architecture-anti-drift.test.mjs` checks canonical docs for repair/evidence-candidate wording | New Phase 4 guard |
| Prompt-only canonical events entering authoritative `events[]` or changing routing | `tests/js/event-taxonomy.test.mjs` and `tests/js/event-taxonomy-dashboard-qa.test.mjs` cover prompt-only projections and `nextPhase(events)` compatibility | Existing guard |
| Hosted pacing stops becoming routing logic | `tests/js/loop-pacing-stops.test.mjs` keeps post-handler stops explicit and excludes prompt-bound/system-only events | Existing guard |
| `caseComplete` conflated with hosted `complete` | `tests/js/architecture-anti-drift.test.mjs` asserts session responses can be case-complete without session-complete, and session-complete without case-complete | New Phase 4 guard |

## Worktree Baseline

`git status --short` at Phase 1 start:

```text
 M socratink-loop-server
```

`socratink-loop-server` started as pre-existing unrelated work for this Supergoal
and was intentionally left untouched during the five-phase run.

Follow-up change: the user explicitly asked to fold this wrapper change into the
same work. The final report treats `socratink-loop-server` as goal-owned and
the loop version is bumped accordingly.

## Debloat

Repo-native size/hygiene assessment (pygount scope, JSON/trace path
constraints, do-not-do list): `debloat-assessment.md` in this folder.
