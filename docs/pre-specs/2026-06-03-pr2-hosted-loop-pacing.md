# Pre-Spec: PR2 — Hosted loop pacing (`advanceSession`)

Status: approved next track (post PR1 substrate gate)  
Date: 2026-06-03  
Depends on: [ADR-0001](../adr/0001-substrate-gate-before-route.md) (substrate gate merged)  
Surfaces: `lib/loop-server/session.mjs`, `/loop`, `/api/session/*`, `tests/js/loop-chat-ui.test.mjs`

## Problem

On the **hosted loop**, one HTTP `POST /api/session/:id/turn` can run many SEDA phases
before returning. `advanceSession` loops handlers until `PROMPT_REQUIRED` or idle exit:

```33:74:lib/loop-server/session.mjs
  try {
    let phase = session.phase ?? "idle";
    while (phase) {
      // … dispatch handler …
      phase = nextPhase(session.events);
    }
```

PR1 fixed **substrate gate** pacing (seed + refinement are separate turns). Post-map
beats still batch in one response, which dogfood reported as whiplash:

| Observed batch (one HTTP turn) | Learner experience |
|-------------------------------|-------------------|
| `cold_attempt` → eval → `gap_identified` → **Delta** (scaffold + drill) → **repair_dialogue** prompt | Cold feedback, repair framing, and repair question land at once |
| `repair_dialogue_turn` → bridge ready → **model_bridge** | Judge line + bridge wall of text in one scroll |
| Strong cold path may skip repair but still batch spacing + spaced eval copy | Less severe; lower priority |

Terminal TUI uses `runSedaLoop` with a blocking prompt between phases — **one learner
beat per prompt**. Hosted `/loop` should match that rhythm for learner-visible phases.

## Goal

After PR2, each HTTP turn advances the session **at most one learner-visible beat**
(or stops at the next composer prompt), aligned with ADR-0001:

> Stop after **route** and after **cold** before **delta**. Do not combine with PR1.

General rule: **hosted pacing ≈ terminal pacing** for prompts, without changing
`nextPhase`, evidence rules, or graph derivation.

## Non-goals

- Substrate gate behavior (PR1 — done)
- Changing SEDA routing or event semantics
- Hiding LLM latency receipts in chrome (nice-to-have; separate follow-up)
- Multi-concept session UX (`caseComplete` contract unchanged)
- Terminal TUI or scripted harness behavior (unless shared helper is extracted)

## Required stop boundaries

Minimum stops (must pass verification):

| After event / phase | Stop before | Composer `awaiting.key` (typical) |
|--------------------|-------------|-------------------------------------|
| `route_generated` | `cold_attempt` handler consuming learner text | `cold_attempt` |
| `cold_attempt` (scored) | `gap_identified` / `delta` | n/a — return after cold eval + evidence line |
| `gap_identified` / delta scaffold emitted | `repair_dialogue` first `prompt.ask("repair")` | `repair` |
| `repair` (bridge ready) | `model_bridge` render | `run_gap_drill` or next repair turn |
| `model_bridge` | `post_bridge_transfer` gap prompt | `gap_attempt` or `run_gap_drill` |

Strong cold path (`strong_cold_path` → spacing) may still batch **system** transitions
that have no composer prompt; do not add artificial pauses there.

Substrate gate stops remain as implemented in PR1 (`substrate_refinement`).

## Proposed approach

**Option A (recommended): phase budget in `advanceSession`**

Add a hosted-only option, e.g. `options.loopUiPacing: "one_beat"` (default on loop
server). After each handler completes, if the new last event crosses a stop boundary,
throw `PROMPT_REQUIRED` or return early **even when** `nextPhase` would continue.

Stop table lives next to `session.mjs` (or `lib/loop-server/pacing-stops.mjs`) — pure
function: `(lastEventType, phase, events) → shouldStop`.

**Option B: handlers yield on `options.loopUi`**

Split `handleDelta` / cold tail so loop UI throws `PROMPT_REQUIRED` after cold eval
and after delta scaffold (mirror `substrate-gate.mjs` slow path). More scattered;
harder to audit all boundaries.

**Option C: cap `while` iterations to 1 when `loopUi`**

Blunt — breaks substrate multi-handler turns and internal non-prompt phases. **Reject.**

Implement **Option A** unless review finds a handler that must run two non-prompt steps
in one turn.

## Success criteria

1. **Cold → delta split:** One POST with cold text returns through cold eval +
   evidence line only; next POST shows Delta section (scaffold + drill CTA), not repair
   dialogue input yet.
2. **Delta → repair split:** Delta transcript appears without requiring repair text in
   the same response; repair `awaiting.key=repair` on the following turn.
3. **Repair → bridge split:** `bridge_ready` transcript without model bridge body in
   the same response (gap drill prompt or transfer check on next turn).
4. **Route → cold split:** Hypothesis map turn ends at `awaiting.key=cold_attempt`
   (regression guard — may already hold after PR1).
5. **Terminal / harness unchanged:** `./socratink-tui --scripted`, `./socratink-harness replay`.
6. **Version bump:** increment `LOOP_APP_VERSION_DEFAULT` per every-PR rule.

## Verification

```bash
# Unit / routing (unchanged)
./scripts/check-canon-drift.sh
find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test
.venv/bin/pytest tests -q
./socratink-harness replay

# New / updated server-backed tests
SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env \
SOCRATINK_TUI_FAKE_LLM=1 \
SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
  node --no-warnings loop-server.mjs &
sleep 2
SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 node --test tests/js/loop-chat-ui.test.mjs
```

Add focused tests (names indicative):

- `loop cold eval returns before delta on separate turn`
- `loop delta scaffold returns before repair ask on separate turn`
- `loop repair ready returns before model_bridge on separate turn`

Optional dogfood: re-run `scripts/run-substrate-persona-matrix.mjs` (live) and confirm
post-map turns feel paced (qualitative).

## Files (expected touch)

| File | Change |
|------|--------|
| `lib/loop-server/session.mjs` | Stop loop after pacing boundaries when `loopUi` |
| `lib/loop-server/pacing-stops.mjs` | New — stop table + tests |
| `tests/js/loop-chat-ui.test.mjs` | Regression tests per success criteria |
| `tests/js/loop-pacing-stops.test.mjs` | Pure stop-table tests |
| `lib/loop-server/version.mjs` | Bump `LOOP_APP_VERSION_DEFAULT` |
| `public/loop/index.html`, `public/loop/loop.js` | Placeholder version sync |
| `AGENTS.md` | Only if a stable repo rule emerges |

## Implementation order

1. Extract stop table + pure tests (no behavior change)
2. Wire stops into `advanceSession` for shallow cold → repair path
3. Extend stops for bridge / transfer if still batching
4. Server-backed tests + Smoke CI
5. Deploy `./scripts/railway-deploy.sh` → dogfood `app.socratink.ai/loop`

## Open questions

- Should **cold help** (`cold_help_turn`, non-substantive) stop after each help line
  (already prompt-bound) — likely OK without change.
- **Post-bridge transfer** `run_gap_drill` yes/no — keep on its own turn (already
  prompt-bound); verify no batch with gap attempt.
- Receipt pill: collapse duplicate `[Route LLM]` / bridge latency lines when multiple
  LLM calls happen across turns — defer unless trivial.

## References

- ADR-0001 implementation order (PR2 line)
- PR1 lane 3 brief: `docs/implementation/pr1-substrate-gate/codex-pr1-lane-3.md` (PR2 out of scope)
- Dogfood: affirm-then-repair whiplash on hosted loop (2026-06 conversation)
- `AGENTS.md` — `advanceSession` batching note
