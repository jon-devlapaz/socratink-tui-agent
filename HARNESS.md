# Socratink TUI Harness

This document maps the TUI’s **SEDA** (staged event-driven) loop to closed-loop harness
ideas used in substrates like [Moss Harness](https://github.com/cybernetix-lab/moss-harness).
It is the substrate contract; product pedagogy lives in `AGENTS.md` and
`pedagogical_agents/contracts.json`. For the V-model decomposition ↔ verification
map (what to gate at each tier), see [`HARNESS-TRACEABILITY.md`](HARNESS-TRACEABILITY.md).

## Layers

| Layer | Responsibility | Artifacts |
| --- | --- | --- |
| **Strategy** | Graph honesty, phase catalog, canon boundaries | `AGENTS.md`, `pedagogical_agents/contracts.json`, prompt versions in `prompt_templates.py` |
| **Substrate** | Orchestration, event log, routing, bridge calls | `app.mjs` (`HANDLERS`), `lib/seda/run-loop.mjs`, `lib/seda/next-phase.mjs`, `lib/seda/handlers/`, `lib/bridge/client.mjs`, `bridge.py` |
| **App** | Founder-facing session UX | `./socratink-tui`, scripted fixtures under `fixtures/` |
| **Observability** | Read-only truth over runs | `session.json`, `./socratink-harness replay`, `./socratink-dashboard`, `DOGFOODING.md` |

The interactive TUI is an **app** on the harness. Do not treat UI copy or LLM prose as
the source of routing truth.

## Architectural invariants

These are non-negotiable for changes to the loop:

1. **Append-only facts** — `events[]` is never mutated in place. Routing reads the log;
   handlers append one or more events per turn.
2. **Orchestrator owns control flow** — `nextPhase(events)` in `lib/seda/next-phase.mjs`
   is pure (no bridge, handlers, or I/O). Handlers must not pick the next phase except
   via emitted events. Even skipping the post-bridge transfer check emits a
   `post_bridge_transfer_skipped` fact that the controller routes to spacing — there is
   no off-log phase override.
3. **Feedback reroutes** — Evaluator/bridge fields on events (`classification`,
   `bridge_ready`, `next_dialogue_action`, …) are **control signals**, not display-only.
4. **Derivation owns graph truth** — Evaluator labels are inputs; `training-derive` owns
   `solidified` / `primed`. The UI must explain holds when they disagree.
5. **Observability is read-only** — Replay and dashboard consume `session.json`; they do
   not rewrite events or derived state.

Moss’s **Fact → Audit → Broadcast** maps here as:

```text
Handler turn  →  append event(s)     (fact)
              →  derive training      (audit / policy view)
              →  write session.json   (broadcast to operators)
              →  nextPhase(events)    (orchestrator)
```

## The closed loop

```text
┌──────────────────────────────────────────────────────────────┐
│  while (phase) {                                              │
│    HANDLERS[phase](ctx)  →  events.push(...)   // lane work    │
│    phase = nextPhase(events)                 // orchestrator   │
│  }                                                            │
└──────────────────────────────────────────────────────────────┘
         ▲                              │
         │         bridge.py            │
         └──── evaluate / repair / route ┘
                    (typed feedback)
```

**Phases** (handlers): `idle`, `ignition`, `route`, `cold_attempt`, `strong_cold_path`,
`delta`, `repair_dialogue`, `repair_recovery`, `repair_abandoned`, `repair`,
`model_bridge`, `post_bridge_transfer`, `spacing`, `spaced_redrill`.

**Facts** (events): see `DIRECT_PHASE` and special branches in `nextPhase()` in `lib/seda/next-phase.mjs`.

## Two-stage routing

Moss uses coarse intent + fine policy. The TUI uses the same shape:

| Stage | Mechanism | Example |
| --- | --- | --- |
| **Coarse** | `DIRECT_PHASE[last.type]` | `route_generated` → `cold_attempt` |
| **Fine** | Policy on fields of `last` | `cold_attempt` + `classification === "solid"` → `strong_cold_path`, else `delta` |
| **Fine** | Repair dialogue policy | `bridge_ready` → `repair`; cap / `abandon` → `repair_abandoned` |

`nextPhase` must stay the **only** router. Resist embedding “if solid, go to spacing” inside
handlers without emitting an event that `nextPhase` understands.

## Control vocabulary (Moss ↔ Socratink)

| Moss governance | Socratink behavior |
| --- | --- |
| **proceed** | Next phase in `DIRECT_PHASE` or happy-path policy branch |
| **rework** | `delta`, extra `repair_dialogue_turn`, route retry (`route_retry`), recovery path |
| **circuit-break** | `repair_abandoned`, `cold_support_exhausted`, `idle_exit`, turn caps |

## Event roles

| Role | Meaning | Examples |
| --- | --- | --- |
| **Routing facts** | Drive `nextPhase` via type + payload | `cold_attempt`, `repair_dialogue_turn`, `strong_cold_path` |
| **Graph-neutral** | Telemetry / routing only; no evidence mutation | `cold_help_turn`, `repair_dialogue_turn`, `post_bridge_transfer_check`, recovery events — see `AGENTS.md` |
| **Evidence candidates** | Learner text that may affect derivation | `cold_attempt` (scored), `repair`, `spaced_redrill` |
| **Context** | Not evidence | source, goal, route, scaffolds, `/help`, `/hint` |

## Moss ↔ Socratink map

| Moss concept | Socratink TUI |
| --- | --- |
| Role lanes | Phase handlers (`HANDLERS`) — pedagogical lanes, not dev roles |
| Workflow orchestrator | `nextPhase(events)` |
| Transactional fact chain | Append-only `events[]` in `session.json` |
| Reviewer / Evaluator | `bridge.py`: `evaluate-attempt`, `repair-dialogue`, `repair-scaffold` |
| Task governance (proceed / rework / stop) | Classification, `bridge_ready`, `next_dialogue_action`, caps |
| Validation app | Scripted fixtures + `SOCRATINK_TUI_FAKE_LLM` |
| Read-only observability | `socratink-harness replay`, `socratink-dashboard --json` |
| `moss_*` metrics (target) | `tui_*` counters from replay cases (rework, abandon, strong-cold rate) — optional future |

**Not ported from Moss** (by design): six dev-agent lanes, task-board claiming, expert
evolution, K8s operator, MCP skill registry. Cross-run memory curation is limited to
promoted traces in `learning_cases/`.

## Observability surfaces

| Tool | Purpose |
| --- | --- |
| `SOCRATINK_TUI_LOG_ROOT/<ts>/session.json` | Full fact chain, `derived`, `llm_calls`, `product_loop` |
| `./socratink-harness replay` | Assert `expected_invariants` on promoted cases (`learning_cases/cases.jsonl`) |
| `./socratink-dashboard --json` | Founder summaries for dogfooding |
| `DOGFOODING.md` | Closed loop: replay → dashboard → triage JSON |

Replay checks include `event_order`, `final_node_state`, forbidden events/stages, and
evaluator vs derivation alignment (`truth_source: training_derivation`).

## Traversal and map layers

Three layers must stay separate in product copy and routing:

| Layer | Artifact | Learner-facing rule |
| --- | --- | --- |
| Hypothesis | `route.provisional_map` + `map_displayed` | Thesis and backbone **orient** only. Mechanisms stay hidden until model bridge. |
| Evidence | `events[]`, training attempts | Only generative, score-eligible attempts count. Graph-neutral phases do not mutate truth. |
| Graph truth | `derived` from `training-derive` | `solidified` requires spaced strong reconstruction; evaluator `solid` ≠ solidified. |

Traversal rules (dungeon crawl intent, current TUI scope):

1. **Orient** after route: show thesis, backbone pillars, and room list with one **active** subnode (`map_displayed` in `session.json`).
2. **Enter** at the active subnode (`first_node`), not at thesis or backbone as scored tasks.
3. **Advance rooms** along `learning_prerequisites` when multi-node crawl ships — never along `backbone[]` array order or lecture order.
4. **Clear** a room on derivation, not on evaluator labels or model-bridge reveal.
5. **Interleave** at spaced re-drill, not as immediate hops to adjacent rooms after repair.

Over-decomposed subnodes are **fake dungeon rooms** (see `learnops-extract/extract-system-v1.txt`).

## Worked example: Moss-style timeline

Case: `inner-repair-dialogue-gates-model-bridge-2026-05-26` (see
`learning_cases/traces/inner-repair-dialogue-gates-model-bridge-2026-05-26/session.json`).

Fixture driver: `fixtures/source_less_script.json` (with `repair_dialogue_turns` in fuller
fixtures; trace captured from live/fake run).

```text
PHASE (lane)          FACT (event)                    FEEDBACK → ROUTE
─────────────────────────────────────────────────────────────────────────
ignition              launch_attempt                  proceed → route
route                 route_generated                 proceed → cold_attempt
cold_attempt          cold_attempt                    classification ≠ solid → delta
delta                 gap_identified                  proceed → repair_dialogue
repair_dialogue       repair_dialogue_turn (×2)       bridge_ready false → rework (stay)
repair_dialogue       repair_dialogue_turn            bridge_ready true → repair
repair                repair                          proceed → model_bridge
model_bridge          model_bridge                    proceed → post_bridge_transfer
post_bridge_transfer  post_bridge_transfer_check      graph-neutral → spacing
spacing               spacing_advanced                proceed → spaced_redrill
spaced_redrill        spaced_redrill                  eval solid; derive may hold primed
```

**Harness lesson:** two graph-neutral dialogue turns are **rework**; only the
bridge-ready turn authorizes `repair` and thus `model_bridge`. Evaluator “solid” on spaced
redrill does not override derivation — replay enforces `evidence_hold_required` on this case.

## Scripted smoke (validation app)

```bash
SOCRATINK_TUI_FAKE_LLM=1 \
SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
./socratink-tui --scripted fixtures/source_less_script.json --color=never

./socratink-harness replay
```

## Changing the harness

1. Emit a new or extended **event** (fact) from the handler.
2. Teach **coarse** routing in `DIRECT_PHASE` if `last.type` alone suffices.
3. Teach **fine** policy in `nextPhase` if fields on `last` decide the branch.
4. Add a **handler** only when a new phase needs distinct UX/work.
5. Bump prompt template version if bridge slots change; run `pytest tests/test_prompt_template.py`.
6. Promote a trace: `learning_cases/cases.jsonl` + `expected_invariants` + replay green.

See `AGENTS.md` for graph-honesty rules and fixture format.

## Further reading

- [`HARNESS-TRACEABILITY.md`](HARNESS-TRACEABILITY.md) — V-model map, verification vs validation, agent checklist
- [Moss README](https://github.com/cybernetix-lab/moss-harness) — closed-loop orchestrator, two-stage routing
- [Moss ARCHITECTURE.md](https://github.com/cybernetix-lab/moss-harness/blob/main/ARCHITECTURE.md) — invariants and runtime layout
- `AGENTS.md` — SEDA loop and testing commands in this repo
