# Pre-Spec: Novice Substrate Seed

Status: pre-spec, not approved implementation scope
Date: 2026-06-01
Source signal: Railway-hosted loop learner feedback after roughly 5-6 turns

## Feedback Signal

A new learner understood the product direction but felt the loop expected prior
knowledge about the concept. When they did not know enough to answer, the loop
kept pressing with questions instead of giving enough base material to make a
reasonable attempt.

Their suggested direction was: ask questions first; if the learner does not know,
give some base knowledge such as "the way it works is ..." without leading all
the way to the answer. The learner should still have to make assumptions, and a
wrong assumption can create the useful "gotcha" moment.

## Interpretation

This is not a request to make Socratink explain before it asks for evidence.
That would collapse the product's evidence boundary. The sharper failure mode is
that Generation Before Recognition can become impossible demand when a true
novice lacks the raw substrate needed to generate anything.

The product distinction:

- Good pressure: the learner has enough pieces to try reconstructing the missing
  causal link.
- Bad pressure: the learner lacks the pieces and is being asked to invent the
  mechanism from nothing.

## Proposed Product Shape

Introduce a graph-neutral novice support move, tentatively called a substrate
seed. It gives a tiny in-domain orientation fragment before asking for another
learner reconstruction.

A substrate seed may include:

- One concrete situation or contrast in the topic domain.
- One or two necessary vocabulary anchors.
- An observable starting condition and observable outcome.
- A missing middle kept blank or underspecified.

A substrate seed must then ask the learner to generate the missing link in their
own words.

Example shape:

```text
You do not need the full answer yet. Start with this: compare situation A with
situation B. Something has to change in the middle. What do you think that
change might be?
```

## Boundaries

Non-negotiable evidence boundaries:

- A substrate seed is context, not evidence.
- A substrate seed must be graph-neutral and score-ineligible.
- Source, learner goal, route, scaffolds, help, hints, and substrate seeds do not
  mutate graph truth.
- Only learner-generated reconstruction can become evidence, and only the
  existing derivation gates decide graph state.
- No seed may reveal the full mechanism, model bridge, answer key, or complete
  causal chain.

Non-goals:

- Do not add a lecture-first mode.
- Do not make "I do not know" count as a weak attempt.
- Do not lower the standard for `solid`.
- Do not mark repair dialogue, hints, or novice support as evidence.
- Do not introduce learner-facing Bloom/taxonomy language.

## Candidate Loop Behavior

1. Learner reaches `cold_attempt`.
2. Learner submits an explicit unknown, blank, or non-substantive answer.
3. The loop emits graph-neutral support, preferably through the existing
   `cold_help_turn` path unless routing proof shows a new event is needed.
4. The support response provides a substrate seed, not a solution.
5. The loop asks for a fresh rough reconstruction from memory.
6. Only a substantive learner attempt becomes score-eligible and may append a
   `cold_attempt`.
7. If support is exhausted, the loop may enter the existing zero-schema Delta
   path, still without scoring the help turns.

## Event And State Boundary

Preferred first design:

- Reuse `cold_help_turn` for novice support.
- Add explicit fields only if useful for replay or dashboard triage, for example
  `support_kind: "substrate_seed"` and `seed_reveals_mechanism: false`.
- Keep `score_eligible: false`, `graph_neutral: true`, and `kc_id`.
- Do not route from model prose. `nextPhase(events)` remains the router.

If a distinct event is needed later, it must still be graph-neutral and must not
be consumed by training derivation as learner evidence.

## Prompt Boundary

Any prompt change must live in `prompt_templates.py`. The prompt should instruct
the relevant role to provide a tiny in-domain substrate seed only when the cold
attempt is non-substantive or explicitly novice-coded.

Allowed seed content:

- Concrete contrast.
- Minimal vocabulary anchor.
- Observable before/outcome.
- Missing middle left open.

Forbidden seed content:

- Full mechanism.
- Answer-key phrasing.
- Model bridge reveal.
- Hint menus or broad study menus during cold.
- Meta labels like "before state" or "after state".

## Verification Ideas

Before implementation, promote this into a real spec with fixtures and gates:

- Prompt eval case: explicit novice cold response produces a substrate seed
  without mechanism reveal.
- JS routing test: repeated novice support remains graph-neutral and routes
  through the existing cold help exhaustion behavior.
- Fake scripted loop: novice unknown -> seed -> fresh cold attempt -> normal
  shallow/solid classification path.
- Replay invariant: substrate support never mutates graph truth.
- Hosted-loop persona check: a novice user can identify what kind of answer is
  expected without receiving the answer.

## Open Questions

- Should substrate seeding happen only after an explicit "I do not know", or
  also after evaluator-detected non-substantive text?
- Is the existing `MAX_COLD_HELP_TURNS` cap sufficient, or should seeded support
  have its own cap?
- Should dashboard summaries distinguish "novice support used" from ordinary
  help requests?
- Should `/hint` remain repair-only, or should cold support use a separate
  learner action later?
