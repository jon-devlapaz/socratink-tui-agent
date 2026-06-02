# Spec Idea: `/meta` Metacognitive Companion

Status: parked idea, not approved for implementation
Date: 2026-06-02

## Problem

Learners may feel uncertain mid-loop about why they are being asked to do a step, what kind of answer is useful, or whether they should continue, ask for a hint, skip, or try again. Today that uncertainty can become concept content, help text, or repair dialogue, which risks blurring learning strategy with scored reconstruction.

## Product Intent

Add a graph-neutral `/meta` command that explains the current learning move in plain language. It should help the learner orient metacognitively without answering the concept, advancing the phase, changing graph truth, or counting against repair turns.

## Learner-Facing Principle

At attempt phases, the learner reconstructs knowledge. At `/meta`, the learner asks about learning strategy.

The companion should be helpful, direct, and non-persona-based. It is not a tutor character. It is a state-aware guide to the current move.

## Command Shape

Initial version:

```text
/meta
```

Possible later extensions:

```text
/meta why
/meta next
/meta weak
/meta options
```

V1 should probably support only `/meta` to keep behavior deterministic and harnessable.

## Behavior Contract

`/meta` must:

- stay graph-neutral
- return to the same phase and prompt after responding
- avoid evaluator calls
- avoid appending attempts or repairs
- avoid counting toward repair dialogue caps
- avoid revealing model answers or answer-shaped hints
- avoid learner-facing internal terms
- be visible in transcript as meta help, not as learner evidence

Event shape, if implemented:

```json
{
  "type": "meta_turn",
  "phase": "repair_dialogue",
  "graph_neutral": true,
  "intent": "explain_current_move",
  "response_kind": "phase_explainer"
}
```

## Plain-Language State Mapping

Avoid internal language:

- Do not say `primed`, `solidified`, `graph-neutral`, `kc_id`, `node`, `evidence candidate`, or `repair_dialogue_turn`.

Use learner-facing language:

- `primed` -> `you have a working version`
- `solidified` -> `it held up after delay`
- `gap_identified` -> `there is a missing middle`
- `repair_dialogue` -> `you are rebuilding one missing link`
- `spaced_redrill` -> `you are checking whether it comes back later`
- graph-neutral help -> `this explanation is not counted as an answer`

## Phase Examples

Cold attempt:

```text
[Meta] Current move: Try your rough explanation before seeing the model. This shows what you can already rebuild. Messy is fine.
```

Repair dialogue:

```text
[Meta] Current move: You are rebuilding one missing link. The goal is not polish; it is to explain the middle step in your own words. If you need a small nudge, use /hint.
```

Post-bridge transfer:

```text
[Meta] Current move: You just saw the model version. This check asks whether you can use the idea in your own words, not whether you can repeat the model wording.
```

Spaced re-drill:

```text
[Meta] Current move: This is the durability check. The useful question is whether the idea comes back without leaning on the previous wording.
```

Idle:

```text
[Meta] You are between runs. You can test the idea again, try a harder version, ask what still needs work, or start a new concept.
```

## Design Boundary

The hardest boundary is `/meta weak` or any answer to “what still needs work.” If this names the weak spot too specifically, it becomes a disguised hint.

Safer version:

```text
The weak spot is the middle step between the starting situation and the result.
```

Riskier version:

```text
The weak spot is how query and key vectors combine into attention scores.
```

Recommendation: do not implement `/meta weak` until there is a harness invariant that prevents answer-shaped leakage.

## Harness Requirements Before Implementation

Before implementation, add tests or promoted cases proving:

- `/meta` emits `meta_turn` with `graph_neutral: true`
- `/meta` does not append attempts, repairs, or evidence-changing events
- `/meta` does not advance phase
- `/meta` does not count toward repair turn caps
- `/meta` during `gap_attempt` and `spaced_attempt` returns to the correct prompt
- `/meta` copy does not contain internal graph terms
- `/meta` does not reveal model bridge content before bridge readiness

## Open Questions

- Should `/meta` be deterministic forever, or can an LLM rewrite approved deterministic content later?
- Should `/meta options` route the learner into explicit choices, or only describe them?
- Should `/meta` be allowed inside every prompt phase, including launch and learner goal?
- Should `/meta` responses be included in saved session logs and dashboard run logs?
- Should the dashboard count frequent `/meta` use as a friction signal?

## Recommendation

Do not implement yet. Treat this as a parked product-spec idea. If promoted later, start with deterministic `/meta` as a graph-neutral phase explainer only. Defer `/meta weak`, conversational meta chat, and LLM-generated responses until the leakage boundary is testable.
