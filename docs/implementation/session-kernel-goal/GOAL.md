# Goal

Status: historical implementation goal. The shared session kernel now exists in
`lib/seda/session-kernel.mjs`; use current runtime files and
`tests/js/session-kernel.test.mjs` for present truth.

Extract one shared SEDA session-kernel constructor used by both the terminal TUI (`app.mjs`) and hosted loop (`lib/loop-server/runtime.mjs`) so both surfaces assemble the same canonical runtime state from one owner while preserving their adapter-specific prompt, transcript, pacing, and persistence behavior.

The kernel should own only behavior-neutral construction: `events[]`, `derived`, `llmCalls`, `evidenceHolds`, training store, bridge client wiring, `HANDLERS`, agent contracts/lookup, and the full default `ctx` shape. Terminal and hosted adapters should supply surface concerns such as prompt implementation, color/section renderer, log directory, HTTP session id/status/transcript/awaiting state, and hosted pacing options.

# Why This Goal

Session/runtime construction is duplicated in two places that now matter equally: `app.mjs` remains the terminal product lab, while `lib/loop-server/runtime.mjs` creates the hosted `/loop` runtime used by the app proxy. Both construct the same state machine ingredients independently, so every new `ctx` field or accumulator can drift silently across surfaces.

The current seam is already weak:

- `app.mjs` creates `events`, `derived`, `llmCalls`, `evidenceHolds`, memory storage, store, bridge, handlers, agent lookup, and a large `ctx` object before calling `runSedaLoop`.
- `lib/loop-server/runtime.mjs` recreates memory storage, store, bridge, handlers, agent lookup, default options, and nearly the same `ctx` object before `advanceSession`.
- `ctx.composerCta` is written by multiple handlers and read by hosted awaiting enrichment, but it is missing from `lib/seda/ctx.d.ts`.
- Hosted runtime has both top-level `evidenceHolds: []` and `ctx.evidenceHolds: []`; completion uses `ctx.evidenceHolds`, so the top-level field is dead or misleading.
- `ctx.postBridgeTransfer` is explicitly HTTP-only continuation state and not reconstructable after process restart, so it needs a clear adapter/kernel boundary instead of being another implicit field in hand-built ctx objects.

This is the smallest high-leverage architecture goal because it fixes the construction drift root without changing routing, handlers, event schemas, graph truth, or hosted pacing.

# In Scope

- Add a shared session-kernel module, likely under `lib/seda/session-kernel.mjs` or `lib/seda/runtime-kernel.mjs`.
- Move duplicated neutral helpers into that module or import them from it:
  - memory storage creation
  - agent lookup creation
  - canonical `ctx` default construction
  - arrays/accumulators: `events`, `derived`, `llmCalls`, `evidenceHolds`
  - store creation from `createTrainingStore`
  - bridge dependency injection shape: `{ callBridge, callBridgeResult }`
  - `HANDLERS` wiring
- Make `app.mjs` build its terminal runtime from the shared kernel, then add prompt/log writing around it.
- Make `lib/loop-server/runtime.mjs` build hosted session state by wrapping the shared kernel with HTTP-only fields: `id`, `phase`, `status`, `pendingInput`, `transcript`, `awaiting`, hosted options.
- Update `lib/seda/ctx.d.ts` so it matches live runtime fields, especially `composerCta`, nullable hosted `logDir`, and adapter-only continuation fields.
- Add focused tests that prove terminal and hosted runtime construction use the same canonical defaults and that `ctx.evidenceHolds` is the single accumulator passed to `buildSessionRecord`.
- Preserve `buildSessionRecord` as the broadcast boundary; do not make routing or dashboard code read hosted session wrapper state.

# Out Of Scope

- Rewriting `advanceSession`.
- Replacing hosted one-beat pacing with `runSedaLoop`.
- Persisting or replaying hosted sessions mid-repair.
- Changing event names, event order, graph-neutral flags, or evidence derivation.
- Moving `nextPhase(events)` or letting handlers choose phases directly.
- Changing prompt templates, bridge actions, or graph-truth canon.
- Redesigning dashboard metrics or loop UI copy.

# Success Criteria

- There is exactly one canonical constructor for default SEDA kernel state.
- `app.mjs` and `lib/loop-server/runtime.mjs` no longer hand-build divergent copies of the same `ctx` defaults and accumulators.
- Hosted-only state remains visibly adapter-owned and not part of graph truth.
- `ctx.composerCta`, `ctx.postBridgeTransfer`, `ctx.repairState`, and `ctx.evidenceHolds` have explicit ownership and reader/writer documentation in `lib/seda/ctx.d.ts`.
- `ctx.evidenceHolds` is the single evidence-hold accumulator used for session broadcast; there is no misleading separate hosted top-level evidence-hold array unless it aliases the same object.
- Existing terminal and hosted behavior stays unchanged across the fake-LLM smoke paths.

# Evidence Path

Baseline:

```bash
node --test tests/js/architecture-fitness.test.mjs
.venv/bin/pytest tests/test_workspace_smoke.py -q
```

Implementation proof:

```bash
node --test tests/js/architecture-fitness.test.mjs
node --test tests/js/session-kernel.test.mjs
find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test
.venv/bin/pytest tests/test_workspace_smoke.py -q
./socratink-harness replay
```

Hosted proof when touching `lib/loop-server/runtime.mjs` or `advanceSession` wiring:

```bash
SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env \
SOCRATINK_TUI_FAKE_LLM=1 \
SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
  node --no-warnings loop-server.mjs

SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 node --test tests/js/loop-chat-ui.test.mjs
```

The new `session-kernel` test should prove:

- terminal and hosted callers receive the same canonical `ctx` default keys
- `kernel.events` and `kernel.ctx.events` are the same append-only array when prompt/meta helpers need it
- `kernel.evidenceHolds` and `kernel.ctx.evidenceHolds` are the same array
- adapter-specific wrapper fields are absent from the kernel and present only in hosted session state
- `HANDLERS` and `nextPhase` authority are not replaced or duplicated

# Risks

- Extracting too much would blur the adapter boundary and accidentally pull HTTP transcript/pacing into the SEDA kernel.
- Extracting too little would leave the real drift source in place and only move helper functions around.
- `ctx.composerCta` is UI-facing and currently implicit; documenting it as `ctx` state is honest, but it should remain graph-neutral and never become routing/evidence input.
- `ctx.postBridgeTransfer` is already a resumability gap for hosted prompt splitting; the goal should label it clearly, not solve persistence in this slice.
- Tests that hand-build partial `ctx` objects may need small fixture updates; keep those changes local and avoid broad test rewrites.

# Recommended First Slice

Add `lib/seda/session-kernel.mjs` with pure construction helpers and a dedicated `tests/js/session-kernel.test.mjs` before rewiring surfaces. The first test should fail on today’s drift by asserting that `composerCta` is part of the documented ctx contract and that `evidenceHolds` is a single shared accumulator. Then wire `lib/loop-server/runtime.mjs` to the kernel first, because hosted runtime currently has the clearest duplicate/default mismatch; wire `app.mjs` second and rerun terminal smoke.
