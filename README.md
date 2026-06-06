# Socratink TUI (agent-first MVP)

Minimum runnable Socratink terminal lab, trimmed for **agents and automation** first.

## Start here (agents)

**Throughline:** handlers append facts → `nextPhase(events)` routes. See `AGENTS.md`.

1. **`AGENTS.md`** — throughline, architecture, graph honesty, testing commands
2. **`CONTEXT.md`** — product vocabulary (glossary only; no implementation)
3. **`HARNESS.md`** — substrate invariants, event-module roles, replay contract
4. **`HARNESS-TRACEABILITY.md`** — V-model tiers and merge checklist
5. **`pedagogical_agents/contracts.json`** — agent boundaries and failure modes
6. **`prompt_templates.py`** — versioned LLM prompts (edit here, bump `version`, run tests)
7. **`bridge.py`** — six bridge actions; subprocess LLM seam only

## Setup

```bash
cp .env.example .env          # GEMINI_API_KEY for live sessions
./scripts/bootstrap-python.sh
```

## Verify (no API key)

```bash
./scripts/check-canon-drift.sh
.venv/bin/pytest tests/test_prompt_template.py tests/test_prompt_eval_evaluator.py tests/test_prompt_eval_repair_dialogue.py -q
find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test
SOCRATINK_TUI_FAKE_LLM=1 ./socratink-tui --scripted fixtures/source_less_script.json --color=never
```

`tests/js/loop-chat-ui.test.mjs` is server-backed, not part of the
self-contained Node test set. Run it with the loop server:

```bash
SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env \
SOCRATINK_TUI_FAKE_LLM=1 \
SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
  node --no-warnings loop-server.mjs

SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 node --test tests/js/loop-chat-ui.test.mjs
```

## A/B vs full lab (live Gemini)

From either checkout (script lives in both):

```bash
export GEMINI_API_KEY=...
node scripts/ab-live-experiment.mjs \
  --variant-a ../socratink-tui \
  --variant-b .
```

Reads `REPORT.md` under `.qa-runs/ab-live/<timestamp>/` for cold classification,
repair turns, bridge readiness, final evidence state, and LLM latency per variant.

## Run

```bash
./socratink-tui
```

## Hosted loop (faithful chat UI)

Same SEDA + `bridge.py` over HTTP — for Railway/sandbox, not Vercel:

```bash
./socratink-loop-server
# http://127.0.0.1:8787/loop
```

Deploy and `app.socratink.ai/loop` proxy: **`deploy/LOOP-HOSTING.md`**.  
Power-user dogfood (MVD checklist + invite copy): **`deploy/MINIMUM-VIABLE-DEPLOYMENT.md`**.  
Railway step-by-step plan: **`deploy/RAILWAY.md`**.

## What was omitted from the full lab repo

- Dashboard, persona QA runs, learnops-extract, founder-only docs
- Profile / tech-eval fixture bulk (core scripted fixtures kept)
- `.venv`, session logs, `.qa-runs`

## Sync vendored canon from socratink-app (optional)

```bash
./scripts/sync-canon-from-app.sh
./scripts/check-canon-drift.sh
```

## Layout

```text
AGENTS.md              ← read first (throughline)
CONTEXT.md             ← vocabulary
HARNESS.md             ← substrate contract
app.mjs                ← session entry
bridge.py              ← LLM subprocess
prompt_templates.py    ← prompts
lib/seda/              ← phase handlers + router
lib/canon/             ← graph truth (vendored)
vendor/python/         ← LLM seam (vendored)
evals/prompts/         ← L2 prompt eval cases
tests/                 ← CI gates (incl. architecture-fitness)
fixtures/              ← scripted sessions
```

Copied from `socratink-tui` as an agent-first minimum viable tree.
