---
name: memory-check-retrieval-spec
description: Deferred product spec for making same-session Memory Check more pedagogically robust without implementing it yet.
status: deferred
triggers:
  - "memory check"
  - "retrieval veil"
  - "same-session reconstruction"
  - "retrieval practice"
edges:
  - target: context/product-todos.md
    condition: when prioritizing whether to build this
  - target: context/graph-honesty.md
    condition: when deciding what evidence claim the check supports
  - target: context/bridge.md
    condition: when deriving or evaluating memory-check prompts with the LLM
  - target: context/seda.md
    condition: when wiring the phase boundary
last_updated: 2026-06-30
---

# Memory Check Retrieval Spec

## Status

Deferred. Do not implement yet.

This is high-signal from live dogfooding, but it should remain a spec until
the core loop is stable and repeated sessions prove the current Memory Check is
the next bottleneck.

## Observed Problem

In live `/loop` dogfooding on "retrieval practice and learning", the learner
gave a strong mechanism answer. The loop then displayed answer-bearing praise
and immediately asked:

```text
Memory check: From memory, explain it again.
```

That weakens the evidence claim. The learner may reconstruct from visible
feedback or visible prior wording, not from memory.

## Pedagogical Claim Boundary

This feature must not claim durable mastery.

Allowed claim:

```text
Uncued same-session reconstruction
```

Not allowed:

```text
Durable memory
Mastery
Solidified graph state
```

Durable evidence still requires later spaced re-drill.

## Desired Loop Shape

```text
strong cold attempt
  -> derive memory-check shape
  -> reduce visible cues
  -> changed-format reconstruction
  -> evaluate against hidden criteria
  -> practice signal only
```

`nextPhase(events)` still owns the phase transition. The LLM may derive the
phase-local task and evaluation criteria; it must not route the loop.

## Minimal UX Direction

Use a subtle retrieval veil at Memory Check:

- Soften or blur prior transcript above the current prompt.
- Keep the current Memory Check prompt and composer sharp.
- Hide route/audit labels such as `[STRONG COLD PATH]` from learner view.
- Replace answer-restating praise with neutral continuation copy.

Example learner copy:

```text
Memory check
Previous text is softened so you can rebuild the idea.
Explain it again in your own words.
```

The veil is attention support, not anti-cheat enforcement.

## Generality Requirement

Do not hardcode a single prompt like "3-step causal chain".

The feature must work across mechanisms, definitions, procedures, proofs,
comparisons, examples, and debugging concepts. The general move is
changed-format retrieval.

Possible retrieval shapes:

- causal_chain
- contrast
- procedure
- definition_plus_nonexample
- example_transfer
- proof_sketch
- error_diagnosis
- summary_in_own_words

## Possible LLM Contract

After a strong cold attempt, ask the bridge to derive a memory-check task:

```json
{
  "format": "contrast",
  "learner_prompt": "Explain it again by contrasting retrieval practice with rereading.",
  "success_criteria": [
    "mentions recall from memory",
    "explains why access improves",
    "distinguishes familiarity from learning"
  ],
  "forbidden_cues": [
    "reactivating connections",
    "reconstruct the pathway"
  ]
}
```

Learners see only `learner_prompt`. Founder/evaluator surfaces may use
`format`, `success_criteria`, and `forbidden_cues`.

## Evidence Rules

- Score eligibility does not expand.
- Same-session Memory Check remains a practice signal unless the event contract
  already classifies it as score-eligible.
- Do not let LLM rubric success imply `solidified`.
- If the learner reveals softened text before answering, the attempt can still
  be useful practice, but founder-side evidence should mark it as cued.

## Build Later Only If

- Multiple live sessions show learners leaning on visible transcript or model
  feedback during Memory Check.
- The smallest copy/projection cleanup is insufficient.
- The product needs stronger same-session evidence before delayed re-drill is
  available.

## Do Not Build Yet

- Timers.
- Locking the transcript.
- Anti-cheat or surveillance UI.
- New graph states.
- Router changes driven by the LLM.
- A new scoring category for same-session recall.
