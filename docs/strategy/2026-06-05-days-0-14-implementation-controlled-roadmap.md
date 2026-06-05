# Days 0-14 Implementation-Controlled Roadmap

Status: baseline milestone implemented
Date: 2026-06-05
Related PR: https://github.com/jon-devlapaz/socratink-tui-agent/pull/6
Evidence log: `docs/implementation/event-taxonomy-dashboard-v2/PROGRESS.md`

## Strategic Intent

Convert the first slice of the 90-day Socratink improvement plan from a roadmap
shape into an implementation-controlled milestone.

The wedge remains proof-based adaptive learning: learners reconstruct mechanisms,
the system exposes where reconstruction breaks, and graph truth hardens only
through durable spaced evidence. Socratink should not drift into answer delivery
or a generic AI tutor posture.

## Product Doctrine

- Source, goal, sketch, substrate seed, hints, explanations, and `/meta` are
  context.
- Learner reconstruction is evidence.
- Cold Attempt is the first score-eligible reconstruction surface.
- Only spaced strong reconstruction may harden graph truth.
- Dashboard truth must be reconstructable from `events[]`, not from UI state,
  run summaries, friction tags, or ignored `.qa-runs/` artifacts.
- Learner-facing vocabulary stays plain. Internal labels such as Bloom,
  node-intent, graph-neutral, and evidence taxonomy stay out of the UI.

## Days 0-14 Milestone

The baseline milestone is now:

1. Establish a versioned canonical learner-loop event taxonomy.
2. Make dashboard product metrics a read-only projection of that taxonomy.
3. Keep `/dashboard` compatible by preserving `learning_loop`, `runs`, and
   `improvement_queue`.
4. Add `product_strategy_v2` with `north_star`, `activation_funnel`,
   `friction_segments`, `experiment_queue`, and `dogfood_evidence`.
5. Keep `/meta` non-critical-path and default-off.
6. Prove through tests that context events do not become score-eligible evidence.

## Canonical Metric Contract

Product metrics in `product_strategy_v2.activation_funnel.product_metrics` expose:

- `rate`
- `numerator_count`
- `denominator_count`
- `source_event_types`
- `formula_label`
- `empty_state_reason`
- `critical_path`

Current formulas:

- `meaningful_cold_attempt_rate = cold_attempt_submitted / cold_attempt_prompted`
- `bridge_reach_rate = bridge_prompted / cold_attempt_evaluated`
- `case_complete_rate = case_completed / loop_started`
- `repair_load_rate = repair_prompted / cold_attempt_evaluated`
- `evidence_hold_rate = evidence_hold_recorded / cold_attempt_evaluated`
- `substrate_seed_use_rate = substrate_seed_requested / loop_started`

`meta_use_rate` remains omitted until eligible loop-turn telemetry exists.

## Promotion Gates

This milestone is promoted only when these remain true:

- Canonical event projection preserves legacy `event.type` compatibility for
  `nextPhase(events)`.
- Substrate Gate events are graph-neutral and score-ineligible.
- Cold Attempt remains the first score-eligible reconstruction surface.
- `/meta` is default-off, graph-neutral, score-ineligible, same-phase, and does
  not call an evaluator.
- Product metrics derive only from canonical events.
- Evidence holds are counted only through `evidence_hold_recorded`, not by a
  proxy such as non-solid cold attempts.
- Dashboard v2 is additive and does not break existing dashboard consumers.

## Deferred Deliberately

- No dashboard visual redesign.
- No broad `/loop` UI redesign.
- No prompt or LLM behavior changes.
- No deployment changes.
- No `meta_use_rate` until the denominator is explicit.
- No promotion of ignored `.qa-runs/` traces into product truth without a
  deliberate learning-case promotion step.

## Next Strategic Slice

The next product bet should be novice viability, not dashboard polish:

1. Complete and dogfood the Substrate Gate path for true novices.
2. Prove that a learner can move from source/goal confusion to a meaningful
   first reconstruction without receiving the answer.
3. Keep substrate seed/refinement visibly separate from scored Cold Attempt.
4. Promote at least one novice substrate case into `learning_cases`.
5. Use the dashboard only to decide the next experiment from measured friction.

## Evidence Path

Primary evidence:

- PR #6 implementation and review history.
- `docs/implementation/event-taxonomy-dashboard-v2/PROGRESS.md`.
- Focused JS taxonomy/dashboard QA tests.
- Server-backed loop-chat UI tests.
- Harness replay and routing proof.
- Canon drift and Python smoke gates.

Working evidence remains `.qa-runs/` until promoted into `learning_cases`.
