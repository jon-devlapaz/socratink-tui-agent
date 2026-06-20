# Socratink TUI (agent-first MVP)

Minimum runnable Socratink terminal lab, trimmed for **agents and automation** first.

## Start here (agents)

**Throughline:** handlers append facts → `nextPhase(events)` routes. See `AGENTS.md`.

1. **`AGENTS.md`** — operating card, SEDA throughline, graph-honesty rules
2. **`CONTEXT.md`** — product vocabulary (glossary only; no implementation)
3. **`HARNESS.md`** — substrate invariants, event-module roles, replay contract
4. **`HARNESS-TRACEABILITY.md`** — V-model tiers, release ladder, merge checklist
5. **`HARNESS-BRIDGE-REGISTRY.md`** — bridge wire contracts and drift gates
6. **`pedagogical_agents/contracts.json`** — agent boundaries and failure modes
7. **`prompt_templates.py`** — versioned LLM prompts (edit here, bump `version`, run tests)
8. **`bridge.py`** — six bridge actions; subprocess LLM seam only

## Setup

```bash
cp .env.example .env          # GEMINI_API_KEY for live sessions
./scripts/bootstrap-python.sh
npm install                   # eslint for lib/
pip install poetry && poetry install --no-root   # mypy + pre-commit (dev only)
pre-commit install            # optional: lint hooks before commit
```

## Verify (no API key)

```bash
./scripts/check-seda-spine.sh
```

Full merge ladder (canon, JS, Python, harness replay, scripted smoke, hosted UI):
[`HARNESS-TRACEABILITY.md` § Release ladder](HARNESS-TRACEABILITY.md#release-ladder).

## Local test

```bash
npm test
```

`npm test` runs the fast SEDA architecture/router gate. Use `npm run ci:local`
for the full local CI mirror in `scripts/run-ci-local.sh`.

## AgentLint

```bash
npm run agentlint
```

Runs AgentLint with Socratink-specific calibration. Use the report to find
agent-workability friction; do not treat every generic fix-plan item as a repo
requirement.

CI runs `npm run agentlint:gate` with `AGENTLINT_MIN_SCORE=75`, so AgentLint is
a regression gate without making every generic recommendation mandatory.

For a quick human smoke without the full ladder:

```bash
SOCRATINK_TUI_FAKE_LLM=1 ./socratink-tui --scripted fixtures/source_less_script.json --color=never
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
HARNESS-TRACEABILITY.md ← release ladder
HARNESS-BRIDGE-REGISTRY.md ← bridge wire contracts
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
