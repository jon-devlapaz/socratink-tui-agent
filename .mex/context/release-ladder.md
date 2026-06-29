---
name: release-ladder
description: Verification tiers and merge gates for Socratink TUI changes. Load when choosing which checks prove a change.
triggers:
  - "release"
  - "merge"
  - "verification"
  - "ci"
  - "gate"
  - "which tests"
edges:
  - target: context/seda.md
    condition: when the change touches routing, events, handlers, or pacing
  - target: context/bridge.md
    condition: when the change touches bridge actions, prompt templates, providers, or fake/live parity
  - target: context/graph-honesty.md
    condition: when the change touches score eligibility, evidence, replay, or mastery claims
last_updated: 2026-06-29
---

# Release ladder

Use the shallowest gate that covers the change. Do not add ceremony when one
focused check proves the behavior.

## Tier 1: SEDA spine

Run:

```bash
./scripts/check-seda-spine.sh
```

Use when changing phases, handlers, events, pacing, routing, event facts, or
graph-honesty boundaries. This is also the default `npm test` gate.

## Scaffold truth

Run:

```bash
npm run mex:check
```

Use when `.mex/`, root agent instructions, package docs, commands, or doc
pruning changed. `npm run ci:local` includes this gate.

## Tier 2: local CI mirror

Run:

```bash
npm run ci:local
```

Use before release work and broad changes that cross Node, Python, harness,
prompt, replay, or scripted smoke surfaces.

## Tier 3: prompt and bridge checks

Run the focused Python prompt checks when prompt slots, prompt versions, bridge
normalizers, or fake/live bridge behavior changes:

```bash
.venv/bin/pytest \
  tests/test_prompt_eval_repair_dialogue.py \
  tests/test_prompt_eval_evaluator.py \
  tests/test_repair_dialogue_contract.py \
  tests/test_prompt_template.py -q
```

## Tier 4: hosted loop UI

Use when changing `public/loop/`, hosted session HTTP, browser projection, or
learner-facing hosted pacing. Start the fake-mode loop server, then run the
server-backed UI test:

```bash
SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env \
SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
  node --no-warnings loop-server.mjs

SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 \
  node --test tests/js/loop-chat-ui.test.mjs
```

## Merge checklist

- route changes are in `nextPhase(events)` or `DIRECT_PHASE`
- runtime facts use `eventBuilders`
- score-eligible evidence remains limited to `cold_attempt` and `spaced_redrill`
- replay and dashboard state are derived from events, not adapter caches
- run the matching gate and report any blocker directly
