---
name: conventions
type: context
description: How code is written in this project — naming, structure, patterns, and style. Load when writing new code or reviewing existing code.
triggers:
  - "convention"
  - "pattern"
  - "naming"
  - "style"
  - "how should I"
  - "what's the right way"
edges:
  - target: context/architecture.md
    condition: when a convention depends on understanding the system structure
  - target: context/seda.md
    condition: when conventions involve events, routing, handlers, or phase names
  - target: context/graph-honesty.md
    condition: when conventions involve evidence, scoring, or learner-facing mastery language
last_updated: 2026-06-30
---

# Conventions

## Naming

- JS module files use kebab-case: `next-phase.mjs`, `event-facts.mjs`, `repair-policy.mjs`.
- Runtime event types use snake_case strings: `cold_attempt`, `repair_dialogue_turn`, `spaced_redrill`.
- Event builder methods use camelCase: `eventBuilders.coldAttempt`, `repairDialogueTurn`, `routeGenerated`.
- Python tests live under the repo `tests` directory; Node tests live under `tests/js`.
- Product vocabulary uses **Confirmed Substrate** and **Substrate Gate**; do not use informal "floor" language.

## Structure

- SEDA runtime lives in `lib/seda/`; phase-specific code belongs in `lib/seda/handlers/`.
- Prompt templates live in `prompt_templates.py`; bridge transport and action dispatch live in `bridge.py`.
- Browser loop UI lives in `public/loop/`; do not look for React app directories before `rg --files` proves they exist.
- Bridge contracts are machine-readable in `lib/bridge/registry.json`.
- Product vocabulary belongs in `.mex/context/product-vocabulary.md`; verification ladder belongs in `.mex/context/release-ladder.md`.
- Mex Markdown files use minimal frontmatter: `name`, `type`, `description`, and `last_updated`. Keep `type` to the existing scaffold roles; do not add an OKF schema layer.

## Patterns

Append facts with builders, then let `nextPhase` route:
```js
// Correct
events.push(eventBuilders.gapIdentified({ repair_scaffold, gap_id }));
// nextPhase(events) routes gap_identified -> repair_dialogue

// Wrong
events.push({ type: "gap_identified", repair_scaffold });
phase = "repair_dialogue";
```

Keep score eligibility narrow:
```js
// Correct
eventBuilders.repairDialogueTurn({
  graph_neutral: true,
  score_eligible: false,
  turn_index,
  kc_id,
});

// Wrong
eventBuilders.repairDialogueTurn({ score_eligible: true, turn_index, kc_id });
```

Prompt contract changes cross Python and registry files:
```text
prompt_templates.py -> bridge.py normalizer/handler -> lib/bridge/registry.json
-> tests/test_prompt_template.py
```

## Verify Checklist

Before presenting any code:
- [ ] Any routing-relevant event is appended last in the handler turn.
- [ ] New runtime facts use `eventBuilders` and satisfy `event-facts.mjs` required fields.
- [ ] `nextPhase(events)` stays pure: no bridge, handler, I/O, taxonomy, dashboard, or metric imports.
- [ ] Score-eligible evidence remains limited to `cold_attempt` and `spaced_redrill`.
- [ ] Prompt dynamic slot changes update `prompt_templates.py`, matching `bridge.py` code, and prompt tests.
- [ ] Frontend changes were made under `public/` and verified against the hosted loop when UI behavior changed.
- [ ] The shallowest matching gate was run: `npm test`, prompt pytest, hosted UI test, or `npm run ci:local`.
