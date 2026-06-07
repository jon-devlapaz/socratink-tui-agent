# PR1 Substrate Gate Summary

Status: historical implementation provenance. Current product vocabulary lives in
`CONTEXT.md`, current architecture rules live in `AGENTS.md` and `HARNESS.md`,
and current behavior is proven by tests and promoted traces.

## Intent

PR1 inserted the graph-neutral Substrate Gate before route generation so novices
could receive minimal starting substrate before the first scored Cold Attempt.
The product boundary stayed intact: substrate events are context/routing facts,
not score-eligible evidence.

## Lanes

| Lane | Outcome | Current value |
| --- | --- | --- |
| 0 | Spec and ADR context established | Historical provenance for the pre-route substrate decision |
| 1 | Added routing skeleton, substrate handler registration, and graph-neutral stub events | Shows the original `nextPhase(events)` and handler boundary |
| 2 | Added bridge-backed substrate gate, prompt/template/registry/eval coverage, and fake-mode support | Shows bridge ownership and prompt-test path |
| 3 | Added hosted loop substrate refinement turn handling and loop UI coverage | Shows why substrate seed/refinement must be separate hosted turns |
| R | Review, verification, and merge prep | Superseded by current tests and reports |

## Files / Surfaces

- `CONTEXT.md`: product vocabulary for Confirmed Substrate and Substrate Gate.
- `docs/adr/0001-substrate-gate-before-route.md`: decision record.
- `lib/seda/next-phase.mjs`: routes `launch_attempt` through `substrate_gate`.
- `lib/seda/handlers/substrate-gate.mjs`: appends graph-neutral substrate facts.
- `bridge.py`, `prompt_templates.py`, `lib/bridge/registry.json`: substrate gate
  LLM seam and contracts.
- `lib/loop-server/awaiting-cta.mjs`, `lib/loop-server/prompt-help.mjs`,
  `public/loop/loop.js`: hosted substrate turn UX.
- `tests/js/substrate-gate.test.mjs`, `tests/js/loop-chat-ui.test.mjs`,
  prompt-template/eval tests, and scripted fixtures: regression proof.

## Preserved Rules

- Do not route from bridge prose; route from appended events through
  `nextPhase(events)`.
- Substrate facts are graph-neutral and score-ineligible.
- Cold Attempt remains the first score-eligible reconstruction surface.
- Hosted `/loop` must expose substrate seed/refinement as visible turns rather
  than hiding them in one response.
- PR2 hosted pacing was intentionally separate from PR1.

## Historical Packets

The old lane files are kept only for detailed provenance:

- `ORCHESTRATION.md`
- `codex-pr1-lane-1.md`
- `codex-pr1-lane-2.md`
- `codex-pr1-lane-3.md`
- `lane-1-report.md`
- `lane-3-report.md`

Treat those files as historical instructions, not current implementation scope.
