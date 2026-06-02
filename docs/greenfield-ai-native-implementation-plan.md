# Greenfield AI-Native Implementation Plan

This is an agent-agnostic, provider-neutral implementation plan for a
greenfield AI-native product in this repo's style. It is current as of 2026-05-31
and maps external best practice back to Socratink's local contract:
Agents propose moves. Training store records events. Derivation decides truth.
Graph displays only derived evidence.

The plan is deliberately not an SDK adoption plan. No provider-specific SDK may be required in the core loop; adapters must be replaceable behind stable local contracts.

## Source Ledger

| Source | Current takeaway for this repo |
| --- | --- |
| [OpenAI practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) | Use layered guardrails, tool risk ratings, deterministic checks, and human escalation for high-risk actions. |
| [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) | Define objectives, datasets, metrics, comparison runs, and continuous evaluation before treating model behavior as reliable. |
| [OpenAI trace grading](https://developers.openai.com/api/docs/guides/trace-grading) | Evaluate agent traces, not only final text, because traces expose decisions, tool calls, and regression causes. |
| [Anthropic building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Start with simple composable workflows, add agent autonomy only when simpler calls fail, and keep tools transparent and testable. |
| [Google ADK evaluation criteria](https://adk.dev/evaluate/criteria/) | Separate response quality, safety, tool trajectory, multi-turn task success, and tool-use quality checks. |
| [Google ADK safety](https://adk.dev/safety/) | Treat identity, authorization, guardrails, sandboxing, evaluation, tracing, and network controls as separate layers. |
| [AWS agentic AI system design guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/best-practices-system-design.html) | Use deterministic execution logic unless AI is needed; scope agents and tools narrowly; prefer allow lists over unrestricted tool access. |
| [AWS observability guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/observability-and-monitoring.html) | Monitor behavior, cost, correctness, tool selection, invalid invocations, trace IDs, schema validation, fallback triggers, and output drift. |
| [OWASP LLM01 prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) | Prompt injection can be direct or indirect; RAG and fine-tuning do not fully mitigate it; constrain behavior and isolate untrusted content. |
| [OWASP LLM06 excessive agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) | Limit functionality, permissions, and autonomy; validate downstream requests outside the LLM. |
| [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) | Manage AI risk through design, development, use, and evaluation; treat trustworthiness as lifecycle work. |
| [NIST AI 600-1 Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | Govern, map, measure, and manage generative-AI risks across lifecycle stages, with attention to governance, provenance, pre-deployment testing, and incident disclosure. |

## Scope And Non-Goals

This plan applies when starting a new AI-native Socratink-style product surface
or extracting this TUI loop into a new product repo. The first implementation
target is a deterministic orchestration kernel with model calls behind replaceable
interfaces and replayable evidence.
Treat the first deliverable as a bounded repo slice: one thin vertical path,
one local guard, fake-model replay, and no provider-specific core dependency.

In scope:

- A core loop where state transitions are deterministic and inspectable.
- Versioned prompt ownership through `prompt_templates.py` or an equivalent
  local prompt registry.
- A typed bridge boundary that returns structured control fields.
- Trace-first observability that can replay behavior without live model access.
- Evaluation layers that cover prompt slots, bridge contracts, event routing,
  trace replay, safety, and user-facing validation.
- Security controls for prompt injection, excessive agency, sensitive data, and
  unsafe tool use.

Out of scope:

- Replacing `events[]` with model memory.
- Letting generated route topology, scaffolds, study copy, or model bridge text
  count as learner evidence.
- Binding the product architecture to one vendor, model, agent framework, cloud,
  or tracing dashboard.
- Treating live model success as sufficient proof without deterministic replay.

## Agent-Agnostic Architecture Contract

Build the product around stable local contracts first:

1. **Event log as authority.** Use append-only `events[]` as the fact chain.
   Every routing-relevant fact must be emitted as an event; nothing phase-critical
   may live only in process-local scratch state unless it is reconstructable.
2. **Pure orchestrator.** Keep `nextPhase(events)` pure. Handlers append facts;
   the router reads facts. A handler may not jump phases by private state or
   model prose.
3. **Typed AI boundary.** Every LLM call returns a small schema with fields that
   the orchestrator can test. Free text is display material, not control flow.
4. **Prompt registry.** All prompts live in `prompt_templates.py` or a parallel
   registry with versions, fixed instructions, and explicit dynamic slots. Inline
   prompt strings are not allowed in bridge code.
5. **Replaceable adapters.** Vendor adapters sit behind a local bridge interface.
   The core loop consumes local schemas, not provider-specific response objects.
6. **Role contracts.** Agents are role contracts, not graph mutators. Each role
   has allowed inputs, required outputs, proposed events, and explicit truth
   permission.
7. **Deterministic controls around model calls.** Use code for validation,
   normalization, allow lists, routing gates, safety caps, and replay checks.
   Use AI where deterministic code cannot carry the product goal.
8. **Trace as product evidence.** Each run records enough facts, derived state,
   LLM call metadata, and product-loop broadcast fields to diagnose failures
   without rerunning the model.

## Greenfield Implementation Sequence

1. **Define the truth boundary before the first model call.**
   State which user actions can change product truth and which artifacts are
   context. For Socratink, source, learner goal, route, scaffolds, and help are
   context, not evidence; cold attempts, repairs, and spaced re-drills are
   evidence candidates only when the training derivation accepts them.

2. **Create the minimal fact vocabulary.**
   Name events before handlers. Classify each event as routing fact,
   graph-neutral telemetry, evidence candidate, or context. Require `kc_id` or
   equivalent stable target IDs on any event that might be audited later.

3. **Implement the deterministic loop first.**
   Start with a fake model or fixture driver. Prove the loop reaches idle,
   records traces, and can replay event order before connecting a live provider.

4. **Add model calls behind bridge actions.**
   Each action gets a schema, prompt template version, fake response path, live
   response path, and contract test. Bridge code should not decide graph truth
   or mutate the event log.

5. **Add prompt evals before prompt ambition.**
   Follow the eval pattern from the sources: objective, dataset, metrics,
   comparison runs, and continuous regression cases. For Socratink, prefer
   classification, pass/fail, schema, trajectory, and trace checks over broad
   prose-quality scoring.

6. **Layer safety controls at boundaries.**
   Filter and classify inputs, validate outputs, constrain tool calls with allow
   lists, rate-limit loops, isolate untrusted content, and require human approval
   for high-risk side effects. The model is never the sole authorization layer.

7. **Promote failures into replayable cases.**
   If a failure changes routing, graph truth, or safety, capture the trace and
   promote a minimal invariant. If a failure is prompt-only, keep it in prompt
   evals. If it is qualitative product evidence, mark it as research and do not
   treat it as a gate.

8. **Only add autonomy after measurement.**
   Move from single call, to workflow, to agent, to multi-agent only when the
   simpler architecture cannot meet the objective and the added complexity
   improves measured outcomes.

## Socratink Mapping

| Greenfield concern | Socratink implementation rule |
| --- | --- |
| Domain truth | `training-store/training-derive` owns graph truth. Evaluator labels are signals, not final state. |
| Orchestration | `nextPhase(events)` is the only phase router. It reads append-only `events[]`. |
| Prompt ownership | `prompt_templates.py` owns all LLM prompts and versions. |
| Agent roles | `pedagogical_agents/contracts.json` defines allowed inputs, outputs, event proposals, and no truth permission. |
| Evidence boundary | Graph-neutral events stay graph-neutral; only spaced strong reconstruction may derive `solidified`. |
| Context boundary | source, learner goal, route, scaffolds, and help are context, not evidence. |
| Fake mode | `SOCRATINK_TUI_FAKE_LLM=1` must exercise the full SEDA path without a provider key. |
| Trace replay | `./socratink-harness replay` proves promoted event-order and derivation invariants. |
| Routing proof | `./socratink-harness routing-proof` proves saved traces route through the current `nextPhase(events)`. |
| Provider swaps | Provider changes must preserve bridge action schemas and prompt-template versions or ship an explicit migration. |

When this plan is used for a new product slice, keep the first vertical path
small: route -> cold attempt -> judge -> repair or skip -> spacing -> redrill
-> idle. Do not add multi-agent decomposition, memory, retrieval, or autonomous
tool action until the basic trace can be replayed.

## Verification Gates

Use the smallest gate that proves the current layer, then climb the V-model.

| Layer | Gate |
| --- | --- |
| Prompt registry | `.venv/bin/pytest tests/test_prompt_template.py -q` |
| Bridge schemas and fake contract | `.venv/bin/pytest tests/test_bridge_registry.py tests/test_bridge_post_call_hooks.py tests/test_bridge_route_runtime.py -q` |
| Prompt evals | `.venv/bin/pytest tests/test_prompt_eval_repair_dialogue.py tests/test_prompt_eval_evaluator.py tests/test_repair_dialogue_contract.py tests/test_prompt_template.py -q` |
| JS router and policy | `node --test 'tests/js/*.test.mjs'` |
| Fake full loop | `SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow ./socratink-tui --scripted fixtures/source_less_script.json --color=never` |
| Replay invariants | `./socratink-harness replay` |
| Routing invariants | `./socratink-harness routing-proof` |
| Workspace integration | `.venv/bin/pytest tests/test_workspace_smoke.py tests/test_app_contract.py -q` |

Completion evidence must include:

- The source-backed implementation plan.
- A local pytest guard that checks required sections, citations, repo-specific
  constraints, and provider-neutral language.
- Fresh command output for the focused guard and selected existing gates.
- A progress log with baseline, changes, validation output, and remaining risk.

## Security And Risk Controls

Security controls must be outside prompt prose wherever possible.

- **Prompt injection.** Treat direct user text, retrieved content, tool output,
  and prior agent messages as untrusted. Separate external content from trusted
  instructions, validate expected output formats, and use deterministic code to
  reject malformed control fields.
- **Excessive agency.** Give each role only the tools and permissions it needs.
  Remove unused tools, use read-only scopes where possible, mediate every
  downstream request, and require manual approval for irreversible or high-impact
  actions.
- **Sensitive data.** Do not place secrets in prompts, model memory, traces, or
  provider-visible logs. Redact or tokenize sensitive learner/session data before
  it leaves the local trust boundary.
- **Model fallbacks.** Fallback routing may optimize cost or uptime, but
  evidence-critical judging requires parity proof on schema validity, routing
  decisions, and trace replay before promotion.
- **Unbounded loops.** Every repair, recovery, route retry, and tool cycle needs
  a cap, an emitted stop fact, and an observable reason.
- **Incident learning.** Any discovered failure becomes a trace, eval case,
  guardrail, or durable doc rule. Repeated manual reminders are not controls.

## Maintenance Loop

Run the repo like a closed-loop AI product:

1. **Observe.** Capture `session.json`, LLM call metadata, derived graph state,
   and product-loop broadcast fields on every meaningful run.
2. **Classify.** Decide whether a failure is requirements, design,
   implementation, integration, validation, security, or evaluator weakness.
3. **Promote.** Convert routing and graph-truth failures into promoted traces;
   convert single-hop prompt drift into eval cases; leave qualitative research
   as non-gating research evidence.
4. **Verify.** Rerun the narrowest failing gate, then the matching layer gate,
   then replay/routing proofs when event behavior changes.
5. **Review.** Human review remains required for broad system fit, pedagogy,
   new autonomy, safety posture, and provider/model changes.
6. **Retire.** Remove unused tools, obsolete prompts, stale fixtures, and
   provider-specific assumptions that no longer serve a proven path.

The default posture for greenfield work is constrained autonomy with strong
local truth. AI may propose, classify, route signals, and draft learner-facing
copy, but the product's durable state changes only through audited local facts
and replayable derivation.
