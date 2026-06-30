---
name: decisions
type: context
description: Key architectural and technical decisions with reasoning. Load when making design choices or understanding why something is built a certain way.
triggers:
  - "why do we"
  - "why is it"
  - "decision"
  - "alternative"
  - "we chose"
edges:
  - target: context/architecture.md
    condition: when a decision relates to system structure
  - target: context/seda.md
    condition: when a decision relates to routing, event facts, or handlers
  - target: context/bridge.md
    condition: when a decision relates to bridge subprocess actions or providers
  - target: context/graph-honesty.md
    condition: when a decision relates to evidence, scoring, or derived graph truth
last_updated: 2026-06-30
---

# Decisions

## Decision Log

### Position as a learning loop, not a controlled renderer
**Date:** 2026-06-24
**Status:** Active
**Decision:** Socratink is positioned as a pedagogical engine with a constrained LLM, not as a "controlled renderer" or safer chatbot. The LLM constraint is a starting point, not the product.
**Reasoning:** The founder's intuition—"AI constrained by source material produces useful assistance instead of plausible nonsense"—is directionally correct but incomplete. Three deeper properties are the actual moat: (1) router-owned control flow, (2) generation before recognition as a pedagogical invariant, (3) derivation separate from evaluation. Positioning as a controlled renderer undervalues these and invites comparison to RAG wrappers.
**Alternatives considered:** Positioning as "AI anchored to textbooks" describes only the content constraint and misses the process architecture. Positioning as "the anti-hallucination tutor" is negative framing that sells the absence of a flaw rather than the presence of a capability.
**Consequences:** All marketing copy, landing pages, and founder pitches must lead with the pedagogical outcome and audit trail, not the LLM constraint. The LLM being constrained is a trust signal, not the value proposition.

### GTM starts with self-directed learners, not professors or institutions
**Date:** 2026-06-24
**Status:** Active
**Decision:** First users come from communities where "I studied this but can't explain it" is already the acknowledged pain (r/GetStudying, cert prep subreddits, Discord study servers). Not from professors or institutions.
**Reasoning:** No existing professor network + committee procurement + professor doesn't hold the budget = 3-6 month sales cycle with no guarantee of conversion. Self-directed learner communities have zero procurement, immediate feedback, and authentic stories. The professor path is a Phase 2 after proving the loop changes outcomes.
**Alternatives considered:** Professor-first (too slow, no network), enterprise L&D first (same procurement problem, needs case studies), publisher partnership (too early for the product's maturity).
**Consequences:** First content is systems thinking concepts (founder's current learning). First channel is Reddit/Discord authentic posts. First metric is whether 10+ strangers complete a session.

### Keep `nextPhase(events)` as the only router
**Date:** 2026-06-23
**Status:** Active
**Decision:** Handlers append facts, and `lib/seda/next-phase.mjs` owns phase and lane selection.
**Reasoning:** The event log is the runtime truth; keeping routing pure makes replay, routing proofs, and hosted/terminal parity possible.
**Alternatives considered:** Handler-owned phase jumps were rejected because they hide control flow outside the event clock and break auditability.
**Consequences:** Every new lane change needs a routing fact, a builder, a `nextPhase` branch or `DIRECT_PHASE` row, and a matching verification gate.

### Derive graph truth from score-eligible attempts only
**Date:** 2026-06-23
**Status:** Active
**Decision:** Only `cold_attempt` and `spaced_redrill` can become score-eligible evidence; `training-derive` owns `primed` and `solidified`.
**Reasoning:** Repair, substrate, bridge, and help turns are scaffolding or routing practice, not proof of durable reconstruction.
**Alternatives considered:** Treating evaluator `classification === "solid"` or `bridge_ready` as mastery was rejected because it conflates local judgment with spaced graph truth.
**Consequences:** UI and dashboard copy must distinguish evaluator labels, bridge gate readiness, case completion, and graph `solidified`.

### Keep LLM integration behind the Python bridge CLI
**Date:** 2026-06-23
**Status:** Active
**Decision:** Node handlers call `python bridge.py <action>` through `lib/bridge/client.mjs`; action IDs and JSON shapes are the wire contract.
**Reasoning:** This isolates provider adapters, prompt templates, fake mode, diagnostics, and Python eval tests from the SEDA orchestrator.
**Alternatives considered:** Direct Node provider calls were rejected because they duplicate prompt/normalizer behavior and make fake/live parity harder.
**Consequences:** New or changed bridge actions must update `bridge.py`, `lib/bridge/registry.json`, generated docs, and both JS/Python contract tests.

### Use a repo-local git control plane for agent hygiene
**Date:** 2026-06-23
**Status:** Active
**Decision:** Agents use `npm run agent:git -- status` and the non-destructive `bin/agent-git` wrapper before branch, PR, merge, or cleanup work.
**Reasoning:** Free-form agent git cleanup had become risky and expensive to unwind.
**Alternatives considered:** Raw git/gh command sequences were rejected for destructive operations and branch topology decisions.
**Consequences:** Agents may implement and commit in prepared branches, but must not force-push, hard-reset, delete branches, close PRs, or merge unless explicitly asked.
