# Harness traceability (V-model map)

Agent-facing guide: how **NASA-style V-model** decomposition and verification map
to this repo’s closed-loop harness. Read with [`HARNESS.md`](HARNESS.md) (substrate
contract) and [`AGENTS.md`](AGENTS.md) (SEDA loop).

```text
CONOPS / requirements  ←————————→  validation / verification
        ↓                                    ↑
   design (router, events, seams)     tests & replay gates
        ↓                                    ↑
              implementation (handlers, bridge, TUI)
```

**Time flows left → right.** Each left-side artifact should have a matching
right-side gate (horizontal traceability). Do not add ceremony — keep gates
executable (`pytest`, `node --test`, `./socratink-harness replay`).

## Layer map

| V-model tier | Socratink artifact | Verify with |
| --- | --- | --- |
| **Concept of operations** | [`AGENTS.md`](AGENTS.md), [`HARNESS.md`](HARNESS.md), graph-honesty rules | Founder intent; not a CI gate |
| **System requirements** | [`learning_cases/cases.jsonl`](learning_cases/cases.jsonl) — `product_question`, `expected_invariants` | `./socratink-harness replay` |
| **Sub-system design** | `nextPhase(events)`, `repair_policy.mjs`, event taxonomy, two-stage routing | [`tests/js/next-phase.test.mjs`](tests/js/next-phase.test.mjs), [`tests/js/repair-policy.test.mjs`](tests/js/repair-policy.test.mjs) |
| **Component design** | Handlers, `bridge.py`, `lib/seda/session-record.mjs`, `lib/seda/dashboard-metrics.mjs` | Unit tests under `tests/js/`, `tests/test_*.py` |
| **Implementation** | `./socratink-tui`, handlers, bridge subprocess | Scripted fixtures, fake LLM smoke |
| **Component verification** | Fake judge contract, policy golden matrix, session broadcast derive | [`tests/test_fake_repair_dialogue_golden.py`](tests/test_fake_repair_dialogue_golden.py), [`tests/js/session-record.test.mjs`](tests/js/session-record.test.mjs) |
| **Sub-system verification** | Full SEDA path on fixtures | `SOCRATINK_TUI_FAKE_LLM=1 ./socratink-tui --scripted fixtures/...` |
| **System validation** | End-to-end workspace smoke, founder dashboard | [`tests/test_workspace_smoke.py`](tests/test_workspace_smoke.py), `./socratink-dashboard --json` |
| **Operations & maintenance** | Promoted traces under `learning_cases/traces/`, session logs | Replay green before merge; dashboard triage |

## Verification vs validation

| Term | Question | Examples here |
| --- | --- | --- |
| **Verification** | Did we build the loop correctly? | Replay event order, policy→router tests, fake judge matches trace |
| **Validation** | Does the loop serve the learning product? | Dogfooding, dashboard rates, research cases (not gates) |

Evaluator `solid` ≠ derived `solidified` is a **verification** rule (graph honesty).
Whether copy feels Socratic is **validation** (human / research cases).

## Where to apply V-model hard vs light

**Hard (non-negotiable traceability):**

- Append-only `events[]` and pure `nextPhase`
- Graph-neutral vs evidence-candidate event roles
- `expected_invariants` on every promoted regression case
- Broadcast (`session.json`, `product_loop`) derived from facts — see `lib/seda/session-record.mjs`
- Fake validation app (`SOCRATINK_TUI_FAKE_LLM`) aligned to promoted traces

**Light (explore first, promote when settled):**

- Terminal UX copy, prompt wording, scaffold phrasing
- New pedagogy paths before a falsifiable invariant exists
- Golden cases in `learning_cases/` — see [`learning_cases/README.md`](learning_cases/README.md) promotion rule

## Horizontal traceability rules (for agents)

When changing the harness:

1. **Requirement** — state as an event or invariant, not a handler `if`.
2. **Design** — teach `nextPhase` and/or append a new fact type; keep router pure.
3. **Verify** — add the smallest test at the matching tier (unit → replay → smoke).
4. **Validate** — capture a trace; promote only when `expected_invariants` is falsifiable.
5. **Broadcast** — if observability shape changes, derive from `events[]`; never read `product_loop` for routing.

Checklist before merge on harness changes:

- [ ] Coarse route in `DIRECT_PHASE` or fine policy in `nextPhase` / `repair_policy`
- [ ] Promoted case updated or new row in `cases.jsonl` if behavior is a regression gate
- [ ] `./socratink-harness replay` green
- [ ] Relevant `tests/js/` or `tests/test_*.py` added at the correct tier
- [ ] `product_loop` / dashboard metrics still derived from facts (not duplicated state)

## Fact → Audit → Broadcast (runtime closed loop)

```text
Handler turn  →  append event(s)     (fact)
              →  derive training      (audit)
              →  buildSessionRecord   (broadcast)
              →  nextPhase(events)    (orchestrator)
```

Observability tools are **read-only**: `./socratink-harness replay`, `./socratink-dashboard --json`.

## Related docs

- [`HARNESS.md`](HARNESS.md) — SEDA invariants, Moss map, changing the harness
- [`AGENTS.md`](AGENTS.md) — phase catalog, testing commands, graph honesty
- [`learning_cases/README.md`](learning_cases/README.md) — case types and promotion
