# AGENTS.md

Project: Socratink TUI is the founder-facing terminal and hosted-loop lab for
evidence-weighted adaptive learning.

This file is a bootloader and safety card only. `.mex/` is the sole source of
agent context.

## Start here

1. Read `.mex/ROUTER.md`.
2. If the task is vague or empty, read `.mex/ACTIVE.md` and use its current hardening tasks.
3. Load only the `.mex/context/` and `.mex/patterns/` files routed for the task.
4. Before file edits, run `npm run agent:git -- guard-write`.

## Safety rules

- `lib/seda/next-phase.mjs` owns phase and lane selection.
- Handlers append facts; they do not choose the next phase directly.
- Append runtime facts with `eventBuilders` from `lib/seda/event-facts.mjs`.
- Do not mutate `events[]` in place.
- Keep prompts in `prompt_templates.py`; do not inline prompts in `bridge.py`.
- Do not hard reset, force push, delete branches, delete remote branches, close
  PRs, merge, or admin-merge unless explicitly asked.

## Commands

- Mex scaffold truth gate: `npm run mex:check`.
- Fast SEDA gate: `npm test`.
- Full local CI mirror: `npm run ci:local`.
- Agent git status: `npm run agent:git -- status`.
- Agent write guard: `npm run agent:git -- guard-write`.
