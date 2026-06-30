---
name: update-bridge-action
type: pattern
description: Change a bridge.py LLM action, response shape, provider behavior, or registry entry.
triggers:
  - "bridge action"
  - "registry.json"
  - "bridge.py"
  - "LLM action"
edges:
  - target: context/bridge.md
    condition: always load before changing bridge contracts
  - target: context/seda.md
    condition: when bridge fields affect emitted events or routing
last_updated: 2026-06-30
---

# Update Bridge Action

## Context

Load `context/bridge.md`. For prompt slot changes, also follow `patterns/update-prompt-template.md`.

## Steps

1. Change `bridge.py` action handling or normalizer.
2. Update `lib/bridge/registry.json` for request/response schema, policy gates, or post-call hooks.
3. Update handler payload/event mapping in `lib/seda/handlers/` only if the wire shape changed.
4. Add/update bridge contract tests and the JS bridge-registry test.

## Gotchas

- `generate-route` has retryable route errors through `callBridgeResult`; most other actions fail closed through `callBridge`.
- Provider swaps belong behind the same action IDs and JSON shapes.
- Do not inline prompts in Node handlers.

## Verify

- [ ] Bridge registry and prompt template pytest modules.
- [ ] `node --test tests/js/bridge-registry.test.mjs`
- [ ] `npm test` if routing fields or emitted events changed.

## Debug

Use `patterns/debug-bridge-failure.md` if the subprocess times out, exits nonzero, or returns non-JSON.

## Update Scaffold
- [ ] Update `.mex/ROUTER.md` "Current Project State" if what's working/not built has changed
- [ ] Update any `.mex/context/` files that are now out of date
- [ ] If this is a new task type without a pattern, create one in `.mex/patterns/` and add it to the pattern index
