# Prompt evals (L2)

Single-hop bridge evals: fixed inputs → structured control fields after
`judge_*` / `_normalize_*`. Not routing traces, not graph derivation.

## Layers

| Layer | Location | Gate |
| --- | --- | --- |
| L1 | `tests/test_prompt_template.py`, `tests/test_repair_dialogue_contract.py` | Template slots + contracts |
| L2 | `evals/prompts/*/cases.jsonl` + `tests/test_prompt_eval_*.py` | Fake bridge output (CI) |
| L3 | `fixtures/` + scripted TUI | Full SEDA, fake LLM |
| L4 | `learning_cases/` + `./socratink-harness replay` | Event order + derivation |

## Promotion

- **Routing / handler failure** → `learning_cases/` (frozen session trace)
- **Single-hop judge/scaffold drift** → `evals/prompts/<agent>/cases.jsonl`
- Do not promote prompt wording failures to `learning_cases/`

## CI (L2 prompt evals)

```bash
.venv/bin/pytest \
  tests/test_prompt_eval_repair_dialogue.py \
  tests/test_prompt_eval_evaluator.py \
  tests/test_repair_dialogue_contract.py \
  tests/test_prompt_template.py -q
```

### evaluator (`socratink-evaluator-v6`)

Cases under `evals/prompts/evaluator/cases.jsonl` pin **solid vs fluent-shallow**
cold attempts, help_request, misconception, deep partial, spaced re-drill, and
gap drill. Fake bridge heuristics (`bridge._fake_evaluator_classification`)
mirror the v5 causal rubric for CI; live Gemini snapshots are optional L3.

Fake mode (`SOCRATINK_TUI_FAKE_LLM=1`) is the default CI gate. Live snapshots
require a pinned provider/model and are not merge-blocking in v1.

## Case metadata

Each row pins `prompt_version` (from `prompt_templates.py`) and
`contract_version` (bridge judge schema). Assert only routing fields:
`bridge_ready`, `next_action`, `next_dialogue_action`, `graph_neutral`,
`score_eligible`, `contract_version`.
