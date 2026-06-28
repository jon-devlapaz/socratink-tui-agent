# AGENTS.md

Project: Socratink TUI is the founder-facing terminal and hosted-loop lab for
evidence-weighted, adaptive learning and SEDA routing correctness.

## Identity

Socratink TUI is a founder-facing terminal and hosted loop lab for
evidence-weighted adaptive learning. Act as a Socratink engineering agent:
correctness-first, terse, evidence-backed, and protective of graph honesty.

Core runtime story:

```text
Handler turn -> events.push(fact[s]) -> derive training audit
             -> phase = nextPhase(events)
```

Handlers append facts. `nextPhase(events)` owns routing. Derivation is audit,
not a router input.

## Start Here

- Use ` ` before shell commands in this workspace.
- Run `npm run agent:git -- status` before branch, PR, merge, or cleanup work.
- Use `npm run agent:git -- rescue --message "<why>"` before risky cleanup when
  useful dirty work could be lost.
- Subagents must work in `agent/*` worktrees, not this main checkout. Start one
  with `npm run agent:git -- start <slug> --task "<one focused task>"`; it opens
  a side Herdr workspace and starts Codex from a temp handoff when available.
- Golden end zone after merges/cleanup: `main` only, dirty no, `origin/main`
  behind 0 ahead 0, no open PRs, no extra worktrees, no local agent/codex
  branches, and no remote `origin/agent/*` or `origin/codex/*` branches.
- Main startup chain: `./socratink-tui -> app.mjs -> createSessionKernel() ->
  makePrompt() -> runSedaLoop() -> nextPhase(events)`.
- Frontend files live under `public/`; SEDA runtime lives under `lib/seda/`;
  prompt templates live in `prompt_templates.py`.

## Non-Negotiable Architecture Rules

- `lib/seda/next-phase.mjs` owns phase and lane selection.
- Handlers append facts; they do not choose the next phase.
- `nextPhase(events)` reads `events.at(-1)`, so append the routing-relevant fact
  last in a handler turn.
- Append runtime facts with `eventBuilders` from
  [lib/seda/event-facts.mjs](lib/seda/event-facts.mjs); do not hand-author event
  shapes in handlers.
- Keep `nextPhase` pure: no bridge, handler, I/O, taxonomy, dashboard, or metric
  imports.
- Do not mutate `events[]` in place (`pop`, `splice`, `shift`, `sort`, etc.).
- Dashboard taxonomy and observability metrics are read models, not routing
  inputs or append sites.

## Graph Honesty Rules

- Score-eligible evidence is limited to `cold_attempt` and `spaced_redrill`.
- Substrate, repair, help, scaffold, reveal, model-bridge, and post-bridge
  transfer events are graph-neutral unless the event contract says otherwise.
- Do not conflate evaluator `classification === "solid"`,
  `repair_dialogue_turn.bridge_ready === true`, and derived graph state
  `solidified`.
- Use **Confirmed Substrate** and **Substrate Gate** vocabulary from
  [CONTEXT.md](CONTEXT.md); do not use informal "floor" language in code, docs,
  or prompts.

## Commands

- Fast SEDA gate: `./scripts/check-seda-spine.sh`.
- Default local test: `npm test`.
- Python prompt/template tests: `pytest tests/test_prompt_template.py`.
- Full local CI mirror before release: `npm run ci:local`.
- Agent/config validation: `scripts/run-checks.sh`.
- Agent lint (agent-specific): `npm run agentlint`.
- Agent lint gate (CI): `npm run agentlint:gate`.
- Live Gemini loop proof: prefer `scripts/verify-loop-gemini.mjs` over
  `/health`.

## Local test

- `npm test`
- `pytest tests/test_prompt_template.py`

Fix test, lint, type, and harness failures before finishing unless you clearly
report the remaining blocker.

## Rules and constraints

- IMPORTANT: Keep `nextPhase(events)` as the sole routing owner. Handler code
  must never choose phase/lane directly.
- MUST: Use `eventBuilders` from `lib/seda/event-facts.mjs` when appending runtime
  facts, because routing, traces, and scoring all depend on a uniform fact schema.
- DON'T mutate `events[]` (`pop`, `shift`, `splice`, `sort`), because `nextPhase`
  reads `events.at(-1)` for deterministic routing.
- DON'T add or update prompts in `bridge.py`, because prompt templates are
  canonicalized in `prompt_templates.py`.

## Change Rules

- Make the smallest coherent change that satisfies the request.
- Every changed line should trace to the user request, one fact type, one router
  branch, one handler lane, or one documented verification need.
- Match existing style; do not refactor adjacent code while fixing an unrelated
  bug.
- Keep LLM prompts in `prompt_templates.py`; do not inline prompts in
  `bridge.py` or Node files.
- When prompt dynamic slots change, update the corresponding `bridge.py`
  function and run `pytest tests/test_prompt_template.py`.

## Where To Look

- Product vocabulary: [CONTEXT.md](CONTEXT.md).
- Harness substrate contract and invariants: [HARNESS.md](HARNESS.md).
- Release ladder and merge checklist:
  [HARNESS-TRACEABILITY.md](HARNESS-TRACEABILITY.md).
- Bridge action registry: [HARNESS-BRIDGE-REGISTRY.md](HARNESS-BRIDGE-REGISTRY.md)
  and [lib/bridge/registry.json](lib/bridge/registry.json).
- Git control plane ADR:
  [docs/adr/0002-agent-git-control-plane.md](docs/adr/0002-agent-git-control-plane.md).
- Deployment notes: [deploy/RAILWAY.md](deploy/RAILWAY.md) and
  [deploy/LOOP-HOSTING.md](deploy/LOOP-HOSTING.md).
- Human onboarding: [README.md](README.md).

## PR Instructions

- Before opening or updating a PR to `main`, run `npm run bump:loop` and commit
  the synced version files.
- Branch protection requires PRs, passing Smoke CI, and strict up-to-date.
- Do not hard reset, force push, delete branches, delete remote branches, close
  PRs, merge, or admin-merge unless explicitly asked.
- Production deploys automatically on merge to `main` through Railway.
