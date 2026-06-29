# Bug Capture: Live Persona Run Completion And QA Harness Timing

Status: resolved and historical
Date captured: 2026-06-01 local / 2026-06-02 UTC
Date resolved: 2026-06-02
Source signal: local live Gemini persona run against `/loop`
Surface: `loop-server.mjs`, `/api/session`, `/loop`, persona QA scripts

## Summary

Two bugs surfaced during a live persona test:

1. The API persona runner can repeat a concept loop after `spaced_redrill`
   because the session returns to `phase=idle` without a completion signal the
   runner recognizes.
2. The browser customer persona QA harness treats a fast `/help` response as a
   failure because it requires observing transient `aria-busy=true`.

These should be tracked separately. The first is a product/API completion
contract issue unless multi-concept sessions are intentional and the runner
needs a case-complete predicate. The second is a test-harness timing bug.

## Resolution

Bug 1 was fixed with an explicit `caseComplete` API/session response field. The
SEDA route still returns to `phase=idle` after `spaced_redrill`, and `complete`
still means session termination (`/exit`). The persona runner now stops a
single-concept run on `caseComplete` before submitting the original concept
again.

Bug 2 was fixed in the browser QA harness by waiting for transcript growth and
settled `aria-busy=false`, rather than requiring Playwright to observe the
transient `aria-busy=true` state for fast `/help` responses.

Verification performed:

- `SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8792 node --test tests/js/loop-chat-ui.test.mjs`
  passed with the new `caseComplete=true`, `complete=false`, `phase=idle`
  regression after `spaced_redrill`.
- `node scripts/loop-persona-live.mjs --allow-fake --base-url http://127.0.0.1:8792 ...`
  wrote `persona-run.json` and `REPORT.md`, stopped after 5 turns, and ended
  with event tail `spacing_advanced`, `spaced_redrill`.
- A focused Playwright `/help` check passed after the harness wait change.
- Full live Gemini customer QA was not rerun during the fix to avoid extra live
  model calls.

## Environment

- Local server: `./socratink-loop-server`
- Verification endpoint: `GET /health`
- Live status observed:
  - `fake_llm: false`
  - `llm_mode: live`
  - `gemini_configured: true`
  - `llm_model: gemini-2.5-flash`
- Persona runner:
  - `./scripts/loop-persona-live.mjs --concept "AI" --goal "Explain how models can sound confident but still be wrong"`
- Browser QA runner:
  - `SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 ./scripts/loop-customer-qa.sh`

## Bug 1: Persona Runner Re-enters Concept Loop After Spaced Redrill

Priority: P1
Type: API/product contract

### Reproduction

1. Start a live server with Gemini configured.
2. Run Jordan against the local API:

```bash
set -a; . ./.env; set +a
unset SOCRATINK_TUI_FAKE_LLM
./scripts/loop-persona-live.mjs \
  --concept "AI" \
  --goal "Explain how models can sound confident but still be wrong"
```

3. Repeat on an isolated server if the active `8787` process should not be
   disturbed:

```bash
set -a; . ./.env; set +a
unset SOCRATINK_TUI_FAKE_LLM
PORT=8788 ./socratink-loop-server

./scripts/loop-persona-live.mjs \
  --base-url http://127.0.0.1:8788 \
  --concept "AI" \
  --goal "Explain how models can sound confident but still be wrong"
```

### Expected

After the persona completes the single-concept loop through spaced redrill, one
of these contracts should be explicit:

- API contract: the session marks `complete: true` / terminal status, so the
  automated persona run stops and writes `persona-run.json` plus `REPORT.md`.
- Runner contract: if `phase=idle` is intended to mean "ready for another
  concept in the same session", the runner detects case completion from the
  event tail and stops before submitting the original concept again.

### Actual

The session returned to `phase=idle`, but the automated runner continued because
`session.complete` was false. It then submitted the original concept again,
creating another route/cold/spaced cycle.

Observed first run on `127.0.0.1:8787`:

- Reached turn 11 after `post_bridge_transfer`.
- Runner failed with `fetch failed`.
- No `persona-run.json` was written because the runner only writes reports on
  normal completion.

Observed isolated rerun on `127.0.0.1:8788`:

- Cycle 1 reached `spaced_redrill`, then returned to idle.
- Runner submitted `AI` again.
- Cycle 2 reached `spaced_redrill`, produced `Evidence solidified`, then
  returned to idle again.
- Runner submitted `AI` a third time before the run was manually stopped to
  avoid additional live model calls.

### Evidence

Server log excerpt from the isolated rerun:

```text
[Spaced Re-Drill]
You've captured the essence that it's about statistical probability. But how
does the model actually use those probabilities to decide which token comes
next, starting from an input?
[Evidence] primed

[Idle]
Type a concept to explore · /help · /feedback <message> · /exit
```

Later in the same run:

```text
[Spaced Re-Drill]
That's a clear explanation! You've captured the full process, from how AI learns
from vast text to how it predicts the next word, and the consequence that this
doesn't guarantee factual accuracy.
[Evidence] solidified

[Idle]
Type a concept to explore · /help · /feedback <message> · /exit
```

### Risk

This blocks persona QA from producing durable completion reports. It also makes
live model spend unbounded up to `maxTurns` when the product appears done to a
human but not done to the runner.

### Likely Fix Boundary

Do not change graph truth semantics to satisfy the runner. Fix the explicit
session contract:

- Either mark the single-concept loop complete after the intended terminal
  event path, or
- Teach `scripts/loop-persona-live.mjs` to stop on a documented event-tail
  predicate while preserving multi-concept interactive behavior for humans.

Add a server-backed regression test for the chosen contract.

## Bug 2: Browser Persona QA Fails On Fast `/help` Busy-State Transition

Priority: P2
Type: QA harness

### Reproduction

```bash
SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 \
SOCRATINK_LOOP_QA_OUT=.qa-runs/webwright/customer-persona-loop/<timestamp> \
./scripts/loop-customer-qa.sh
```

### Expected

The harness should accept a correct fast `/help` response. It may assert that
the terminal eventually returns to `aria-busy=false`, and that the transcript
contains the expected help copy, without requiring the test process to observe a
short-lived busy state.

### Actual

The harness failed immediately after submitting `/help`:

```text
AssertionError: Locator expected to have attribute 'true'
Actual value: false
locator("#terminal")
unexpected value "false"
```

Only the landing screenshot was written for this run:

```text
.qa-runs/webwright/customer-persona-loop/2026-06-02T02-40-32Z/screenshots/01-landing.png
```

### Risk

This creates false negatives in exploratory browser QA. A fast successful help
response is not a UX failure, but the current assertion treats it as one.

### Likely Fix Boundary

Update `scripts/loop-customer-qa.py` so `send_answer()` waits for response
settlement and transcript/phase evidence rather than requiring observation of
the intermediate busy state. Preserve busy-state assertions in dedicated UI
tests where the UI intentionally exposes long-running model work.

## Verification Targets

For Bug 1:

- Add a server-backed JS/API test that runs a single concept through the
  terminal spaced path and asserts the agreed completion contract.
- Rerun `./scripts/loop-persona-live.mjs` against a live or deterministic fake
  path and confirm it writes `persona-run.json` and `REPORT.md`.

For Bug 2:

- Add or update a focused Playwright/browser harness check for `/help` that
  passes when `/help` completes too quickly to observe `aria-busy=true`.
- Rerun `SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 ./scripts/loop-customer-qa.sh`.

## Non-Goals

- Do not weaken graph honesty rules.
- Do not make `repair_dialogue_turn`, help, route, or scaffold text evidence.
- Do not hide live LLM failures behind fake mode.
- Do not convert `.qa-runs/` evidence into canonical product truth.
