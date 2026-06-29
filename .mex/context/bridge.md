---
name: bridge
description: Python LLM bridge contract, action registry, provider setup, diagnostics, and prompt wiring.
triggers:
  - "bridge"
  - "LLM"
  - "Gemini"
  - "prompt"
  - "provider"
  - "registry"
edges:
  - target: context/architecture.md
    condition: when needing to see where bridge calls sit in the loop
  - target: context/seda.md
    condition: when bridge output affects emitted events or nextPhase routing fields
  - target: context/setup.md
    condition: when configuring keys, fake mode, or provider env vars
  - target: patterns/update-bridge-action.md
    condition: when changing bridge.py actions or registry contracts
  - target: patterns/debug-bridge-failure.md
    condition: when bridge calls fail, time out, or return invalid output
last_updated: 2026-06-29
---

# Bridge

## Contract

Node calls `python bridge.py <action>` through `lib/bridge/client.mjs`, sending JSON on stdin and expecting JSON on stdout. The SEDA loop sees action IDs and response fields, not provider internals.

## Actions

- `generate-route` — route generation, emits `route_generated` or retryable `route_retry`.
- `substrate-gate` — pre-map substrate adequacy, emits substrate gate facts.
- `evaluate-attempt` — evaluates cold, post-bridge transfer, and spaced redrill modes.
- `repair-scaffold` — produces delta repair scaffold.
- `socratic-repair-drill` — augments delta scaffold slots.
- `repair-dialogue` — judges own-words repair and exposes `bridge_ready` / `next_dialogue_action`.

## Files

- `bridge.py` — CLI action dispatch and normalizers.
- `prompt_templates.py` — versioned prompts and dynamic slots.
- `lib/bridge/client.mjs` — subprocess transport, fail-closed behavior, diagnostics.
- `lib/bridge/registry.json` — machine-readable wire/action contract.
- `vendor/python/` — provider/runtime prompt implementation.

## Gotchas

- Route template versioning is pinned in `prompt_templates.py`; live route prompt logic is in `vendor/python/`, not `build_prompt()` in `bridge.py`.
- `callBridge` throws on timeout, non-JSON, and nonzero exit; `callBridgeResult` is used for retryable route errors.
- `BridgeNonJson` and provider timeout diagnostics are bridge problems first; do not patch `nextPhase` to hide them.
- Fake LLM mode is a first-class CI/smoke path, not evidence that live Gemini is configured.
