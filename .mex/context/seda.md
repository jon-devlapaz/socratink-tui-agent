---
name: seda
description: SEDA event-loop routing contract for phases, handlers, event facts, and pacing.
triggers:
  - "seda"
  - "nextPhase"
  - "handler"
  - "event"
  - "phase"
  - "routing"
edges:
  - target: context/architecture.md
    condition: when needing the full runtime flow around SEDA
  - target: context/graph-honesty.md
    condition: when event roles affect evidence or derived graph state
  - target: context/bridge.md
    condition: when a phase handler calls an LLM bridge action
  - target: patterns/change-seda-event.md
    condition: when adding or changing an event, phase, or routing branch
last_updated: 2026-06-23
---

# SEDA

## Runtime Contract

```text
runSedaLoop()
  -> HANDLERS[phase](ctx)
  -> handler appends one or more eventBuilders facts
  -> nextPhase(events) reads events.at(-1)
  -> afterHandler may stop/pause transport, not rewrite routing truth
```

Handlers own lane work. `nextPhase(events)` owns control flow. `training-derive` audits graph truth after facts exist.

## Phase and Event Rules

- `DIRECT_PHASE` maps simple event types to next phases.
- Fine policy lives in `nextPhase`: `cold_attempt` classification, `repair_dialogue_turn` bridge readiness/action/cap, recovery closure.
- The routing-relevant fact must be appended last because `nextPhase(events)` reads `events.at(-1)`.
- `events[]` is append-only; do not use `pop`, `splice`, `shift`, or `sort`.
- Runtime event shapes must come from `eventBuilders` in `lib/seda/event-facts.mjs`.

## Main Phases

`idle`, `ignition`, `substrate_gate`, `route`, `cold_attempt`, `strong_cold_path`, `delta`, `repair_dialogue`, `repair_recovery`, `repair_abandoned`, `repair`, `model_bridge`, `post_bridge_transfer`, `spacing`, `spaced_redrill`.

## Verification

- Fast gate: `npm test` / `./scripts/check-seda-spine.sh`.
- SEDA tests include architecture fitness, `next-phase`, event facts, pacing stops, routing proofs, and the harness routing-proof command.
- If behavior becomes a regression gate, update promoted cases in `learning_cases/` and run replay.
