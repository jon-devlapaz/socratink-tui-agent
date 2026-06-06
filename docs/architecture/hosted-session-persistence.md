# Hosted Session Persistence

This note defines the persistence boundary for the hosted loop. The shipped
implementation uses a filesystem-backed event journal plus bounded adapter
metadata; it states what the adapter is allowed to persist and what must remain
derived from the append-only event chain.

## Authority Boundary

`events[]` is the durable hosted authority. The phase router, replay, evidence
derivation, and session-record projection must be able to start from persisted
events and rebuild the kernel state they need. Transcript lines, prompt caches,
`awaiting`, `phase`, and the HTTP session wrapper are adapter/UI state. They are
not routing truth and are not evidence truth.

| Persisted item | Owner | Purpose | Authority |
| --- | --- | --- | --- |
| Session id | Hosted adapter | Locate one journal | Adapter metadata |
| Append-only events | SEDA handlers | Routing, replay, evidence, projections | Durable authority |
| Created/updated timestamps | Hosted adapter | Operational listing and pruning | Adapter metadata |
| Last response summary | Hosted adapter | Optional cache for HTTP ergonomics | Non-authoritative |
| Transcript | Hosted adapter/UI | Render recent output | Non-authoritative |
| Awaiting prompt metadata | Hosted adapter/UI | Render input affordance | Non-authoritative |
| Transcript tail | Hosted adapter/UI | Bounded GET compatibility display cache | Non-authoritative |
| Current phase | Derived by `nextPhase(events)` | Resume routing | Never persisted as authority |
| Training store snapshot | Rebuilt from events where possible | Handler continuity | Derived, not journal authority |

## Event Facts Required For Resume

The hosted journal persists complete event objects in append order. A fresh
runtime must be able to reconstruct these facts from the log:

| Event | Durable facts required | Reconstructed state |
| --- | --- | --- |
| `idle_new_concept` | `concept` | Pre-launch hosted idle-to-ignition continuation |
| `learner_goal_set` | `learner_goal`, graph-neutral score-ineligible flags | Pre-launch hosted learner-goal continuation |
| `launch_attempt` | `concept`, `concept_id`, `learner_goal`, `text` | `ctx.concept`, `ctx.conceptId`, `ctx.learnerGoal`, `ctx.launchAttempt`, sketch/provenance |
| `route_generated` | `first_node`, `node_ids`, `provisional_map`, `map_displayed`, `substrate_adequacy`, `retry_count`, `retry_reasons` | `ctx.firstNode`, `ctx.nodeIds`, `ctx.route`, cold prompt CTA |
| `cold_attempt` | learner text, evaluation, `kc_id`, graph-neutral/score flags where applicable | `ctx.coldEval`, `ctx.coldAttemptText`, zero-schema/misconception flags |
| `gap_identified` / repair events | scaffold facts, repair state snapshots, `gap_id`, `kc_id` | `ctx.repairScaffold`, `ctx.gapId`, `ctx.repairState` when mid-repair |
| `model_bridge` | bridge prompt/response facts and graph-neutral flags | Post-bridge routing context |
| `post_bridge_transfer_decision` / check / skip | run/skip result, `kc_id`, graph-neutral score-ineligible flags | Post-bridge continuation or spacing route |
| `spacing_advanced` / `spaced_redrill` | spaced attempt facts and evaluation | Evidence hold and final projection |

Legacy traces may lack some of these facts. Rehydration must handle them
conservatively: either reconstruct a clearly safe subset or fail resume with a
specific missing-fact error. It must not silently recover by trusting transcript
text or a previously persisted `phase`.

## Closed Gaps And Limits

This slice closes the hosted `ctx` gaps that blocked same-filesystem restart:

- `launch_attempt` now carries concept identity, learner goal, and sketch text.
- `route_generated` now carries first-node, node id, map/display, substrate, and
  retry facts.
- `post_bridge_transfer_decision` records the y/N continuation before the gap
  prompt, so a restart can return to `post_bridge_transfer`.
- `learner_goal_set` records the pre-launch learner-goal prompt split.

Remaining limits are intentional:

- Legacy traces missing route or launch facts fail resume with
  `CannotRehydrateSession` unless a future migration adds a safe fallback.
- Browser session-id reuse is deferred; API resume by id is shipped.
- Transcript tail is display metadata only. Deleting it must not affect routing.

## Smallest Persistence Substrate

The first durable substrate is a filesystem-backed journal under
`SOCRATINK_LOOP_SESSION_STORE_DIR`. If the variable is unset, the hosted server
uses an OS-temp development path (`socratink-loop-sessions`). The store writes
one session directory per session id:

- `events.jsonl` — append-only event journal, one JSON event per line.
- `metadata.json` — bounded adapter metadata: session id, timestamps,
  event_count, status, phase/awaiting display metadata, completion flags, and a
  200-line transcript tail.

This targets process restart on the same filesystem. Cross-deploy durability,
Railway volume guarantees, multi-process locking, and database-backed hosted
storage are out of scope for this slice and can be introduced later behind the
same adapter boundary.

## Resume Semantics

Create:

- Generate adapter metadata and a session id.
- Create a fresh kernel.
- Advance through SEDA as usual.
- Persist only newly appended events after successful advancement.
- For a brand-new empty journal, the adapter may use bounded phase/awaiting
  metadata to preserve the idle prompt before any SEDA event exists.

Load:

- Validate the session id as a store key, not a path.
- Read the event journal.
- Create a fresh kernel.
- Replay/reconstruct allowed `ctx` and training-store state from events.
- Compute the next phase with `nextPhase(events)`.
- Use adapter phase/awaiting metadata only for the empty-journal pre-event case.

Turn:

- Load by id from the store.
- Attach the learner input through the hosted prompt adapter.
- Advance until the next hosted pacing stop, prompt requirement, completion, or
  fail-closed event.
- Append only the new event suffix and refresh bounded metadata.
- Repeated GET/load calls never append events.

Restart:

- A process-local `Map` may be used only as a cache. Deleting it must not make a
  persisted session unavailable.
- Transcript render state may be absent. The response can rebuild a session
  record from events or return the bounded adapter transcript tail while
  preserving routing.
- Any field that cannot be reconstructed from events must be adapter-owned,
  bounded, and documented as non-authoritative.

Browser reload:

- The API supports reload/resume by session id through `GET /api/session/:id`.
- The current browser client does not yet persist the session id in
  `sessionStorage` or `localStorage`; a page reload starts a new hosted session.
  This keeps the first persistence slice focused on server truth and avoids
  implying transcript history is authoritative. UI session-id reuse is a
  follow-up once product copy for "resume this session" is defined.
