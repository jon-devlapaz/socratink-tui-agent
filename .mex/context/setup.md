---
name: setup
type: context
description: Dev environment setup and commands. Load when setting up the project for the first time or when environment issues arise.
triggers:
  - "setup"
  - "install"
  - "environment"
  - "getting started"
  - "how do I run"
  - "local development"
edges:
  - target: context/stack.md
    condition: when specific technology versions or library details are needed
  - target: context/architecture.md
    condition: when understanding how components connect during setup
  - target: context/bridge.md
    condition: when configuring LLM providers, fake mode, or bridge diagnostics
  - target: patterns/debug-bridge-failure.md
    condition: when live or fake LLM calls fail during setup
last_updated: 2026-07-02
---

# Setup

## Prerequisites

- Node.js with npm, for `node --test`, ESLint, scripts, TUI, and loop server.
- Python with venv support, bootstrapped by `./scripts/bootstrap-python.sh`.
- `GEMINI_API_KEY` for live Gemini sessions, or fake/local provider env for no-spend runs.
- Optional: `poetry` and `pre-commit` for dev checks.

## First-time Setup

1. `cp .env.example .env`
2. Fill `GEMINI_API_KEY` in `.env`, or set `SOCRATINK_TUI_FAKE_LLM=1` for fake mode.
3. `./scripts/bootstrap-python.sh`
4. `npm install`
5. `pip install poetry && poetry install --no-root`
6. Optional: `pre-commit install`
7. Run `npm test` before deeper work.

## Environment Variables

- `GEMINI_API_KEY` (required for live Gemini) — API key for live sessions.
- `LLM_MODEL` (optional) — default example is `gemini-2.5-flash`.
- `LLM_PROVIDER` (optional) — `gemini` default or `openai_compatible`.
- `LLM_BASE_URL` (required when `LLM_PROVIDER=openai_compatible`) — local/provider base URL.
- `LLM_API_KEY` (required when provider expects auth) — OpenAI-compatible key; LM Studio accepts any non-empty key.
- `SOCRATINK_TUI_FAKE_LLM` (optional) — use fake bridge behavior without Gemini spend.
- `SOCRATINK_TUI_LOG_ROOT` (optional) — session log root, commonly a local QA run directory.
- `PORT` (optional) — hosted loop port, default `8787`.
- `SOCRATINK_LOOP_API_KEY` (optional) — bearer auth for hosted `/api/*`.
- `SOCRATINK_LOOP_SESSION_STORE_DIR` (optional) — hosted session journals.
- `SOCRATINK_BRIDGE_TIMEOUT_MS` (optional) — bridge subprocess timeout.
- `SOCRATINK_LOOP_BASE_URL` (optional) — base URL for browser/loop QA scripts.

## Common Commands

- `./socratink-tui` — run the terminal learning loop.
- `./socratink-loop-server` — run hosted loop on the local loop port.
- `npm test` — fast SEDA spine gate.
- `npm run ci:local` — full local CI mirror before release.
- `npm run lint` — ESLint over `lib/`.
- `npm run agentlint` — Socratink-calibrated AgentLint report.
- `npm run agentlint:gate` — AgentLint CI gate.
- prompt/template contract check — run the focused pytest module named in `.mex/context/release-ladder.md`.
- `SOCRATINK_TUI_FAKE_LLM=1 ./socratink-tui --scripted fixtures/source_less_script.json --color=never` — no-spend scripted smoke.
- hosted loop UI test — run the Node loop-chat UI test against a running server.

## Common Issues

**Bridge fails live:** Check `.env` has `GEMINI_API_KEY`, or run with `SOCRATINK_TUI_FAKE_LLM=1`. Use bridge diagnostics before changing routing.

**Bridge returns non-JSON or times out:** Inspect diagnostics written by `lib/bridge/client.mjs`; increase `SOCRATINK_BRIDGE_TIMEOUT_MS` for slow local models.

**Hosted loop UI tests fail to connect:** Start `./socratink-loop-server` in fake mode first and set `SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787`.

**Deployed `/loop` does not work on Vercel:** Vercel cannot host the loop process; configure a persistent loop host and proxy from the main app.
