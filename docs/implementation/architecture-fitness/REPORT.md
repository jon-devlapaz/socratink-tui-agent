# Architecture Fitness Checks

## Goal

Codify the architecture evaluation strategy as executable repo-local checks for
the Socratink TUI Agent SEDA harness.

## Success Criteria

- `nextPhase(events)` remains a pure router with no imports or I/O.
- SEDA modules do not add unreviewed outward dependency edges.
- `HANDLERS` covers every phase target in `DIRECT_PHASE`.
- Runtime source does not mutate `events[]` except by append.
- Existing graph-honesty, hosted-loop pacing, replay, and routing-proof gates
  remain green.

## Checkpoint Log

### Baseline

- `git status --short --branch`
  - Result: clean worktree on `main...origin/main` before edits.
- Recent validation evidence from the architecture evaluation pass:
  - `./scripts/check-canon-drift.sh`: pass.
  - `.venv/bin/python -m pytest tests -q`: 119 passed, 1 upstream
    `google-genai` deprecation warning.
  - Self-contained JS tests: 105 passed before this slice.
  - Server-backed `tests/js/loop-chat-ui.test.mjs`: 17 passed on throwaway
    port 8797.
  - `./socratink-harness replay`: 8 cases passed.
  - `./socratink-harness routing-proof`: 8 cases passed.

### Checkpoint 1: self-contained architecture fitness test

- Added `tests/js/architecture-fitness.test.mjs`.
- The test checks:
  - `lib/seda/next-phase.mjs` has no imports or `require()`.
  - `lib/seda/**/*.mjs` has no unreviewed outward import edges.
  - `lib/seda/handlers/index.mjs` registry keys match the exported
    `HANDLERS` object and cover all `DIRECT_PHASE` targets.
  - Runtime files under `app.mjs`, `lib/seda/`, `lib/loop-server/`, and
    `harness/` do not call mutating array methods on `events` or
    `session.events` other than append.
- Reviewed current SEDA outward edges:
  - `lib/seda/handlers/route.mjs -> lib/ui/map-legend.mjs`
  - `lib/seda/provisional-map.mjs -> lib/ui/map-legend.mjs`
  - `lib/seda/route-generation.mjs -> lib/bridge/client.mjs`
  - `lib/seda/handlers/idle.mjs -> lib/loop-server/prompt-help.mjs`
  - `lib/seda/handlers/idle.mjs -> lib/feedback/handle.mjs`
  - `lib/seda/handlers/repair-dialogue.mjs -> repair_policy.mjs`
- Narrow validation:
  - `node --test tests/js/architecture-fitness.test.mjs`: 4 passed.

### Checkpoint 2: broad validation

- `find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test`
  - Result: 109 passed.
- `./scripts/check-canon-drift.sh`
  - Result: pass; vendored canon matches committed checksums.
- `.venv/bin/python -m pytest tests -q`
  - Result: 119 passed, 1 upstream `google-genai` deprecation warning.
- `./socratink-harness replay`
  - Result: 8 cases passed.
- `./socratink-harness routing-proof`
  - Result: 8 cases passed.
- Server-backed hosted-loop UI partition:
  - Server command:
    `PORT=8797 SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow node --no-warnings loop-server.mjs`
  - Test command:
    `SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8797 node --test tests/js/loop-chat-ui.test.mjs`
  - Result: 17 passed.

## Notes

This slice intentionally does not refactor existing reviewed boundary edges.
The fitness check makes those edges visible and prevents new SEDA outward
dependencies from appearing without review.
