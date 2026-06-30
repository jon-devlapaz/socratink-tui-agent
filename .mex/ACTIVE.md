---
name: active
type: active
description: Current work surface. Keep only the active objective, constraints, verification target, and short promotion queue.
last_updated: 2026-06-30
---

# Active

Status: current work only

## Now

Objective: harden Founder Lab as the smallest useful closed-loop comparison
surface.

Product needle: make one novice run visibly better. Success means a real
learner reaches a meaningful Cold Attempt or bounded Own-Words Repair without
receiving the mechanism as recognition material.

Constraint: keep `/lab` founder-facing. Environment variables, fake tutor knobs,
debug controls, provider plumbing, and graph internals stay out unless they
directly change one of the controls below.

Verification target: prove the current Founder Lab surface and report boundary
without widening context outside `.mex/`.

## Founder Lab contract

The Founder Lab exists to run closed-loop pedagogical batches and turn the
results into one bounded product or prompt adjustment.

Keep the founder-facing surface limited to:

- Concept
- Goal
- Cartridge
- Tutor model
- Student model
- Run count
- Max turns
- Model tests
- Live pedagogical state
- Report access

LM Studio and OpenAI-compatible router runs are explicit opt-in choices. The lab
must not silently choose a local or router model because model quality affects
pedagogy, evidence, and report interpretation.

Concept, goal, cartridge text, persona hints, launch sketches, substrate,
repair, bridge output, live monitor state, and report UI are context or operator
instrumentation. They are not graph truth.

Learner attempts are evidence candidates. Spaced reconstruction is the only path
that can harden a concept toward solidified graph truth.

## Experiment loop

Use the lab as a small comparison loop:

1. Run Batch A with a recorded config: cartridge, concept, goal, tutor model,
   student model, run count, and max turns.
2. Read the report: evidence status, rubric axes, run table, and recommendation.
3. Write one adjustment note that names the smallest prompt or product change.
4. Run Batch B with only that intentional adjustment changed.
5. Compare Batch A and Batch B before accepting the adjustment.

## Current hardening tasks

- Verify `/lab` has no visible fake or sandbox tutor controls.
- Verify empty Concept or Goal blocks batch start with a clear message.
- Verify long Concept, Goal, and model strings do not overflow at desktop or
  mobile-ish widths.
- Verify the live pedagogical monitor shows exactly: substrate, route, cold,
  repair, bridge, transfer, redrill, report.
- Verify reports distinguish accepted, caveated, and rejected evidence from
  graph truth.

## Promote when done

- durable product direction goes to `.mex/context/product-todos.md`
- Founder Lab rubric changes go to `.mex/context/founder-lab-loop-rubric.md`
- verification policy goes to `.mex/context/release-ladder.md`
- recurring work goes to `.mex/patterns/`
- stale active notes are deleted
