# Codex Lane 3 — Loop UI substrate turns (PR1)

Status: historical lane packet. Prefer `SUMMARY.md` for the current PR1
provenance summary.

Original Lane 3 packet. It assumed Lane 1+2 branch state.

## Authority
ADR-0001 loop UI requirement: substrate gate must yield separate HTTP turns on `/loop`.

## Lane 3 scope
- `lib/seda/handlers/substrate-gate.mjs`: ensure `prompt.ask("substrate_refinement", ...)` throws PROMPT_REQUIRED on loop (options.loopUi) after seed is shown — may require splitting slow path across handler invocations (return after seed, re-enter on next POST).
- `lib/loop-server/awaiting-cta.mjs`: CTA for substrate refinement key
- `lib/loop-server/prompt-help.mjs`: help copy for substrate_refinement if needed
- `public/loop/loop.js`: phase slug/labels for substrate if section tags used
- `tests/js/loop-chat-ui.test.mjs`: new test — novice substrate fixture gets `substrate_seed_offered` before `route_generated` across multiple API turns

## Pattern to follow
Read `lib/loop-server/session.mjs` — loop batches until PROMPT_REQUIRED. Substrate slow path MUST prompt.ask and return mid-phase so hosted users see seed turn, then refinement turn, then route.

## Out of scope
- Stopping cold→delta batching (PR2)
- Hiding LLM receipts (PR2/nice-to-have)

## Verification
```bash
# terminal JS (no server)
find tests/js -name '*.test.mjs' -print | sort | xargs node --test

# server-backed loop test
SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env SOCRATINK_TUI_FAKE_LLM=1 node --no-warnings loop-server.mjs &
sleep 2
SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 node --test tests/js/loop-chat-ui.test.mjs
```
