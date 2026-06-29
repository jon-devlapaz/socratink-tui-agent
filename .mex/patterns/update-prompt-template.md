---
name: update-prompt-template
description: Change versioned prompt templates or dynamic prompt slots safely.
triggers:
  - "prompt_templates.py"
  - "prompt slot"
  - "template version"
  - "prompt eval"
edges:
  - target: context/bridge.md
    condition: prompt templates feed bridge actions
  - target: patterns/update-bridge-action.md
    condition: when prompt IO changes the bridge response or request shape
last_updated: 2026-06-29
---

# Update Prompt Template

## Context

Load `context/bridge.md`. Prompt templates live in `prompt_templates.py`; bridge action dispatch and normalization live in `bridge.py`.

## Steps

1. Edit the relevant template in `prompt_templates.py`.
2. Bump the template version when the contract changes.
3. Update the corresponding `bridge.py` function if dynamic slots changed.
4. Update prompt tests in `tests/test_prompt_template.py`.
5. If prompt behavior affects repair/evaluator quality, update the matching prompt eval test.

## Gotchas

- Route template contract is in `prompt_templates.py`, but live route generation uses `vendor/python/` runtime code.
- Prompt text changes can be doc-only; prompt slot changes are code changes.
- Do not scatter prompt fragments into Node files.

## Verify

- [ ] Prompt template pytest module.
- [ ] Relevant prompt eval pytest modules.
- [ ] `npm test` if handler events or routing changed.

## Debug

If a prompt test fails, compare the expected dynamic slots first; do not rewrite bridge normalizers until the template contract is clear.

## Update Scaffold
- [ ] Update `.mex/ROUTER.md` "Current Project State" if what's working/not built has changed
- [ ] Update any `.mex/context/` files that are now out of date
- [ ] If this is a new task type without a pattern, create one in `.mex/patterns/` and add it to the pattern index
