# SEDA Event Facts

This note records the runtime event-fact seam after migrating SEDA append sites
behind `lib/seda/event-facts.mjs`. The event log remains append-only and
authoritative; the event-fact module owns construction helpers and static
invariants only.

## Module Interface

`lib/seda/event-facts.mjs` exports:

- `EVENT_FACT_DEFINITIONS` - one definition per runtime SEDA event type.
- `EVENT_FACT_TYPES` - the sorted runtime event type list.
- `eventDefinition(type)` - lookup with a clear unknown-type error.
- `assertEventInvariants(event)` - validates required `kc_id`, required replay
  fields, and graph-neutral/score-eligible conflicts.
- `buildEvent(type, fields)` - generic construction helper.
- `eventBuilders` - named builders used by SEDA handlers and helper modules.

Each definition carries these static fields:

- `graph_neutral`
- `score_eligible`
- `learner_text`
- `routing_fact`
- `requires_kc_id`
- `replay_relevant`
- `persisted_fields`
- `required_fields`

## Builder Families

Named builders cover the current runtime families:

- substrate facts: seed offered, refinement, support exhausted, confirmed
- cold facts: help turn, support exhausted, scored cold attempt
- repair facts: gap identified, repair dialogue turns, hints, repair,
  abandonment, recovery lifecycle, recovery turns
- bridge/model facts: bridge errors and model bridge
- post-bridge facts: decision, skipped transfer, transfer check
- route facts: route generated and route retry
- spacing/evidence facts: spacing advanced, spaced redrill, evidence hold
- meta and idle/session facts: meta turn, idle concept, redrill, exit

## Runtime Event Rules

Current runtime event types:

- `bridge_error`
- `cold_attempt`
- `cold_help_turn`
- `cold_support_exhausted`
- `evidence_hold_recorded`
- `gap_identified`
- `idle_exit`
- `idle_new_concept`
- `idle_redrill`
- `launch_attempt`
- `learner_goal_set`
- `meta_turn`
- `model_bridge`
- `post_bridge_transfer_check`
- `post_bridge_transfer_decision`
- `post_bridge_transfer_skipped`
- `repair`
- `repair_abandoned`
- `repair_cap_selected`
- `repair_dialogue_turn`
- `repair_hint_requested`
- `repair_recovery_closed`
- `repair_recovery_started`
- `repair_recovery_turn`
- `repair_state_bucketed`
- `route_generated`
- `route_retry`
- `spaced_redrill`
- `spacing_advanced`
- `strong_cold_path`
- `substrate_confirmed`
- `substrate_refinement`
- `substrate_seed_offered`
- `substrate_support_exhausted`

Graph-neutral/context event types:

- `bridge_error`
- `cold_help_turn`
- `cold_support_exhausted`
- `evidence_hold_recorded`
- `gap_identified`
- `meta_turn`
- `model_bridge`
- `post_bridge_transfer_check`
- `post_bridge_transfer_decision`
- `post_bridge_transfer_skipped`
- `repair`
- `repair_abandoned`
- `repair_cap_selected`
- `repair_dialogue_turn`
- `repair_hint_requested`
- `repair_recovery_closed`
- `repair_recovery_started`
- `repair_recovery_turn`
- `repair_state_bucketed`
- `route_retry`
- `strong_cold_path`
- `substrate_confirmed`
- `substrate_refinement`
- `substrate_seed_offered`
- `substrate_support_exhausted`

Score-eligible event types:

- `cold_attempt`
- `spaced_redrill`

Learner-text event types:

- `cold_attempt`
- `cold_help_turn`
- `launch_attempt`
- `post_bridge_transfer_check`
- `repair`
- `repair_dialogue_turn`
- `repair_hint_requested`
- `repair_recovery_turn`
- `spaced_redrill`
- `substrate_refinement`

Routing-fact event types:

- `bridge_error`
- `cold_attempt`
- `cold_help_turn`
- `cold_support_exhausted`
- `evidence_hold_recorded`
- `gap_identified`
- `idle_exit`
- `idle_new_concept`
- `idle_redrill`
- `learner_goal_set`
- `model_bridge`
- `post_bridge_transfer_check`
- `post_bridge_transfer_decision`
- `post_bridge_transfer_skipped`
- `repair`
- `repair_abandoned`
- `repair_dialogue_turn`
- `repair_recovery_closed`
- `repair_recovery_turn`
- `route_generated`
- `route_retry`
- `spaced_redrill`
- `spacing_advanced`
- `strong_cold_path`
- `substrate_confirmed`
- `substrate_refinement`
- `substrate_seed_offered`
- `substrate_support_exhausted`

KC-required event types from the repo instructions:

- `cold_attempt`
- `post_bridge_transfer_check`
- `repair`
- `repair_dialogue_turn`
- `repair_hint_requested`
- `repair_recovery_turn`
- `spaced_redrill`
- `strong_cold_path`

`strong_cold_path` is graph-neutral routing telemetry. It must not become a
score-eligible evidence event.

## Append-Site Inventory

Current runtime append-site counts remain useful as an architectural tripwire:

- `app.mjs`: 1
- `lib/loop-server/session.mjs`: 1
- `lib/seda/handlers/cold-attempt.mjs`: 5
- `lib/seda/handlers/delta.mjs`: 5
- `lib/seda/handlers/idle.mjs`: 5
- `lib/seda/handlers/ignition.mjs`: 2
- `lib/seda/handlers/model-bridge.mjs`: 2
- `lib/seda/handlers/post-bridge-transfer.mjs`: 5
- `lib/seda/handlers/repair-abandoned.mjs`: 5
- `lib/seda/handlers/repair-dialogue.mjs`: 9
- `lib/seda/handlers/repair-recovery.mjs`: 8
- `lib/seda/handlers/repair.mjs`: 2
- `lib/seda/handlers/route.mjs`: 2
- `lib/seda/handlers/spaced-redrill.mjs`: 4
- `lib/seda/handlers/spacing.mjs`: 1
- `lib/seda/handlers/strong-cold-path.mjs`: 1
- `lib/seda/handlers/substrate-gate.mjs`: 8
- `lib/seda/meta-command.mjs`: 1
- `lib/seda/route-generation.mjs`: 1

## Event-Construction Helpers

These helpers now construct event objects through `eventBuilders` and are
appended elsewhere or through helper-mediated call sites:

- `lib/bridge/client.mjs`: `routeRetryEvent()` constructs `route_retry`.
- `lib/seda/bridge-fail-closed.mjs`: `bridgeErrorEvent()` constructs `bridge_error`.
- `lib/seda/handlers/substrate-gate.mjs`: `substrateConfirmedEvent()` constructs `substrate_confirmed`.
- `lib/seda/repair-dialogue-helpers.mjs`: `repairDialogueEvent()` and
  `uncertaintyDialogueTurnEvent()` construct `repair_dialogue_turn`.

## Duplication Inventory

Reduced duplicated event meaning:

- SEDA handlers no longer hand-author migrated event shapes directly; they call
  `eventBuilders` or helper functions that call `eventBuilders`.
- `lib/observability/dashboard-metrics.mjs` derives graph-neutral and score-eligible
  summary sets from `EVENT_FACT_DEFINITIONS`.
- `lib/seda/session-rehydration.mjs` reads required replay fields from
  `eventDefinition(event.type).required_fields`.
- `lib/seda/event-taxonomy.mjs` imports runtime defaults only for safe
  one-to-one runtime mappings.

## Destination Rule

Handlers append SEDA runtime facts through the event-fact module. Consumers may
import construction and static-invariant definitions from that module where the
mapping is direct and safe.

Ownership boundaries stay fixed:

- routing stays in `lib/seda/next-phase.mjs`
- training derivation stays in the canon/training-store path
- canonical projection cardinality stays in `lib/seda/event-taxonomy.mjs`
- product metric formulas stay in `lib/observability/dashboard-metrics.mjs`

The event-fact module is not a router, training derivation engine, canonical
taxonomy engine, or dashboard formula module.

## Replay Relationship

Replay still lives in `lib/seda/session-rehydration.mjs`. The rehydrator owns
how `ctx` is reconstructed and how the training store is rebuilt. Event facts
only supply required persisted fields for replay-critical runtime event types.

## Dashboard Projection Relationship

Dashboard formulas still live in `lib/observability/dashboard-metrics.mjs`. Event facts
only provide static event properties used for summary counts, such as
graph-neutral and score-eligible type membership. Product metric numerator and
denominator formulas continue to use canonical learner-loop events.

## Non-Goals

`event-facts.mjs` must not:

- choose next phases
- derive training state
- define canonical projection cardinality
- calculate product metrics
- create learner-facing copy

## Documented Exceptions

- `lib/seda/event-taxonomy.mjs` keeps one-to-many canonical projection
  cardinality and staged prompt-only canonical events. Event facts are imported
  only for safe one-to-one runtime defaults.
- `lib/observability/dashboard-metrics.mjs` keeps product metric formulas. Event facts
  only define static event type membership used by event summary counts.
- `lib/seda/session-rehydration.mjs` keeps explicit replay reconstruction
  logic. Event facts only define required persisted fields.
