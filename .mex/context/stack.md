---
name: stack
description: Technology stack, library choices, and the reasoning behind them. Load when working with specific technologies or making decisions about libraries and tools.
triggers:
  - "library"
  - "package"
  - "dependency"
  - "which tool"
  - "technology"
edges:
  - target: context/architecture.md
    condition: when technology choices need system-flow context
  - target: context/bridge.md
    condition: when Python, provider, or subprocess details matter
  - target: context/setup.md
    condition: when installing, configuring, or running the stack
  - target: context/conventions.md
    condition: when understanding how to use a technology in this codebase
last_updated: 2026-06-29
---

# Stack

## Runtime shape

- Node.js ES modules are the primary SEDA runtime; `package.json` has
  `"type": "module"`.
- Python owns prompt templates, bridge CLI behavior, LLM provider adapters, and
  pytest coverage.
- Bash scripts provide verification entrypoints such as
  `scripts/check-seda-spine.sh` and `scripts/run-ci-local.sh`.
- Hosted loop UI is static JS and CSS under `public/loop/`.
- Railway or another persistent host runs the long-lived hosted loop process.

## Tooling notes

- Declared npm tooling is limited to ESLint and AgentLint packages.
- Python checks use pytest test modules under the repo `tests` directory.
- Prefer Node built-ins such as `node --test`, `node:child_process`, `node:fs`,
  and `node:path` before adding packages.
- Provider swaps stay behind `bridge.py` and the bridge action contract.
- `SOCRATINK_TUI_FAKE_LLM=1` uses local fake bridge behavior for CI and scripted
  smoke without API spend.

## What We Deliberately Do NOT Use

- No frontend framework for `/loop`; it is static JS/CSS under `public/loop/`.
- No database/ORM in this repo for the loop runtime.
- No Redux/Tailwind/app-router tree; frontend changes are plain public assets.
- No direct HTTP LLM calls from Node handlers; use `bridge.py` through `lib/bridge/client.mjs`.
- No new runtime npm dependencies unless a few lines of stdlib cannot cover the job.

## Version Constraints

- Package version is `0.53.0`; loop version sync is handled with `npm run bump:loop` / `npm run version:check`.
- ESLint packages are pinned around `^9.28.0`; keep config compatible with flat ESLint 9.
- Python version is not declared in this scaffold; use `./scripts/bootstrap-python.sh` to create the repo-supported environment.
