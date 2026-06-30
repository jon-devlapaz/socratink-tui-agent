---
name: change-graph-evidence
type: pattern
description: Change evidence eligibility, training derivation, graph state, or mastery copy.
triggers:
  - "evidence"
  - "solidified"
  - "training-derive"
  - "graph truth"
edges:
  - target: context/graph-honesty.md
    condition: always load before changing evidence or graph state
  - target: context/seda.md
    condition: when graph behavior depends on event type or phase order
last_updated: 2026-06-30
---

# Change Graph Evidence

## Context

Load `context/graph-honesty.md`, `context/product-vocabulary.md`, and `context/seda-harness.md`. If event roles change, also load `context/seda.md`.

## Steps

1. Identify whether the change is event eligibility, store classification, derivation, or copy.
2. For event eligibility, edit `lib/seda/event-facts.mjs` and the handler using `eventBuilders`.
3. For derivation, edit `lib/canon/training-derive.js`.
4. For evaluator-to-store mapping, edit `lib/seda/cold-gating.mjs`.
5. Update replay cases or focused tests that assert final node state or evidence holds.

## Gotchas

- `bridge_ready` is not mastery.
- Evaluator `solid` is not `solidified`.
- Repair and substrate events are graph-neutral.
- `solidified` requires two strong attempts at least 18 hours apart.

## Verify

- [ ] `npm test`
- [ ] Relevant derivation pytest module.
- [ ] Harness replay if promoted cases or invariants changed.

## Debug

When graph state looks wrong, inspect stored attempts before UI copy. The derivation source of truth is `node_records[].attempts[]`, not dashboard badges.

## Update Scaffold
- [ ] Update `.mex/ROUTER.md` "Current Project State" if what's working/not built has changed
- [ ] Update any `.mex/context/` files that are now out of date
- [ ] If this is a new task type without a pattern, create one in `.mex/patterns/` and add it to the pattern index
