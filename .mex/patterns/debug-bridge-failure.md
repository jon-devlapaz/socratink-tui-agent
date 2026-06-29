---
name: debug-bridge-failure
description: Diagnose bridge subprocess failures, provider auth/config mistakes, timeouts, and non-JSON output.
triggers:
  - "BridgeNonJson"
  - "BridgeTimeout"
  - "bridge failed"
  - "GEMINI_API_KEY"
edges:
  - target: context/bridge.md
    condition: always load for bridge failure diagnosis
  - target: context/setup.md
    condition: when env vars or provider setup may be wrong
  - target: patterns/update-bridge-action.md
    condition: when the failure is caused by a changed bridge contract
last_updated: 2026-06-29
---

# Debug Bridge Failure

## Context

Bridge failures are transport/provider/contract failures until proven otherwise. Do not patch SEDA routing to mask them.

## Steps

1. Check whether the run intended live LLM or fake mode.
2. For live Gemini, verify `.env` has `GEMINI_API_KEY` and expected `LLM_MODEL`.
3. For OpenAI-compatible mode, verify `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, and model env in the same process that runs the command.
4. Inspect diagnostics from `lib/bridge/client.mjs` when present.
5. Reproduce with the smallest action/test that covers the failing bridge path.
6. Only then edit `bridge.py`, provider code, prompt templates, or registry contracts.

## Gotchas

- `SOCRATINK_TUI_FAKE_LLM=1` proves the SEDA path, not live provider auth.
- Slow local models may need `SOCRATINK_BRIDGE_TIMEOUT_MS`.
- Non-JSON output often means Python stderr/stdout contamination or a provider exception.

## Verify

- [ ] Fake-mode smoke passes if testing SEDA only.
- [ ] Live provider command passes if testing provider integration.
- [ ] Bridge registry pytest module after registry/contract changes.
- [ ] `npm test` after emitted event or routing changes.

## Debug

If the diagnostic has redacted env but no key visibility, fix env loading first. If stdout is non-JSON, fix the Python action before touching Node routing.

## Update Scaffold
- [ ] Update `.mex/ROUTER.md` "Current Project State" if what's working/not built has changed
- [ ] Update any `.mex/context/` files that are now out of date
- [ ] If this is a new task type without a pattern, create one in `.mex/patterns/` and add it to the pattern index
