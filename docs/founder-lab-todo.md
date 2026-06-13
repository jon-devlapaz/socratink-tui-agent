# Founder Lab Todo

Status: current hardening contract
Owner: local Founder Lab (`/lab`, `./socratink`)

## MVP Surface

The Founder Lab exists to run closed-loop pedagogical batches and turn the
results into one bounded product or prompt adjustment. Keep the founder-facing
surface limited to:

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

Everything else is implementation detail. Environment variables, fake tutor
knobs, debug controls, provider plumbing, and graph internals should stay out of
the founder console unless they directly change one of the controls above.

## Explicit Model Choice

LM Studio and OpenAI-compatible router runs are explicit opt-in choices. The lab
must not silently choose a local or router model because model quality affects
pedagogy, evidence, and report interpretation.

## Evidence Boundary

Concept, goal, cartridge text, persona hints, launch sketches, substrate,
repair, bridge output, live monitor state, and report UI are context or
operator instrumentation. They are not graph truth.

Learner attempts are evidence candidates. Spaced reconstruction is the only path
that can harden a concept toward solidified graph truth.

## Experiment Loop

Use the lab as a small comparison loop:

1. Run Batch A with a recorded config: cartridge, concept, goal, tutor model,
   student model, run count, and max turns.
2. Read the report: evidence status, rubric axes, run table, and recommendation.
3. Write one adjustment note that names the smallest prompt or product change.
4. Run Batch B with only that intentional adjustment changed.
5. Compare Batch A and Batch B before accepting the adjustment.

## Current Hardening Tasks

- Verify `/lab` has no visible fake or sandbox tutor controls.
- Verify empty Concept or Goal blocks batch start with a clear message.
- Verify long Concept, Goal, and model strings do not overflow at desktop or
  mobile-ish widths.
- Verify the live pedagogical monitor shows exactly: substrate, route, cold,
  repair, bridge, transfer, redrill, report.
- Verify reports distinguish accepted, caveated, and rejected evidence from
  graph truth.
