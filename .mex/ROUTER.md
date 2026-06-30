---
name: router
description: Session bootstrap and navigation hub. Read at the start of every session before any task. Contains project state, routing table, and behavioural contract.
routing:
  - target: context/product-todos.md
    condition: when planning product direction, prioritizing features, or evaluating strategic fit
  - target: ACTIVE.md
    condition: when asking what is current, active, in progress, or next
  - target: patterns/cloud-agent-session.md
    condition: when Cursor, Codex, or another cloud agent starts from a vague or empty prompt
  - target: context/founder-lab-loop-rubric.md
    condition: when evaluating Founder Lab loop runs or changing the loop rubric
  - target: context/architecture.md
    condition: when understanding how the system works
  - target: context/product-vocabulary.md
    condition: when checking product vocabulary or glossary terms
  - target: context/seda-harness.md
    condition: when checking harness substrate invariants
  - target: context/release-ladder.md
    condition: when choosing verification gates, release checks, or merge readiness
  - target: context/seda.md
    condition: when changing phases, events, handlers, pacing, or routing
  - target: context/hosted-session-persistence.md
    condition: when changing hosted session storage, resume, rehydration, or transcript metadata
  - target: context/bridge.md
    condition: when changing LLM actions, prompt IO, providers, or bridge diagnostics
  - target: context/graph-honesty.md
    condition: when changing evidence, derivation, scoring, replay invariants, or learner claims
  - target: context/stack.md
    condition: when working with specific technologies, libraries, or making tech decisions
  - target: context/conventions.md
    condition: when writing new code, reviewing code, or unsure about project patterns
  - target: context/decisions.md
    condition: when making architectural choices or understanding why something is built a certain way
  - target: context/setup.md
    condition: when setting up the dev environment or running the project for the first time
  - target: patterns/INDEX.md
    condition: when starting a task — check the pattern index for a matching pattern file
last_updated: 2026-06-30
---

# Session Bootstrap

If you have not already read root `AGENTS.md`, read it now. It is only the
bootloader and safety card.

Then read this file fully before doing anything else in this session.

If the user asks what is current, active, in progress, or next, read
`.mex/ACTIVE.md`.

`.mex/` is the master agent scaffold and document organizer. Root docs keep only
the compact safety/product contracts; routed context and recurring task patterns
live here.

## Current Project State

**Working:**
- Terminal loop entrypoint: `./socratink-tui -> app.mjs -> createSessionKernel() -> makePrompt() -> runSedaLoop()`.
- Hosted loop server: `./socratink-loop-server` serves `/loop` and `/api/session/*` on port `8787` by default.
- SEDA spine: handlers append events, `nextPhase(events)` routes, `training-derive` audits graph state.
- Bridge seam: Node handlers call `python bridge.py <action>` through `lib/bridge/client.mjs`.
- Verification ladder: see `context/release-ladder.md`.
- Hosted persistence authority: see `context/hosted-session-persistence.md`.
- GTM direction: self-directed learner communities first (2026-06-24), systems thinking entry concepts.
- Positioning: learning loop + audit trail, not controlled renderer (2026-06-24).

**Not yet built:**
- Durable hosted loop session storage across deploys.
- Main-app auth/account integration for the loop host.
- `localStorage` graph sync with the grid product.
- Full multi-node room traversal; current loop targets the first active KC.
- Future destructive git cleanup phases in `agent-git` beyond dry-run/rescue/status.

**Known issues:**
- Live LLM work needs `GEMINI_API_KEY` or a configured OpenAI-compatible provider.
- Vercel cannot host the loop process; Railway or another persistent host is required.
- Route generation has a retryable `SmallestRouteCapExceeded` guardrail when hidden mechanism phrases leak.
- Hosted loop UI tests require a running fake-mode loop server; they are not part of the self-contained Tier 2 JS set.
- `.env` is local-only; do not commit secrets or API keys.

## Routing Table

Load the relevant file based on the current task. Do not load context files
outside `.mex/`.

| Task type | Load |
|-----------|------|
| Current work, active objective, or next task | `.mex/ACTIVE.md` |
| Cursor, Codex, or cloud agent starts from a vague or empty prompt | `patterns/cloud-agent-session.md` + `.mex/ACTIVE.md` |
| Founder Lab loop rubric or persona-run evaluation | `context/founder-lab-loop-rubric.md` |
| Understanding how the system works | `context/architecture.md` |
| Product vocabulary or glossary terms | `context/product-vocabulary.md` |
| Harness substrate invariants | `context/seda-harness.md` |
| Planning product direction, prioritizing features, or evaluating fit | `context/product-todos.md` |
| Planning go-to-market, positioning, or first users | `context/product-todos.md` |
| Choosing verification gates or merge readiness | `context/release-ladder.md` |
| Understanding why we positioned this way (not controlled renderer) | `context/decisions.md` |
| Changing phases, handlers, pacing, or event routing | `context/seda.md` |
| Changing hosted session storage, resume, or transcript metadata | `context/hosted-session-persistence.md` |
| Changing bridge actions, provider behavior, diagnostics, or prompt IO | `context/bridge.md` |
| Changing evidence, derivation, graph state, or learner-facing mastery claims | `context/graph-honesty.md` |
| Working with a specific technology | `context/stack.md` |
| Writing or reviewing code | `context/conventions.md` |
| Making a design decision | `context/decisions.md` |
| Setting up or running the project | `context/setup.md` |
| Any specific task | Check `patterns/INDEX.md` for a matching pattern |

## Behavioural Contract

For every task, follow this loop:

1. **CONTEXT** — Load the relevant context file(s) from the routing table above. Check `patterns/INDEX.md` for a matching pattern. If one exists, follow it. Narrate what you load: "Loading architecture context..."
2. **BUILD** — Do the work. If a pattern exists, follow its Steps. If you are about to deviate from an established pattern, say so before writing any code — state the deviation and why.
3. **VERIFY** — Load `context/conventions.md` and run the Verify Checklist item by item. State each item and whether the output passes. Do not summarise — enumerate explicitly.
4. **DEBUG** — If verification fails or something breaks, check `patterns/INDEX.md` for a debug pattern. Follow it. Fix the issue and re-run VERIFY.
5. **GROW** — After meaningful work, run this binary checklist:
   - **Ground:** What changed in reality? Name the changed behavior, system, command, dependency, or workflow.
   - **Record:** If project state changed, update the "Current Project State" section above. If documented facts changed, update the relevant `context/` file surgically.
   - **Orient:** If this task can recur and no pattern exists, create one in `patterns/` using `patterns/README.md`, then add it to `patterns/INDEX.md`. If a pattern exists but you learned a gotcha, update it.
   - **Write:** Bump `last_updated` in every scaffold file you changed. If the why matters, run `mex log --type decision "<what changed and why>"` or `mex log "<note>"`.
