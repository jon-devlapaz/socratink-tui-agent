# Learning Cases

Learning cases are promoted TUI traces used to harden the Socratink learning
loop.

This is not a scrapbook. A case is only useful when it states falsifiable
invariants that can be replayed against a saved session trace.

Promoted traces live under `learning_cases/traces/`, not
ignored `.qa-runs/` folders. `.qa-runs/` remains the working evidence stream;
this folder contains the small set of portable traces that should replay on a
fresh checkout.

## Case Types

- `golden`: stable invariant that must keep working. Do not add these until the
  behavior is settled.
- `regression`: known failure that must not return.
- `research`: qualitative product signal. Not a gate.

## Case Sources

- `human_dogfood`
- `scripted_fixture`
- `simulated_learner`
- `regression_trace`

Simulated learners are fuzzers for the learning loop. They are not learners,
and they never prove pedagogy.

## Truth Boundary

Expected truth can only reference training-store events and derived state.

Do not use these as expected truth:

- agent prose
- model bridge text
- repair scaffold quality
- founder interpretation
- learner motivation

The invariant is always checked through the real
`training-store/training-derive` contract or through a saved session trace that
already contains derived state from that boundary.

`llm_calls` may be used only as a negative control, for example to assert that
Model Bridge or gap-drill stages were not called after `repair_abandoned` or
after a strong-cold skip. They are not evidence of learner understanding.

## Promotion Rule

Every promoted case must answer:

- What failure or invariant does this protect?
- What trace produced it?
- What is the expected event order?
- Which derived state must hold?
- Why is this a regression, golden, or research case?

## Refresh broadcast (after session-record changes)

When `product_loop` derive logic changes in `lib/seda/session-record.mjs`, update
promoted traces without re-running the TUI:

```bash
node scripts/refresh-trace-broadcast.mjs
./socratink-harness replay
```

This re-derives `product_loop` from saved `events[]` only. **Full re-capture**
(a new scripted `./socratink-tui` run replacing `session.json`) is required only
when `expected_invariants.event_order` should change — not for broadcast fixes.
