# Karpathy-Like Repo Tightening Report

Created: 2026-06-07

## Score

- Before: `6.5/10`
- After: `8.0/10`

The core SEDA engine was already Karpathy-like: handlers append facts,
`nextPhase(events)` routes, `eventBuilders` construct facts, and projections stay
read-only. The surrounding repo was heavier: overlapping wording, scattered
validation entrypoints, and a few product-truth terms that future agents could
misread.

## Changed Files

Goal-owned:

- `AGENTS.md`
- `CONTEXT.md`
- `HARNESS.md`
- `HARNESS-TRACEABILITY.md`
- `README.md`
- `docs/greenfield-ai-native-implementation-plan.md`
- `docs/implementation/karpathy-like/BASELINE.md`
- `docs/implementation/karpathy-like/REPORT.md`
- `scripts/check-seda-spine.sh`
- `socratink-loop-server`
- `tests/js/architecture-anti-drift.test.mjs`
- `lib/loop-server/version.mjs`
- `public/loop/index.html`
- `public/loop/loop.js`

## What Changed

- Added `./scripts/check-seda-spine.sh` as the fast SEDA spine validation
  entrypoint.
- Updated README and traceability docs so agents can find the spine check without
  rediscovering a command subset.
- Corrected repair/evidence wording: `repair` is graph-neutral
  routing/telemetry, not an evidence candidate.
- Sharpened hosted wording around prompt-required boundaries, post-handler
  pacing stops, case completion, session completion, bridge readiness, and KC
  graph truth.
- Added focused anti-drift tests for repair/evidence docs and completion signal
  separation.
- Mapped existing prompt-only canonical event and pacing-stop guards instead of
  duplicating them.
- Folded in the loop-server wrapper change that frees the configured port before
  launch, and bumped the hosted loop label from `v0.09` to `v0.10`.

## Deliberately Left Alone

- Large runtime files such as `vendor/python/ai_service.py`, `bridge_fake.py`,
  and `lib/observability/dashboard-metrics.mjs`: they are real seams, not cleanup
  targets for this slice.
- Historical session traces and `.qa-runs` evidence: they are replay proof, not
  code ceremony.
- The SEDA router shape: no generic router framework, no handler-driven routing,
  and no taxonomy/dashboard ownership changes.
- SEDA runtime behavior: this run did not change handlers, `nextPhase(events)`,
  event builders, bridge prompts, or graph-truth derivation.

## Validation Evidence

| Command | Result |
| --- | --- |
| `./scripts/check-canon-drift.sh` | pass; vendored canon matches checksums |
| `find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print \| sort \| xargs node --test` | pass; 191 tests |
| `.venv/bin/pytest tests -q` | pass; 119 tests, 1 upstream deprecation warning |
| `./socratink-harness replay` | pass; 8 promoted cases |
| `./socratink-harness routing-proof` | pass; 8 promoted cases |
| dynamic-port server-backed `tests/js/loop-chat-ui.test.mjs` via `./socratink-loop-server` | pass; `/health` reported `v0.10` and fake LLM mode; 19 tests |
| `git diff --check` | pass |

## Residual Risks

- The repo still has many historical implementation reports. They are useful
  provenance, but future agents should start with `AGENTS.md`, `HARNESS.md`,
  `HARNESS-TRACEABILITY.md`, and the new spine check rather than reading all
  history first.
- `tests/js/loop-chat-ui.test.mjs` remains large and server-backed. That is
  acceptable because hosted proof is intentionally separate from the fast spine
  check.
- The wording guard is intentionally focused. It blocks the known repair/evidence
  regression without turning all docs into brittle prose snapshots.
