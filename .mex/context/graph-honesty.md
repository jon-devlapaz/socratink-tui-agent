---
name: graph-honesty
description: Evidence, scoring, graph derivation, and learner-facing truth rules.
triggers:
  - "graph"
  - "evidence"
  - "solidified"
  - "score"
  - "mastery"
  - "derivation"
edges:
  - target: context/architecture.md
    condition: when needing the broader fact-audit-broadcast flow
  - target: context/seda.md
    condition: when graph roles depend on event type or routing order
  - target: context/bridge.md
    condition: when evaluator or repair-dialogue bridge fields are being interpreted
  - target: patterns/change-graph-evidence.md
    condition: when changing evidence eligibility, derivation, or mastery copy
last_updated: 2026-06-23
---

# Graph Honesty

## Truth Sources

- Learner evidence candidates: `cold_attempt` and `spaced_redrill`.
- Evaluator labels: inputs to storage, not graph state.
- Derived graph state: `lib/canon/training-derive.js`.
- Observability: session records, replay, and dashboard read from facts; they do not route.

## Do Not Conflate

- `classification === "solid"` means the evaluator judged one attempt strong.
- `repair_dialogue_turn.bridge_ready === true` means the learner may see model bridge.
- `primed` means one useful evidence step exists, not durable mastery.
- `solidified` requires two strong attempts at least 18 hours apart.
- Case complete, session complete, bridge gate passed, and KC complete are different signals.

## Evidence Rules

- Substrate, repair, help, scaffold, reveal, model-bridge, and post-bridge transfer events are graph-neutral unless the event contract says otherwise.
- `cold-gating.mjs` maps evaluator `solid` to store `strong`; other classifications map to partial/thin/wrong-direction.
- Evidence holds must be explained when evaluator output and derived graph state disagree.
- Learner-facing copy should use Confirmed Substrate, Substrate Gate, Own-Words Repair, Model Bridge, and graph state terms from `.mex/context/product-vocabulary.md`.
