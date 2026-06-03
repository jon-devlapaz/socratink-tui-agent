# PR2 Hosted Loop Pacing Report

## Stop Table Design

PR2 adds `lib/loop-server/pacing-stops.mjs`, a pure hosted-loop stop table. The
loop server enables it with `session.options.loopUiPacing = "one_beat"`; legacy
`loopUi: true` sessions also opt in unless `loopUiPacing` is explicitly set to a
different value.

Stops run only after a handler finishes and `nextPhase(events)` has computed the
next phase. They do not append events, mutate past events, or change handler /
router semantics.

| Last event | Next phase | Awaiting key |
|---|---|---|
| `route_generated` | `cold_attempt` | `cold_attempt` |
| `cold_attempt` | `delta` | `continue` |
| `cold_support_exhausted` | `delta` | `continue` |
| `gap_identified` | `repair_dialogue` | `repair` |
| `repair` | `model_bridge` | `continue` |
| `model_bridge` | `post_bridge_transfer` | `run_gap_drill` |

No stops were added for `substrate_seed_offered`, `cold_help_turn`,
`strong_cold_path`, or spacing-only transitions.

## Files Changed

- `lib/loop-server/pacing-stops.mjs` adds the pure pacing table.
- `lib/loop-server/session.mjs` returns early on hosted pacing boundaries after
  handler writes and `nextPhase`.
- `lib/loop-server/runtime.mjs` sets `loopUiPacing: "one_beat"` for hosted
  sessions.
- `lib/loop-server/version.mjs`, `public/loop/index.html`, and
  `public/loop/loop.js` bump loop chrome from `v0.02` to `v0.03`.
- `lib/loop-server/awaiting-cta.mjs` and `public/loop/loop.js` make
  `awaiting.key = "continue"` a transport-only browser turn: Return/click sends
  an empty payload, no learner text is appended, and stale repair CTA copy is
  not shown. Failed requests restore the previous awaiting state so retrying
  Return still sends the transport-only `{}` turn.
- `scripts/loop-persona-live.mjs` and
  `scripts/run-substrate-persona-matrix.mjs` treat `continue` as transport-only
  during live QA runs and script `run_gap_drill` as an explicit `y` decision
  instead of letting persona prose drive a yes/no prompt.
- `tests/js/loop-pacing-stops.test.mjs` adds pure stop-table coverage.
- `tests/js/loop-chat-ui.test.mjs` adds hosted pacing regressions and updates the
  shallow completion flow for explicit no-text continue turns.
- `tests/js/awaiting-cta.test.mjs` and
  `tests/js/persona-runner-scripts.test.mjs` cover `continue` CTA isolation and
  persona-runner transport handling.

## Verification Output

```text
$ ./scripts/check-canon-drift.sh
lib/canon/training-store.js: OK
lib/canon/training-derive.js: OK
vendor/python/ai_service.py: OK
[check-canon-drift] OK: vendored canon matches committed checksums.
```

```text
$ find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test
1..105
# tests 105
# suites 0
# pass 105
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 111.460834
```

```text
$ .venv/bin/pytest tests -q
119 passed, 1 warning in 35.24s
```

```text
$ ./socratink-harness replay
Socratink Harness
8 cases

PASS evidence-hold-solid-spaced-primed-2026-05-26
PASS repair-abandoned-no-model-bridge-2026-05-26
PASS strong-cold-skips-repair-until-spacing-2026-05-26
PASS inner-repair-dialogue-gates-model-bridge-2026-05-26
PASS cold-help-turn-routing-2026-05-28
PASS recovery-close-idle-return-2026-05-28
PASS recovery-success-routes-to-repair-2026-05-28
PASS correlation-edge-substantive-cold-2026-05-28
```

```text
$ SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env \
  SOCRATINK_TUI_FAKE_LLM=1 \
  SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
  node --no-warnings loop-server.mjs
Error: listen EADDRINUSE: address already in use :::8787
```

`8787` was already bound, so the server-backed verification used throwaway port
`8798`.

```text
$ SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env \
  SOCRATINK_TUI_FAKE_LLM=1 \
  SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
  PORT=8798 node --no-warnings loop-server.mjs
[loop-server] listening on http://127.0.0.1:8798/loop
[loop-server] llm_mode=FAKE (templates, no Gemini) gemini=MISSING model=gemini-2.5-flash
```

```text
$ SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8798 node --test tests/js/loop-chat-ui.test.mjs
1..17
# tests 17
# suites 0
# pass 17
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 10242.769833
```

```text
$ PORT=8799 ./socratink-loop-server
[loop-server] listening on http://127.0.0.1:8799/loop
[loop-server] llm_mode=live gemini=configured model=gemini-2.5-flash
```

```text
$ SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8799 \
  node scripts/run-substrate-persona-matrix.mjs --base-url http://127.0.0.1:8799 --max-turns 24 --profile novice
[matrix] novice: events=16 friction=0 case_complete=true
```

```text
$ SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8799 \
  node scripts/run-substrate-persona-matrix.mjs --base-url http://127.0.0.1:8799 --max-turns 24 --profile middle_schooler
[matrix] middle_schooler: events=8 friction=0 case_complete=true
```

```text
$ SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8799 \
  node scripts/run-substrate-persona-matrix.mjs --base-url http://127.0.0.1:8799 --max-turns 24 --profile expert
[matrix] expert: events=8 friction=0 case_complete=true
```

## Resolved Questions

- Browser continue is a transport-only affordance: no synthetic learner event is
  appended, and the API still represents no-input beats with
  `awaiting.key = "continue"`.
- `cold_support_exhausted` stops before zero-schema Delta; ordinary
  `cold_help_turn` remains prompt-bound and does not add a pacing stop.
- Substrate gate behavior remains PR1-owned and unchanged.
