---
name: founder-lab-loop-rubric
description: Rubric for evaluating Founder Lab loop runs as operator evidence.
last_updated: 2026-06-29
---

# Founder Lab Loop Rubric v1

Status: current
Owner: `lib/lab/loop-rubric.mjs`
Schema: `evals/founder-lab/loop-v1.schema.json`

Use this rubric to evaluate Founder Lab persona runs after the run completes.
It grades the pedagogical loop as an operator instrument. It does not grade the
learner, mutate graph truth, or route the SEDA loop.

## Design rules

1. Score observable run evidence, not vibes.
2. Prefer analytic criteria over one holistic score.
3. Use coarse bands: `pass`, `watch`, `fail`.
4. Keep criterion evidence traceable to event types, provider metadata, or run
   termination state.
5. Treat local and fake models as provider evidence caveats, not silent
   substitutions.
6. Use the result to decide one bounded prompt/product adjustment or no change.

## Score bands

| Score | Meaning | Operator action |
| --- | --- | --- |
| `pass` | The run supports the intended loop behavior. | Keep as evidence; no immediate fix needed. |
| `watch` | The run completed but carries a caveat or weak signal. | Compare against another run before changing prompts. |
| `fail` | The run cannot support the intended loop behavior. | Fix the smallest observable cause before using it as evidence. |

Overall score is the worst core axis score. A single `fail` makes the run a
failed evaluation. Any `watch` with no `fail` makes the run a watch item.

## Criteria

| Axis | Pass | Watch | Fail |
| --- | --- | --- | --- |
| `substrate_viability` | Confirmed Substrate is present before route generation. | Some substrate support happened, but ordering or confirmation is weak. | No observable substrate support before the product loop. |
| `generation_before_recognition` | A substantive Cold Attempt appears before repair, bridge transfer, or answer-shaped recognition. | Cold Attempt exists, but the learner needed cold help/support first. | No Cold Attempt, or recognition-like flow appears before generation. |
| `repair_load` | Repair stays bounded and does not abandon or hit the run cap. | Repair is long, recovery-heavy, or high-friction but eventually exits. | Repair abandons, exhausts the cap, or the whole run hits max turns. |
| `evidence_progression` | The run reaches a solid spaced re-drill or equivalent score-eligible progression. | Some score-eligible evidence exists, but progression stalls before strong spaced evidence. | No score-eligible learner evidence is available. |
| `model_reliability` | Live tutor model metadata is present and no bridge error occurs. | Fake mode, local tutor mode, or incomplete provider metadata requires caveated interpretation. | Bridge errors or malformed model responses prevent evidence use. |
| `prompt_adjustment_signal` | The run yields a trace-backed adjustment candidate or a trace-backed no-change result. | The run is interpretable but needs comparison before a prompt adjustment. | The run is too incomplete to justify a prompt decision. |

## Prompt adjustment discipline

Only change prompts when the rubric points to a narrow cause:

| Pattern | Adjustment target |
| --- | --- |
| Substrate weak before routing | `substrate_gate` prompt or cartridge substrate setup |
| Cold help before generation | launch copy or substrate confirmation prompt |
| Long repair without readiness | Delta scaffold or repair-dialogue judge |
| Spaced evidence stalls | transfer check or spaced re-drill prompt |
| Bridge/model failures | provider configuration, schema handling, or model selection |

If all axes pass, the recommendation is `no prompt change indicated`. Treat the
run as a control trace, not as pressure to tune.
