# Session Kernel Goal Progress

## Implementation Checkpoint — 2026-06-05 20:26 CDT

### Baseline Re-run

```bash
rtk node --test tests/js/architecture-fitness.test.mjs
```

Result: 4 passed.

```bash
rtk .venv/bin/pytest tests/test_workspace_smoke.py -q
```

Result: 10 passed in 38.12s.

### Red Test

Added `tests/js/session-kernel.test.mjs` before production edits.

```bash
rtk node --test tests/js/session-kernel.test.mjs
```

Initial result: failed with `ERR_MODULE_NOT_FOUND` for
`lib/seda/session-kernel.mjs`, proving the missing shared constructor boundary.

After adding the kernel but before hosted rewire, the same test narrowed to the
hosted wrapper mismatch (`awaiting` missing / hosted state not kernel-wrapped).

### Implementation Slices

- Added `lib/seda/session-kernel.mjs` as the shared constructor for canonical
  arrays, memory-backed training store, bridge shape, `HANDLERS`, agent
  contracts/lookup wiring, and full default `ctx` shape.
- Rewired `lib/loop-server/runtime.mjs` first so hosted state wraps the kernel
  with `id`, `phase`, `status`, `pendingInput`, `transcript`, `awaiting`,
  `record`, and hosted options.
- Aliased hosted `session.evidenceHolds` to `session.ctx.evidenceHolds`; the ctx
  array remains the single session-record accumulator.
- Rewired `app.mjs` second so terminal runtime uses the same kernel while
  retaining terminal prompt, color sections, scripted fixture loading, log dir,
  and final `session.json` write as adapter concerns.
- Updated `lib/seda/ctx.d.ts` for `composerCta`, required `events`, nullable
  adapter-owned `logDir`, `postBridgeTransfer`, `repairState`, and
  `evidenceHolds` ownership.
- Bumped loop release label from `v0.05` to `v0.06` in
  `lib/loop-server/version.mjs`, `public/loop/index.html`, and
  `public/loop/loop.js`.

### Slice Verification

```bash
rtk node --test tests/js/session-kernel.test.mjs
```

Result: 3 passed.

```bash
rtk node --test tests/js/architecture-fitness.test.mjs
```

Result: 4 passed.

A focused grep for production duplicate default construction returned no
matches:

```bash
rtk rg -n "evidenceHolds: \[\]|const ctx = \{|ctx: \{" app.mjs lib/loop-server/runtime.mjs lib/seda/session-kernel.mjs
```

Result: no matches.

### Final Verification

```bash
rtk node --test tests/js/session-kernel.test.mjs
```

Result: 3 passed.

```bash
rtk node --test tests/js/architecture-fitness.test.mjs
```

Result: 4 passed.

The exact requested command:

```bash
rtk find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test
```

was rejected by the local RTK wrapper:

```text
rtk: rtk find does not support compound predicates or actions (e.g. -not, -exec). Use `find` directly.
```

Equivalent RTK-prefixed command used:

```bash
rtk proxy sh -c "find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test"
```

Result: 150 passed.

```bash
rtk .venv/bin/pytest tests/test_workspace_smoke.py -q
```

Result: 10 passed in 35.49s.

```bash
rtk ./socratink-harness replay
```

Result: 8 cases passed.

Hosted server-backed verification:

```bash
SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env \
SOCRATINK_TUI_FAKE_LLM=1 \
SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
  rtk node --no-warnings loop-server.mjs
```

Server started on `http://127.0.0.1:8787/loop` with fake LLM.

```bash
SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 rtk node --test tests/js/loop-chat-ui.test.mjs
```

Result: 19 passed.

The loop server process was stopped after verification; `rtk lsof -ti tcp:8787`
returned no listener.

### Stop-Condition Check

- Both production surfaces use `createSessionKernel`.
- Append-only `events[]` and `nextPhase(events)` routing authority were not
  changed.
- `advanceSession` and hosted one-beat pacing were not rewritten.
- Prompt templates, bridge actions, event schemas, dashboard metrics, and
  graph-truth canon were not changed.
- `buildSessionRecord` remains the broadcast boundary.
- Hosted HTTP/session wrapper state remains adapter-owned.

## Baseline Planning Pass

Current branch is clean before artifact creation. Recent history shows active hosted-loop and graph-truth work, including hosted one-beat pacing, substrate-gate routing, and dashboard metric contracts.

Baseline verification run during this planning pass:

```bash
node --test tests/js/architecture-fitness.test.mjs
```

Result: 4 passed.

```bash
.venv/bin/pytest tests/test_workspace_smoke.py -q
```

Result: 10 passed in 33.49s.

`package.json` is absent, so validation should continue to use direct `node --test`, pytest, and harness commands rather than invented npm scripts.

## Files Inspected

- `AGENTS.md`
- `HARNESS.md`
- `HARNESS-TRACEABILITY.md`
- `CONTEXT.md`
- `app.mjs`
- `lib/loop-server/runtime.mjs`
- `lib/loop-server/session.mjs`
- `lib/loop-server/http-server.mjs`
- `lib/seda/run-loop.mjs`
- `lib/seda/next-phase.mjs`
- `lib/seda/ctx.d.ts`
- `lib/seda/session-record.mjs`
- `lib/seda/handlers/index.mjs`
- `lib/seda/handlers/idle.mjs`
- `lib/seda/handlers/cold-attempt.mjs`
- `lib/seda/handlers/delta.mjs`
- `lib/seda/handlers/repair-dialogue.mjs`
- `lib/seda/handlers/post-bridge-transfer.mjs`
- `lib/seda/handlers/spaced-redrill.mjs`
- `lib/loop-server/awaiting-cta.mjs`
- `tests/js/architecture-fitness.test.mjs`
- `tests/js/loop-chat-ui.test.mjs`
- `tests/js/awaiting-cta.test.mjs`
- `tests/js/substrate-gate.test.mjs`
- `tests/test_workspace_smoke.py`

## Findings

## 1. Where session/runtime construction is duplicated

`app.mjs` constructs terminal runtime state directly:

- resolves and preflights paths
- creates bridge client
- initializes training derivation and imports `createTrainingStore`
- loads agent contracts and builds `agentLookup`
- creates memory storage and training store
- creates `events`, `derived`, `llmCalls`, `evidenceHolds`
- hand-builds `ctx`
- passes `HANDLERS`, state, store, bridge, prompt, options, and ctx to `runSedaLoop`
- builds the final `session.json` via `buildSessionRecord`

`lib/loop-server/runtime.mjs` duplicates much of that construction:

- resolves and preflights paths
- creates bridge client
- initializes training derivation and imports `createTrainingStore`
- loads agent contracts and builds `agentLookup`
- creates memory storage and training store
- creates hosted session wrapper fields
- hand-builds a nearly matching `ctx`
- attaches `HANDLERS`, bridge, store, and hosted options for `advanceSession`

The duplication is not theoretical. The two files independently own the same defaults, and the hosted copy already has divergence around `evidenceHolds`.

## 2. What exact state is assembled in both surfaces

Shared state assembled by both surfaces:

- `events: []`
- `derived: []`
- `llmCalls: []`
- `evidenceHolds: []`
- memory-backed storage
- `store = createTrainingStore({ storage })`
- `bridge = { callBridge, callBridgeResult }`
- `handlers: HANDLERS`
- `agentContracts`
- `agentLookup`
- `ctx.concept`
- `ctx.conceptId`
- `ctx.learnerGoal`
- `ctx.launchAttempt`
- `ctx.firstNode`
- `ctx.nodeIds`
- `ctx.route`
- `ctx.coldEval`
- `ctx.coldAttemptText`
- `ctx.zeroSchemaCold`
- `ctx.isMisconception`
- `ctx.repairScaffold`
- `ctx.postBridgeTransfer`
- `ctx.gapId`
- `ctx.repairState`
- `ctx.evidenceHolds`
- `ctx.scripted`
- `ctx.section`
- `ctx.colorEnabled`
- `ctx.logDir`

Terminal-specific state:

- CLI args and scripted fixture loading
- readline prompt or scripted prompt
- terminal color section renderer
- local session log directory
- final `session.json` write
- terminal feedback/help handling inside prompt loop

Hosted-specific state:

- `id`
- `phase`
- `status`
- `pendingInput`
- `transcript`
- `awaiting`
- `record`
- HTTP prompt creation
- console capture
- session map storage
- one-beat hosted pacing
- `sessionResponse` and `enrichAwaiting`
- API auth and static asset serving

## 3. Which parts are canonical vs adapter-specific

Canonical:

- append-only `events[]`
- `derived[]` as audit snapshots
- training store and derivation inputs
- `llmCalls[]`
- bridge dependency shape
- handler registry
- `nextPhase(events)` routing authority
- full `ctx` schema/defaults used by handlers
- `buildSessionRecord` broadcast shape
- agent contracts and lookup

Adapter-specific:

- terminal readline/scripted prompt implementation
- hosted HTTP prompt implementation
- terminal color formatting
- hosted transcript capture
- hosted session id/status/phase/awaiting wrapper
- hosted one-beat pacing stops
- terminal log directory and file write
- HTTP server auth/static/dashboard endpoints
- CTA enrichment for browser composer display

Borderline but should be explicit:

- `ctx.section` is a canonical dependency slot, but the renderer implementation is adapter-specific.
- `ctx.composerCta` is a handler-to-hosted-CTA bridge. It is graph-neutral UI state, not routing state, but it must be documented because hosted behavior depends on it.
- `ctx.postBridgeTransfer` exists because hosted prompt splitting can invoke the same handler across HTTP turns. It is adapter-sensitive continuation state and not reconstructable after process restart.

## 4. Hidden `ctx` contracts carrying cross-surface behavior

`ctx.repairState` is correctly documented as loop-critical and snapshotted onto graph-neutral repair events.

The weaker hidden contracts are:

- `ctx.composerCta`: written in substrate gate, route, cold help, delta, repair dialogue, and cleared in post-bridge transfer; read by `lib/loop-server/awaiting-cta.mjs`; absent from `lib/seda/ctx.d.ts`.
- `ctx.postBridgeTransfer`: documented in `ctx.d.ts` as HTTP-only continuation state, but it lives in the same generic ctx object as canonical loop state.
- `ctx.evidenceHolds`: terminal uses the same array for local variable and ctx; hosted creates a separate top-level `session.evidenceHolds` plus `ctx.evidenceHolds`, then records only `ctx.evidenceHolds`.
- `ctx.events`: optional in `ctx.d.ts`, used by terminal prompt command helpers, and should be explicit if prompt/meta behavior relies on it.
- `ctx.logDir`: typed as `string`, but hosted runtime sets it to `null`.

These are not current user-facing failures, but they are maintenance traps because new handlers/tests can copy the wrong construction pattern.

## 5. Smallest extraction or boundary clarification that improves maintainability

The smallest useful extraction is a shared SEDA session-kernel constructor. It should return the canonical runtime bundle and leave only adapter wrappers outside it.

Suggested shape:

```js
const kernel = createSessionKernel({
  createTrainingStore,
  bridge,
  agentLookup,
  agentContracts,
  section,
  colorEnabled,
  scripted,
  logDir,
});
```

Returned canonical fields:

- `events`
- `derived`
- `llmCalls`
- `evidenceHolds`
- `store`
- `bridge`
- `handlers`
- `ctx`

Hosted can then wrap this:

```js
return {
  id,
  phase: "idle",
  status: "active",
  pendingInput: null,
  transcript: [],
  awaiting: null,
  ...kernel,
  options: hostedOptions,
};
```

Terminal can pass the same kernel to `runSedaLoop` and then to `buildSessionRecord`.

This beats a controller rewrite because it attacks the drift source while preserving `runSedaLoop`, `advanceSession`, hosted pacing, append-only events, and `nextPhase(events)`.

## 6. Proof required to call the goal complete

Proof must show behavior preservation and drift reduction:

- New kernel unit tests prove canonical defaults and single accumulator identity.
- Architecture fitness remains green.
- Self-contained JS suite remains green.
- Terminal workspace smoke remains green.
- Harness replay remains green.
- Hosted loop UI tests remain green when runtime wiring changes.
- A focused grep confirms only the shared kernel builds full default `ctx`; tests may create partial fixtures, but production surfaces should not duplicate the canonical construction block.

## Candidate Goals Considered

| Rank | Candidate | Goal fit | Verification quality | Value | Boundedness | Risk | Confidence | Rationale |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | Extract shared SEDA session-kernel constructor for terminal and hosted runtime | 5 | 5 | 4 | 4 | Medium | High | Directly removes construction drift with behavior-preserving tests and no routing rewrite. |
| 2 | Replace hosted `advanceSession` controller with a pausable variant of `runSedaLoop` | 3 | 3 | 4 | 2 | High | Medium | Could reduce controller duplication, but hosted pacing is product-sensitive and already tested; too broad for the smallest slice. |
| 3 | Move composer CTA state out of `ctx` into explicit awaiting metadata/events | 3 | 3 | 3 | 2 | Medium | Medium | Real seam, but risks changing browser prompt behavior and may tempt event-schema changes for UI-only state. |
| 4 | Make hosted sessions fully replayable/resumable from `events[]` mid-repair | 2 | 2 | 5 | 1 | High | Low | Valuable eventually, but it expands into persistence, reconstruction, and policy-state semantics. |
| 5 | Remove or alias hosted top-level `evidenceHolds` only | 2 | 4 | 2 | 5 | Low | High | Correct cleanup, but too narrow; it treats one symptom and leaves duplicated construction intact. |

## Chosen Goal

Extract a shared SEDA session-kernel constructor and rewire both `app.mjs` and `lib/loop-server/runtime.mjs` to use it, while keeping terminal and hosted adapters responsible only for I/O, pacing, transcript, and persistence.

This goal is small enough to execute safely because it is construction-only. It is meaningful because every new handler field or accumulator currently has to be remembered in two production entrypoints and multiple tests.

# Why The Other Options Lost

`advanceSession` unification lost because it is not the smallest drift reducer. Hosted pacing intentionally differs from terminal blocking prompts; replacing the controller would cross product behavior and verification surfaces.

Moving CTA state into events lost because composer prompts are UI state, not graph truth. Encoding them as facts would violate the repo’s pressure to keep events authoritative but not polluted by adapter display state.

Full hosted resumability lost because it is a different architectural problem. `ctx.postBridgeTransfer` and `repairState` reconstruction are worth tracking, but persistence semantics are outside a low-risk maintainability goal.

Evidence-hold cleanup lost because it is a good first failing assertion, not the whole goal. Fixing the extra top-level hosted array without extracting the constructor would leave the next drift bug in place.

# Verification Notes

Verified during planning:

- `node --test tests/js/architecture-fitness.test.mjs` passed.
- `.venv/bin/pytest tests/test_workspace_smoke.py -q` passed.

Recommended later implementation gates:

- `node --test tests/js/session-kernel.test.mjs`
- `node --test tests/js/architecture-fitness.test.mjs`
- `find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test`
- `.venv/bin/pytest tests/test_workspace_smoke.py -q`
- `./socratink-harness replay`
- server-backed `tests/js/loop-chat-ui.test.mjs` when hosted runtime wiring changes

# Open Questions

- Should the shared kernel live under `lib/seda/` as substrate construction, or under `lib/runtime/` to avoid implying SEDA owns bridge/path bootstrapping?
- Should `loadAgentLookup` remain hosted-named runtime code, or move beside the kernel as neutral contract loading?
- Should `ctx.composerCta` remain in `ctx` as graph-neutral adapter UI state, or should a later slice introduce a separate `uiState` bag passed alongside `ctx`?
- Should hosted `ctx.logDir` be nullable in the type contract, or should the kernel omit it and let terminal attach it only when writing `session.json`?
