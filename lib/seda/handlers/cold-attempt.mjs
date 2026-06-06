import { agentCall } from "../agent-call.mjs";
import {
  callBridgeSafely,
  invalidBridgeError,
  resultToBridgeError,
  validateEvaluationPayload,
} from "../bridge-fail-closed.mjs";
import {
  classifyForStore,
  countColdHelpTurns,
  gapsForStore,
  isSubstantiveColdEvaluation,
  MAX_COLD_HELP_TURNS,
} from "../cold-gating.mjs";
import { TRAINING_NOW } from "../constants.mjs";
import { eventBuilders } from "../event-facts.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handleColdAttempt({
  events,
  derived,
  store,
  bridge,
  prompt,
  options,
  ctx,
}) {
  console.log("");
  console.log(ctx.section("cold", "Cold Attempt"));
  const coldAttempt = await prompt.ask("cold_attempt", "Cold attempt: ");
  const coldResult = callBridgeSafely({
    bridge,
    action: "evaluate-attempt",
    payload: {
      knowledge_map: ctx.route.provisional_map,
      node_id: ctx.firstNode.id,
      node_label: ctx.firstNode.label,
      node_mechanism: ctx.firstNode.mechanism,
      learner_text: coldAttempt,
      drill_mode: "cold_attempt",
      log_raw_llm: options.logRawLlm,
    },
  });
  if (!coldResult.ok) {
    events.push(
      resultToBridgeError({
        result: coldResult,
        action: "evaluate-attempt",
        phase: "cold_attempt",
      }),
    );
    return { llm_calls: [] };
  }
  const cold = coldResult.payload;
  const invalid = validateEvaluationPayload(cold);
  if (invalid) {
    events.push(
      invalidBridgeError({
        action: "evaluate-attempt",
        phase: "cold_attempt",
        reason: invalid,
      }),
    );
    return { llm_calls: [] };
  }
  const coldCall = agentCall(ctx.agentLookup, "evidence_judge", {
    stage: "cold_attempt",
    ...cold.llm_call,
  });
  const evaluation = cold.evaluation;
  const kcId = ctx.firstNode.kc_id || ctx.firstNode.id;

  if (!isSubstantiveColdEvaluation(evaluation)) {
    const turnIndex = countColdHelpTurns(events) + 1;
    events.push(eventBuilders.coldHelpTurn({
      turn_index: turnIndex,
      text: coldAttempt,
      answer_mode: evaluation.answer_mode || "help_request",
      classification: evaluation.classification ?? null,
      routing: evaluation.routing || "SCAFFOLD",
      help_request_reason: evaluation.help_request_reason || "explicit_unknown",
      kc_id: kcId,
      agent_response: evaluation.agent_response,
      generative_commitment: evaluation.generative_commitment ?? false,
    }));
    console.log(evaluation.agent_response);
    console.log(`${ctx.section("cold", "Cold")} Not scored yet`);

    if (turnIndex >= MAX_COLD_HELP_TURNS) {
      events.push(eventBuilders.coldSupportExhausted({
        help_turns: turnIndex,
        reason: "no_substantive_cold_attempt",
        kc_id: kcId,
      }));
      ctx.zeroSchemaCold = true;
      ctx.coldAttemptText = coldAttempt;
      ctx.coldEval = evaluation;
      ctx.isMisconception = false;
      return { llm_calls: [coldCall] };
    }

    ctx.composerCta = {
      label: "Answer from memory",
      text: ctx.firstNode.learner_prompt || "",
    };
    if (!options.loopUi) {
      console.log("");
      console.log(ctx.firstNode.learner_prompt);
    }
    return { llm_calls: [coldCall] };
  }

  await store.appendAttempt(ctx.conceptId, ctx.firstNode.id, {
    id: "cold-1",
    at: TRAINING_NOW,
    user_text: coldAttempt,
    classification: classifyForStore(evaluation),
    gaps: gapsForStore(evaluation),
    grader_version: cold.llm_call.model || "tui",
  });
  events.push(eventBuilders.coldAttempt({
    text: coldAttempt,
    evaluation,
    kc_id: kcId,
  }));
  derived.push({
    event: "cold_attempt",
    ...summarizeTraining(
      await store.loadTraining(ctx.conceptId),
      ctx.nodeIds,
      TRAINING_NOW,
    ),
  });
  console.log(evaluation.agent_response);
  console.log(
    `${ctx.section("evidence", "Evidence")} ${derived.at(-1).nodes[ctx.firstNode.id].state}`,
  );
  ctx.coldEval = evaluation;
  ctx.coldAttemptText = coldAttempt;
  ctx.isMisconception = evaluation.classification === "misconception";
  ctx.zeroSchemaCold = false;
  return { llm_calls: [coldCall] };
}
