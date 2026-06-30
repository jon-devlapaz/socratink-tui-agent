---
name: change-seda-event
type: pattern
description: Add or change a SEDA event, phase, handler route, or pacing branch without breaking the event-clock contract.
triggers:
  - "new event"
  - "new phase"
  - "nextPhase"
  - "handler route"
edges:
  - target: context/seda.md
    condition: always load before changing SEDA routing
  - target: context/graph-honesty.md
    condition: when the event is evidence-related or graph-neutral
last_updated: 2026-06-30
---

# Change SEDA Event

## Context

Load `context/seda.md`, `context/seda-harness.md`, and `context/conventions.md`. If the event touches evidence, load `context/graph-honesty.md`.

## Steps

1. Add or update the event definition in `lib/seda/event-facts.mjs`.
2. Add or update the `eventBuilders` method; keep required fields explicit.
3. Append the builder result from the handler in `lib/seda/handlers/`.
4. If routing changes, update `DIRECT_PHASE` or fine policy in `lib/seda/next-phase.mjs`.
5. Make the routing-relevant event the last event appended in that handler turn.
6. Add or update the smallest JS test under `tests/js/`.

## Gotchas

- `nextPhase(events)` reads only `events.at(-1)`.
- Dashboard taxonomy is read-only; do not append from `event-taxonomy.mjs`.
- Graph-neutral and score-eligible cannot both be true.

## Verify

- [ ] `npm test`
- [ ] New or changed event has required fields covered by event-facts tests or a focused test.
- [ ] New route appears in routing proof if it affects promoted traces.

## Debug

If routing surprises you, print the last event type from the failing trace and inspect `DIRECT_PHASE` plus the fine-policy branches in `next-phase.mjs`.

## Update Scaffold
- [ ] Update `.mex/ROUTER.md` "Current Project State" if what's working/not built has changed
- [ ] Update any `.mex/context/` files that are now out of date
- [ ] If this is a new task type without a pattern, create one in `.mex/patterns/` and add it to the pattern index
