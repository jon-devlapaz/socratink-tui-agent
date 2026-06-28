# Learning Cases

Learning cases are promoted TUI traces used to harden the Socratink learning
loop.

This is not a scrapbook. A case is only useful when it states falsifiable
invariants that can be replayed against a saved session trace.

Promoted traces live under `learning_cases/traces/`, not
ignored `.qa-runs/` folders. `.qa-runs/` remains the working evidence stream;
this folder contains the small set of portable traces that should replay on a
fresh checkout.

## Case shape

Use the short labels first. The old labels remain as compatibility aliases for
current replay and dashboard readers.

```json
{
  "case_id": "ai-strong-cold-solidifies-2026-06-24",
  "status": "active",
  "kind": "golden",
  "source": "simulated_learner",
  "claim": "A solid cold attempt may skip repair and solidify only after spaced evidence.",
  "risk": "The loop may waste learner effort by forcing ceremonial repair.",
  "trace": "learning_cases/traces/ai-strong-cold-solidifies-2026-06-24/session.json",
  "checks": {
    "event_order": ["cold_attempt", "strong_cold_path", "spacing_advanced", "spaced_redrill"],
    "final_node_state": "solidified",
    "truth_source": "training_derivation"
  }
}
```

Human fields:

- `claim`: what this case protects
- `risk`: what could regress if the case fails
- `trace`: the saved session record

Machine fields:

- `checks`: replay assertions over events, derived graph state, evaluator labels,
  forbidden events, or forbidden LLM stages

## Case kinds

- `golden`: stable invariant that must keep working. Do not add these until the
  behavior is settled.
- `regression`: known failure that must not return.
- `research`: qualitative product signal. Not a gate.

## Case sources

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

## Promotion rule

Every promoted case must answer:

- What claim does this protect?
- What risk would return if it failed?
- What trace produced it?
- What checks make the claim falsifiable?
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
when `checks.event_order` should change — not for broadcast fixes.

`expected_invariants` and `session_log` are compatibility aliases for current
tools. New cases should be read as `checks` and `trace`.
