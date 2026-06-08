# ADR: Fake bridge VCR stub replaces heuristic mini-LLM

**Status:** Accepted (2026-06-08)

## Context

`bridge_fake.py` (~849 LOC) duplicated evaluator and repair-dialogue judge logic
using keyword heuristics tuned to pass L2 prompt evals. That drifted from promoted
traces (`test_fake_repair_dialogue_golden.py`) and was a second product
implementation.

## Decision

Replace heuristics with a **bridge VCR stub** applied in order:

1. **Knobs** — env classification overrides and route-fail injection
2. **Lookup** — canonical-input → canned JSON from `evals/prompts/*/cases.jsonl`,
   `fixtures/bridge_vcr/golden_repair_dialogue.json`,
   `fixtures/bridge_vcr/promoted_repair_dialogue.jsonl`, and integration rows
3. **Defaults** — static concept-bucket route maps (immune vs cache), substrate
   3-class, shallow evaluator fallback, repair-dialogue `probe_again`

Modules: `bridge_fake.py` (facade), `bridge_fake_lookup.py`, `bridge_fake_knobs.py`,
`bridge_fake_defaults.py`, `bridge_fake_response.py`.

Per-action canonical lookup keys use field allowlists (not raw payload hash).

## Consequences

- L2 prompt evals and golden repair tests gate on lookup tables, not NLP rules.
- New eval or fixture inputs require an explicit VCR row or env knob.
- `SOCRATINK_TUI_FAKE_LLM=1` CI smoke unchanged in outcome on canonical fixtures.
- Real Gemini path and `nextPhase` untouched.

## Verification

```bash
.venv/bin/pytest tests/test_bridge_fake_lookup.py tests/test_bridge_fake_contract_modules.py \
  tests/test_repair_dialogue_contract.py tests/test_prompt_eval_*.py \
  tests/test_fake_repair_dialogue_golden.py tests/test_workspace_smoke.py -q
SOCRATINK_TUI_FAKE_LLM=1 ./socratink-tui --scripted fixtures/source_less_script.json --color=never
./socratink-harness replay
./scripts/check-seda-spine.sh
```
