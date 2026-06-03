# Codex Lane 1 — Substrate gate routing skeleton (PR1)

You are implementing **Lane 1 only** in repo `socratink-tui-agent` on branch `feat/substrate-gate`.

## Authority
- `docs/adr/0001-substrate-gate-before-route.md`
- `CONTEXT.md`
- `AGENTS.md` (event log, nextPhase purity, no inline prompts)

## Lane 1 scope ONLY
Routing skeleton + handler stub + tests + fixture. **Do NOT** implement:
- Real `prompt_templates.py` / live LLM substrate-gate prompts (Lane 2)
- Loop UI / `awaiting-cta` changes (Lane 3)
- PR2 pacing (`advanceSession` cold→delta split)
- Evidence derivation changes

## Required behavior

### nextPhase (`lib/seda/next-phase.mjs`)
- Change `DIRECT_PHASE.launch_attempt` from `"route"` to `"substrate_gate"`.
- Add `substrate_confirmed: "route"`.
- Add special cases if needed for mid-gate events (e.g. after `substrate_seed_offered`, stay in gate until confirmed — prefer handler emits `substrate_confirmed` in one turn for fast path; slow path may need `substrate_refinement` event then re-enter gate via `nextPhase`).

Recommended routing:
```
launch_attempt → substrate_gate (phase)
substrate_seed_offered → substrate_gate (same phase, handler continues)
substrate_refinement → substrate_gate
substrate_support_exhausted → substrate_gate (handler completes to confirmed in same invocation OR next handler call)
substrate_confirmed → route
```

### Handler (`lib/seda/handlers/substrate-gate.mjs`)
- Register in `lib/seda/handlers/index.mjs` as `substrate_gate: handleSubstrateGate`.
- **Lane 1 stub:** classify launch text with simple heuristics (no bridge call yet):
  - blank / "i don't know" / very short → slow path
  - phd-style multi-clause process → fast path
- Fast path: emit `substrate_confirmed` `{ adequacy: "adequate", graph_neutral: true, score_eligible: false }`.
- Slow path (one turn per handler invocation when using terminal prompt):
  - First invocation after low launch: emit `substrate_seed_offered`, print seed copy (stub string OK), set `ctx.composerCta`, call `prompt.ask("substrate_refinement", ...)`.
  - After refinement: emit `substrate_refinement` event; if still weak emit `substrate_support_exhausted`; emit `substrate_confirmed` `{ adequacy: "minimal"|"adequate" }`.
- Never append training attempts. Never mutate graph truth.

### ctx fields (document in handler)
- Track `ctx.substrateGateState` if needed (seed offered, refinement received) — or reconstruct from events.

### Tests (write/update FIRST)
- `tests/js/next-phase.test.mjs`: update `launch_attempt → substrate_gate`; add substrate_confirmed → route; substrate event routing.
- `tests/js/substrate-gate.test.mjs` (new): handler unit-style tests with fake prompt returning scripted refinement.
- `fixtures/novice_substrate_gate_script.json`: concept + thin launch + refinement + cold path fields for later lanes.

### Harness
- Update `HARNESS.md` phase list to include `substrate_gate` (one line).

## Verification (must run and report output)
```bash
find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test
```

## Deliverable summary
At end, list files changed, test results, and what Lane 2 must add.
