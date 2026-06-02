# Substrate gate before route

Socratink committed to **Substrate-Driven Learning**: Provisional Map structure must
not be generated from an unconfirmed Launch Attempt alone. We insert a `substrate_gate`
SEDA phase between `launch_attempt` and `route`, backed by a dedicated
`substrate-gate` bridge action (new prompt template — not the evidence evaluator,
which requires a map node). Hybrid policy: fast path confirms substrate from a strong
launch; slow path offers one Substrate Seed, requires one Substrate Refinement, then
confirms. If refinement is still inadequate, emit `substrate_support_exhausted` and
route with conservative novice-grain map (`adequacy: minimal`) rather than blocking
the Session. All substrate events are graph-neutral; evidence still begins at Cold
Attempt only.

**Considered:** fat ignition handler; reusing evaluator pre-map; hard idle stop on
exhaustion; unlimited seed loops.

**Consequences:** `nextPhase` must map `launch_attempt → substrate_gate` (not
`route`); bridge registry gains a sixth action; hosted-loop pacing fixes remain a
separate track from this change.

**Implementation order:** Ship substrate gate first (ADR scope), then hosted
`advanceSession` pacing (stop after route and after cold before delta). Do not
combine in one PR.

**Loop UI (PR1 scope):** Hosted `/loop` is primary dogfood; PR1 must yield
`PROMPT_REQUIRED` across substrate gate (seed + refinement prompts), not only
terminal/scripted proof. Learners testing on `app.socratink.ai/loop` must see
substrate beats as separate turns with composer CTAs.
