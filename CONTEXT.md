# Socratink Loop

Founder-facing adaptive learning loop: learners reconstruct mechanisms from memory;
the system routes repair and spacing from an append-only event log while graph
truth is derived separately from evaluator labels.

Glossary only — no implementation or test commands. Architecture and verification:
[`AGENTS.md`](AGENTS.md), [`HARNESS.md`](HARNESS.md), [`HARNESS-TRACEABILITY.md`](HARNESS-TRACEABILITY.md).

## Language

**Session**:
One learner run from concept entry through idle exit or spaced re-drill completion.
_Avoid_: room, chat, thread

**Launch Attempt**:
The learner's pre-route sketch of what they think the concept is — input to substrate
assessment, not scored as evidence. May be followed by a post-seed generative retry
on the slow path before routing.
_Avoid_: cold attempt, warm-up answer, confirmed substrate (unconfirmed)

**Confirmed Substrate**:
Enough in-domain generative material (vocabulary, situation, or partial process) that
committing Provisional Map structure is pedagogically valid. Declared graph-neutrally
for routing only — never evidence.
_Avoid_: floor (informal), threshold, Bloom level

**Substrate Confirmation (policy)**:
Hybrid gate before `route_generated`. **Fast path:** infer adequate substrate from
launch and emit routing confirmation without an extra learner turn. **Slow path:**
blank, explicit unknown, or label-only launch → Substrate Seed → learner must
produce one post-seed generative line → then routing confirmation. Route never
runs on slow-path launch alone.
_Avoid_: scoring substrate turns, map-first, launch-as-threshold

**Substrate Gate**:
SEDA phase between ignition and route. Calls the dedicated substrate-gate bridge
action (not the evidence evaluator) to classify Launch Attempt adequacy, runs the
hybrid Substrate Confirmation policy, and emits graph-neutral routing facts before
`route_generated`.
_Avoid_: cold attempt, evidence judge pre-map, extra ignition prompts

**Substrate Refinement**:
Learner's post-seed generative retry on the slow path — graph-neutral, not evidence.
One required attempt after a Substrate Seed before Substrate Confirmed.
_Avoid_: second launch attempt, cold attempt, repair turn

**Substrate Support Exhausted**:
Graph-neutral routing fact after one Substrate Seed and one Substrate Refinement
still fail adequacy. Session continues: Substrate Confirmed with minimal adequacy,
then route generates a conservative (novice-grain) Provisional Map — never a hard
stop to idle.
Event-name guard: `cold_support_exhausted` is the post-map Cold Attempt help cap;
`substrate_support_exhausted` is the pre-map Substrate Seed/Refinement cap.
_Avoid_: blocking route, counting as evidence, cold_support_exhausted (post-map)

**Substrate Confirmed**:
Graph-neutral routing fact: substrate is adequate to commit map grain and first
target. Precedes `route_generated`. Carries adequacy (`adequate` | `minimal`).
Not a Cold Attempt and not evidence.
_Avoid_: cold attempt, solid, primed

**Provisional Map**:
The system's hypothesis of drillable knowledge components for this Session —
topology, mechanisms, and first target — emitted only after Substrate Confirmed.
_Avoid_: route, knowledge graph, answer key

**Substrate**:
Graph-neutral, in-domain orientation (contrast, vocabulary anchor, observable
before/outcome) that makes generation possible without revealing the mechanism.
_Avoid_: hint, explanation, lecture

**Substrate Seed**:
A deliberate Substrate delivery when Confirmed Substrate is not yet adequate —
still followed by a fresh generative ask on the slow path.
_Avoid_: model bridge, study reveal, answer key

**Cold Attempt**:
A score-eligible, substantive generative retrieval at the target knowledge
component — the first evidence candidate for that drill.
_Avoid_: launch attempt, help turn, repair turn

**Generation Before Recognition**:
Learner text must be elicited before model-bridge or answer-key material — but
Substrate is allowed because it is context, not recognition.
_Avoid_: test-first, explain-first

**Substrate-Driven Learning**:
The loop sizes structure (map grain, first target, prompts) from **Confirmed
Substrate** — not from an assumed launch threshold or a fixed syllabus. Substrate
Seeds lift substrate on the slow path; routing confirmation precedes Provisional
Map commitment. Evidence and graph truth still come only from learner reconstruction.
_Avoid_: lecture-first, map-first, test-first, curriculum-driven

**Loop substrate turns**:
On hosted `/loop`, Substrate Gate must surface as separate HTTP turns (composer
CTA + transcript), not batched into one response with route or cold. Required for
founder dogfood on `app.socratink.ai/loop`.
_Avoid_: terminal-only proof, hiding seed/refinement in a single burst

**Hosted Turn Boundary**:
A learner-visible hosted `/loop` pause between beats. Prompt-required boundaries
wait for fresh learner text; post-handler pacing stops are transport-only pauses
after a beat has completed. Routing truth still comes from the event log.
_Avoid_: router, evidence event, extra handler

**Case Complete**:
One concept run reached its terminal learning beat while the hosted session can
remain open at idle for another concept or `/exit`.
_Avoid_: session complete, graph solidified, bridge gate passed
