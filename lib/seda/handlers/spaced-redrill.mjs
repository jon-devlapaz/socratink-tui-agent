import { agentCall } from "../agent-call.mjs";
import {
  callBridgeSafely,
  invalidBridgeError,
  resultToBridgeError,
  validateEvaluationPayload,
} from "../bridge-fail-closed.mjs";
import {
  classifyForStore,
  gapsForStore,
} from "../cold-gating.mjs";
import { FINAL_NOW, SPACED_AT } from "../constants.mjs";
import { buildEvidenceHold, spacedRedrillClosureLine } from "../evidence-hold.mjs";
import { eventBuilders } from "../event-facts.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handleSpacedRedrill({
  events,
  derived,
  store,
  bridge,
  prompt,
  options,
  ctx,
}) {
  console.log("");
  console.log(ctx.section("redrill", "Spaced Re-Drill"));
  const redrillCall = agentCall(ctx.agentLookup, "redrill", {
    stage: "spaced_prompt",
    provider: "orchestrator",
    model: "contract",
    latency_ms: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  });
  const spacedAttempt = await prompt.ask("spaced_attempt", "Spaced re-drill: ");
  const spacedResult = callBridgeSafely({
    bridge,
    action: "evaluate-attempt",
    payload: {
      knowledge_map: ctx.route.provisional_map,
      node_id: ctx.firstNode.id,
      node_label: ctx.firstNode.label,
      node_mechanism: ctx.firstNode.mechanism,
      evidence_goal: ctx.firstNode.evidence_goal || "",
      learner_text: spacedAttempt,
      drill_mode: "spaced_redrill",
      log_raw_llm: options.logRawLlm,
    },
  });
  if (!spacedResult.ok) {
    events.push(
      resultToBridgeError({
        result: spacedResult,
        action: "evaluate-attempt",
        phase: "spaced_redrill",
      }),
    );
    return { llm_calls: [redrillCall] };
  }
  const spaced = spacedResult.payload;
  const invalid = validateEvaluationPayload(spaced, {
    requireClassification: true,
  });
  if (invalid) {
    events.push(
      invalidBridgeError({
        action: "evaluate-attempt",
        phase: "spaced_redrill",
        reason: invalid,
      }),
    );
    return { llm_calls: [redrillCall] };
  }
  const evalCall = agentCall(ctx.agentLookup, "evidence_judge", {
    stage: "spaced_redrill",
    ...spaced.llm_call,
  });
  await store.appendAttempt(ctx.conceptId, ctx.firstNode.id, {
    id: "spaced-1",
    at: SPACED_AT,
    user_text: spacedAttempt,
    classification: classifyForStore(spaced.evaluation),
    gaps: gapsForStore(spaced.evaluation),
    grader_version: spaced.llm_call.model || "tui",
  });
  events.push(eventBuilders.spacedRedrill({
    text: spacedAttempt,
    evaluation: spaced.evaluation,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
  }));
  const finalTraining = await store.loadTraining(ctx.conceptId);
  derived.push({
    event: "spaced_redrill",
    ...summarizeTraining(finalTraining, ctx.nodeIds, FINAL_NOW),
  });
  const finalState = derived.at(-1).nodes[ctx.firstNode.id].state;
  console.log(spaced.evaluation.agent_response);
  console.log(`${ctx.section("evidence", "Evidence")} ${finalState}`);
  const evidenceHold = buildEvidenceHold({
    finalState,
    spacedEvaluation: spaced.evaluation,
    training: finalTraining,
    nodeId: ctx.firstNode.id,
  });
  if (evidenceHold) {
    ctx.evidenceHolds.push(evidenceHold);
    events.push(eventBuilders.evidenceHoldRecorded({
      kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
      hold_event: evidenceHold.event,
      state: evidenceHold.state,
      reason: evidenceHold.reason,
    }));
    console.log(
      `${ctx.section("evidence", "Evidence Hold")} ${evidenceHold.reason}`,
    );
  }
  console.log(
    spacedRedrillClosureLine({ finalState, evidenceHold }),
  );
  return { llm_calls: [redrillCall, evalCall] };
}
