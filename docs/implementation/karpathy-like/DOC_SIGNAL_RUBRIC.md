# Documentation Signal Rubric

Use this rubric when deciding whether a doc should be kept, rewritten, moved, or
deleted. The goal is Karpathy-like documentation: simple, explicit, surgical,
and verifiable.

## Scoring

Score each row from `0` to `2`.

| Criterion | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Product truth | Does not affect product, proof, or agent decisions | Indirectly useful context | Names current product behavior, invariant, or decision boundary |
| Owner clarity | No clear owner or canonical surface | Owner implied but easy to confuse | Names the canonical file, module, command, or decision owner |
| Actionability | Reader cannot decide what to do next | Provides direction but no concrete check | Gives a command, file path, checklist, or decision rule |
| Verifiability | Claims cannot be checked | Claims can be manually inspected | Claims point to tests, harnesses, traces, CI, or exact commands |
| Freshness | Historical plan written like current truth | Historical context is labeled but mixed with active guidance | Current guidance is separated from history and dated |
| Simplicity | Repeats broad doctrine or adds ceremony | Some duplication, but useful | Short, local, and avoids speculative abstraction |

Maximum: `12`.

## Decision Bands

| Score | Decision | Rule |
| --- | --- | --- |
| `10-12` | Keep canonical | Link to it from the nearest entrypoint if discoverability is weak. |
| `7-9` | Keep as support | Leave it in place, but make owner, status, or verification clearer. |
| `4-6` | Rewrite or archive | Extract the current rule; move history under implementation/provenance. |
| `0-3` | Delete candidate | Remove unless it is required legal, deploy, or audit provenance. |

## Fast Questions

Ask these before editing a doc:

1. What decision does this doc help a future agent or maintainer make?
2. What canonical source would prove or disprove the claim?
3. Is this current product truth, proof infrastructure, or historical provenance?
4. Could a shorter pointer to `AGENTS.md`, `HARNESS.md`, `CONTEXT.md`, or a test
   replace this text?
5. If the doc is wrong, what test, harness, or command would catch it?

If those answers are vague, the doc is low signal.

## Socratink Defaults

Treat these as high-signal by default:

- `AGENTS.md`: repo operating rules and SEDA throughline.
- `CONTEXT.md`: glossary only.
- `HARNESS.md`: architecture invariants and runtime proof map.
- `HARNESS-TRACEABILITY.md`: V-model verification map.
- `README.md`: entrypoints for setup, run, and validation.
- `tests/`, `harness/`, `learning_cases/`, `fixtures/`, `evals/`: proof
  infrastructure, not product UI, but product-serving.

Treat these as review-required:

- `docs/implementation/**`: keep if it records shipped evidence or a current
  guard; archive or compress if it is only planning residue.
- `docs/pre-specs/**`, `docs/spec-ideas/**`, `docs/strategy/**`: keep only when
  clearly labeled as proposal, strategy, or provenance.
- Local tool state such as `.qa-runs/`, `.supergoal/`, `.workflow/`,
  `.code-review-graph/`, `.poolside/`, caches, and screenshots: not canonical
  docs; do not let them become product truth.

## Rewrite Pattern

When a doc scores low but contains one useful rule, rewrite it into this shape:

```text
Status: current | historical | proposal
Owner: <canonical file/module/command>
Rule: <one sentence>
Verify with: <command/test/trace>
Notes: <only what prevents a known mistake>
```

Anything else should earn its space.
