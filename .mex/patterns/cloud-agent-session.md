---
name: cloud-agent-session
description: Bootstrap Cursor, Codex, and other cloud agents when the prompt is vague or empty.
triggers:
  - "cloud agent"
  - "cursor"
  - "codex"
  - "empty prompt"
  - "vague task"
edges:
  - target: ACTIVE.md
    condition: when the user gave no concrete task
  - target: context/release-ladder.md
    condition: when choosing the shallowest verification gate
last_updated: 2026-06-30
---

# Cloud Agent Session

## Context

Read `.mex/ROUTER.md`, then `.mex/ACTIVE.md` when the user prompt is empty,
vague, or only asks the agent to continue.

## Steps

1. If there is no concrete task, use `.mex/ACTIVE.md` "Current hardening tasks"
   as the default scope.
2. State the bounded plan and ask at most one narrowing question only if the
   next edit would otherwise be risky.
3. Load only the routed `.mex/context/` files and matching pattern files.
4. Before edits, run `npm run agent:git -- guard-write`.
5. Build the smallest useful slice.
6. Verify with the shallowest matching gate from `.mex/context/release-ladder.md`.
7. Finish with agent git hygiene: status, branch, commit, push, and draft PR
   when the task asks for a reviewable change.

## Gotchas

- Do not replace `.mex/` with root docs or parallel personal-memory files.
- Do not chase AgentLint advice that conflicts with `.mex/` being canonical.
- Do not load every context file. Routing discipline is part of the task.

## Verify

- [ ] `npm run mex:check` passes after scaffold or agent-doc changes.
- [ ] The final note lists the exact gates run and any skipped broader gate.

## Update Scaffold

- [ ] Update `.mex/ROUTER.md` if session routing changes.
- [ ] Update `.mex/patterns/INDEX.md` when this pattern changes.
