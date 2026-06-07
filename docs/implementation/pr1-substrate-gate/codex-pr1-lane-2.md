# Codex Lane 2 — Substrate gate bridge + handler logic (PR1)

Status: historical lane packet. Prefer `SUMMARY.md` for the current PR1
provenance summary.

Original Lane 2 packet. It assumed the Lane 1 routing skeleton and handler stub
already existed.

## Authority
Same as Lane 1: ADR-0001, CONTEXT.md, AGENTS.md.

## Lane 2 scope
- `prompt_templates.py`: new `TEMPLATES["substrate_gate"]` with version string
- `bridge.py`: `substrate_gate()` action + CLI dispatch
- `bridge_fake.py`: fake classifications for CI (fast/slow/minimal)
- `lib/bridge/registry.json` + run `node lib/bridge/render-registry-doc.mjs` if repo has refresh script
- Replace handler heuristics with `bridge.callBridge("substrate-gate", ...)`
- `lib/seda/route-generation.mjs` + route bridge payload: pass `substrate_adequacy: "adequate"|"minimal"`
- Update route system prompt slot: stop calling launch "threshold"; use `substrate_adequacy`
- `evals/prompts/substrate_gate/cases.jsonl` + `tests/test_prompt_eval_substrate_gate.py` (mirror evaluator eval pattern)
- `tests/test_prompt_template.py`: add substrate_gate template test if needed
- Update `fixtures/novice_substrate_gate_script.json` for scripted slow path

## Policy (must match ADR)
- Hybrid: bridge returns `substrate_adequate: bool`, optional `seed_text`, `refinement_prompt`
- 1 seed + 1 refinement max; then `substrate_support_exhausted` + `adequacy: minimal`
- All substrate events: `graph_neutral: true`, `score_eligible: false`

## Out of scope
- Loop UI (`awaiting-cta`, `loop.js`) — Lane 3
- advanceSession pacing — PR2

## Verification
```bash
find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test
.venv/bin/pytest tests/test_prompt_template.py tests/test_bridge_registry.py tests/test_prompt_eval_substrate_gate.py -q
SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow ./socratink-tui --scripted fixtures/novice_substrate_gate_script.json --color=never
```
