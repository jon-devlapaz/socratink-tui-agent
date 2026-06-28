# Documentation Signal Audit

Created: 2026-06-07
Rubric: `docs/implementation/karpathy-like/DOC_SIGNAL_RUBRIC.md`

## Summary

The proof infrastructure is product-serving and should stay. The lower-signal
surface is not tests, fixtures, harnesses, evals, or promoted traces; it is old
implementation-planning packets that still read like work instructions rather
than labeled historical provenance.

No tracked file in the requested paths is a clean delete on this pass. The next
cleanup should be compression and status labeling, not removal.

## Planning / Provenance Docs

| Path | Score | Band | Recommendation | Reason |
| --- | ---: | --- | --- | --- |
| `docs/implementation/architecture-fitness/REPORT.md` | 11 | keep canonical/support | Keep | Clear goal, success criteria, concrete commands, and current guard evidence. |
| `docs/implementation/event-facts-readiness/PR_READY_SUMMARY.md` | 9 | keep support | Keep | High review value and validation evidence; summary shape is useful. |
| `docs/implementation/event-facts-readiness/READINESS.md` | 8 | keep support | Fix status label | Evidence-rich, but `Status: IN_PROGRESS` conflicts with later full validation. |
| `docs/implementation/event-taxonomy-dashboard-v2/GOAL.md` | 7 | keep support | Relabel historical | Good implementation contract, but should not read like current pending scope. |
| `docs/implementation/event-taxonomy-dashboard-v2/PROGRESS.md` | 9 | keep support | Keep | Strong checkpoint evidence and command trail; useful provenance. |
| `docs/implementation/karpathy-like/BASELINE.md` | 11 | keep support | Keep | Current audit baseline with owner and guard map. |
| `docs/implementation/karpathy-like/DOC_SIGNAL_RUBRIC.md` | 12 | keep canonical/support | Keep | Current rubric with direct decision rules. |
| `docs/implementation/karpathy-like/REPORT.md` | 10 | keep support | Keep | Current report with validation evidence and residual risks. |
| `docs/implementation/pr1-substrate-gate/SUMMARY.md` | 8 | keep support | Keep | PR1 lane packets and reports were collapsed here; old detailed files were pruned to remove stale local paths and task packets. |
| `docs/implementation/pr2-hosted-loop-pacing/REPORT.md` | 10 | keep support | Keep | Strong current/historical proof of hosted pacing boundaries and validation. |
| `docs/implementation/session-kernel-goal/GOAL.md` | 7 | keep support | Relabel status | Useful architecture goal; should say whether implemented, superseded, or pending. |
| `docs/implementation/session-kernel-goal/PROGRESS.md` | 8 | keep support | Compress later | Evidence-rich but long; a shorter summary plus retained command trail would be clearer. |
| `docs/pre-specs/2026-06-01-novice-substrate-seed.md` | 8 | keep support | Keep as pre-spec | Clearly labeled, product-relevant, and preserves evidence-boundary reasoning. |
| `docs/pre-specs/2026-06-03-pr2-hosted-loop-pacing.md` | 8 | keep support | Relabel implemented/historical | Valuable design record, but status says approved next track after implementation shipped. |
| `docs/spec-ideas/meta-command-metacognitive-companion.md` | 8 | keep support | Keep parked | Clearly parked; useful if `/meta` evolves. |
| `docs/strategy/2026-06-03-proof-based-learning-improvement-plan.md` | 8 | keep support | Keep | Product strategy with implemented baseline slice; not runtime but decision-serving. |
| `docs/strategy/2026-06-05-days-0-14-implementation-controlled-roadmap.md` | 10 | keep support | Keep | High-signal milestone doc with related PR and evidence log. |

## Proof Infrastructure

| Path | Score | Recommendation | Reason |
| --- | ---: | --- | --- |
| `evals/` | 10 | Keep | Prompt eval cases are executable product-quality proof. |
| `learning_cases/` | 12 | Keep | Promoted traces and case schema are product truth regression fixtures. |
| `fixtures/` | 10 | Keep | Scripted TUI fixtures make learner-loop behavior reproducible. |
| `harness/` | 12 | Keep | Replay and routing proof are core verification entrypoints. |
| `tests/` | 12 | Keep | Unit, contract, prompt, bridge, and hosted-loop tests are product-serving proof infrastructure. |

Local cache under `tests/__pycache__/` is not proof infrastructure; it is ignored
local artifact state and should not be treated as product-serving even though it
lives under `tests/`.

## Cleanup Plan

1. Completed: status headers were added to stale-but-useful docs:
   - `docs/implementation/event-facts-readiness/READINESS.md`
   - `docs/implementation/event-taxonomy-dashboard-v2/GOAL.md`
   - `docs/implementation/session-kernel-goal/GOAL.md`
   - `docs/pre-specs/2026-06-03-pr2-hosted-loop-pacing.md`
2. Completed: `docs/implementation/pr1-substrate-gate/SUMMARY.md` now keeps lane
   outcomes and current-value guidance. Old lane packets are explicitly marked
   historical.
3. Do not delete `evals/`, `learning_cases/`, `fixtures/`, `harness/`, or
   `tests/`; they are proof infrastructure, not learner-facing runtime, but they
   directly serve product correctness.
4. Do not use `.qa-runs/`, `.supergoal/`, `.workflow/`, `.code-review-graph/`, or
   local caches as canonical truth.

## 2026-06-28T06:24:21Z doc signal audit

| Path | Score | Band | Recommendation | Rationale | Suggested next action |
| --- | ---: | --- | --- | --- | --- |
| `docs/adr/0001-substrate-gate-before-route.md` | 10 | keep canonical/support | Keep | Names current SEDA phase mapping rules and UI requirements. | Link from `INDEX.md` start here section. |
| `docs/adr/0002-agent-git-control-plane.md` | 12 | keep canonical/support | Keep | Defines critical safety wrapper commands and golden end zone rules. | Ensure subagents read this on startup. |
| `docs/adr/ADR-fake-bridge-vcr-stub.md` | 12 | keep canonical/support | Keep | Explicitly defines lookup-table fallback design and exact check commands. | Keep lookup fixture coverage tests updated. |
| `docs/founder-lab-todo.md` | 11 | keep canonical/support | Keep | Bounded console checklist, MVP surface definitions, and hardening tasks. | Audit task completion on next `/lab` release. |
| `docs/bugs/2026-06-01-live-persona-run-bugs.md` | 12 | keep support | Keep as historical bugs | Detailed reproduction, fix boundary, and verification targets for SEDA QA. | Leave in bugs directory for regression history. |
| `docs/rubrics/loop-v1.md` | 10 | keep canonical/support | Keep | Clear evaluation criteria schema mapping and prompt adjustment guide. | Keep aligned with `evals/founder-lab/` schema updates. |
| `docs/architecture/hosted-session-persistence.md` | 11 | keep canonical/support | Keep | Sets authority boundary, facts needed for SEDA resume, and directory layout. | Link to `HARNESS.md` for orchestrator-rehydration reference. |
| `docs/architecture/seda-event-facts.md` | 12 | keep canonical/support | Keep | Authoritative definition of neutral/score SEDA events and builders list. | Run drift checks when updating eventbuilders. |
| `docs/greenfield-ai-native-implementation-plan.md` | 9 | keep support | Keep as design pattern | Good rules on replaceable vendor client adapters and prompt registry. | Label as historical proposal once next core loop version is established. |
| `docs/INDEX.md` | 10 | keep canonical/support | Keep | Essential navigation map pointing directly to rules and architecture. | Freshness check when new documents are added or archived. |
| `docs/prompt-usage-map.md` | 11 | keep canonical/support | Keep | Mermaid flowchart mapping phases to prompt templates and handlers. | Sync map when introducing new bridge actions. |
| `docs/implementation/lab-workbench-progress.md` | 10 | keep support | Keep as progress log | Short, verified record of founder runs dialogue rendering. | Relabel historical after next major workbench feature release. |
| `docs/implementation/karpathy-like/debloat-assessment.md` | 12 | keep canonical/support | Keep | Repo-native pygount skips, JSON/Markdown weight analysis, and do-not-do list. | Enforce skips in CI script checks. |
| `docs/strategy/2026-06-20-product-moving-alpha-plan.md` | 12 | keep canonical/support | Keep | Clear alpha directions, cuts, do-now priority, and verification requirements. | Use as active spine reference for next product milestone. |

### Priority Actions

- **Highest-priority rewrite/archive candidate 1:** `docs/implementation/lab-workbench-progress.md` (Score 10) — Relabel as historical progress log after the next major `/lab` update to prevent reader confusion about pending work.
- **Highest-priority rewrite/archive candidate 2:** `docs/greenfield-ai-native-implementation-plan.md` (Score 9) — Archive under `docs/implementation/provenance/` once the next core-loop SDK adapter changes are finalized.
- **Highest-priority keep with freshness check:** `docs/INDEX.md` (Score 10) — Needs a freshness check and direct update to list the newly added ADR and architecture docs.
