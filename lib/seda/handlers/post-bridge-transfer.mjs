import { agentCall } from "../agent-call.mjs";
import {
  callBridgeSafely,
  invalidBridgeError,
  resultToBridgeError,
  validateEvaluationPayload,
} from "../bridge-fail-closed.mjs";
import { GAP_AT, TRAINING_NOW } from "../constants.mjs";
import { eventBuilders } from "../event-facts.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handlePostBridgeTransfer({
  events,
  derived,
  store,
  bridge,
  prompt,
  options,
  ctx,
}) {
  ctx.composerCta = null;

  const runGap = ctx.scripted
    ? recordRunGapDecision({
        events,
        ctx,
        runGap: Boolean(ctx.scripted.run_gap_drill),
        source: "scripted",
      })
    : await resolveRunGapDecision({ events, prompt, ctx });
  if (!runGap) {
    // Skipping the transfer check is a routing fact, not an off-log escape:
    // emit it so the controller (nextPhase) owns the transition to spacing and
    // observability sees the decision.
    events.push(eventBuilders.postBridgeTransferSkipped({
      at: GAP_AT,
      kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
    }));
    derived.push({
      event: "post_bridge_transfer_skipped",
      ...summarizeTraining(
        await store.loadTraining(ctx.conceptId),
        ctx.nodeIds,
        TRAINING_NOW,
      ),
    });
    ctx.postBridgeTransfer = null;
    return {};
  }
  console.log("");
  console.log(ctx.section("pressure", "Post-Bridge Transfer Check"));
  const pressurePrompt = `Post-bridge transfer check (${ctx.repairScaffold.missing_operation}): `;
  const gapAttempt = await prompt.ask("gap_attempt", pressurePrompt);
  const repairEv = events.findLast((e) => e.type === "repair");
  const gapResult = callBridgeSafely({
    bridge,
    action: "evaluate-attempt",
    payload: {
      knowledge_map: ctx.route.provisional_map,
      node_id: ctx.firstNode.id,
      node_label: ctx.firstNode.label,
      node_mechanism: ctx.firstNode.mechanism,
      learner_text: gapAttempt,
      repair_drill_context: repairEv?.text,
      drill_mode: "gap_drill",
      log_raw_llm: options.logRawLlm,
    },
  });
  if (!gapResult.ok) {
    events.push(
      resultToBridgeError({
        result: gapResult,
        action: "evaluate-attempt",
        phase: "post_bridge_transfer",
      }),
    );
    return { llm_calls: [] };
  }
  const gap = gapResult.payload;
  const invalid = validateEvaluationPayload(gap);
  if (invalid) {
    events.push(
      invalidBridgeError({
        action: "evaluate-attempt",
        phase: "post_bridge_transfer",
        reason: invalid,
      }),
    );
    return { llm_calls: [] };
  }
  const gapCall = agentCall(ctx.agentLookup, "evidence_judge", {
    stage: "gap_drill",
    ...gap.llm_call,
  });
  events.push(eventBuilders.postBridgeTransferCheck({
    text: gapAttempt,
    prompt: pressurePrompt.trim(),
    target_missing_operation: ctx.repairScaffold.missing_operation,
    evaluation: gap.evaluation,
    at: GAP_AT,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
  }));
  derived.push({
    event: "post_bridge_transfer_check",
    ...summarizeTraining(
      await store.loadTraining(ctx.conceptId),
      ctx.nodeIds,
      TRAINING_NOW,
    ),
  });
  console.log(gap.evaluation.agent_response);
  ctx.postBridgeTransfer = null;
  return { llm_calls: [gapCall] };
}

async function resolveRunGapDecision({ events, prompt, ctx }) {
  const recorded = latestPostBridgeTransferDecision(events);
  if (recorded) {
    ctx.postBridgeTransfer = { runGap: recorded.run_gap };
    return recorded.run_gap;
  }
  if (ctx.postBridgeTransfer?.runGap === true) {
    return recordRunGapDecision({
      events,
      ctx,
      runGap: true,
      source: "ctx_legacy",
    });
  }
  if (ctx.postBridgeTransfer?.runGap === false) {
    return recordRunGapDecision({
      events,
      ctx,
      runGap: false,
      source: "ctx_legacy",
    });
  }
  const answer = await prompt.ask(
    "run_gap_drill",
    "\nPost-bridge transfer check? y/N: ",
    "n",
  );
  const runGap = answer.toLowerCase().startsWith("y");
  return recordRunGapDecision({ events, ctx, runGap, source: "learner" });
}

function latestPostBridgeTransferDecision(events) {
  const lastModelBridgeIndex = events.findLastIndex(
    (event) => event.type === "model_bridge",
  );
  if (lastModelBridgeIndex < 0) return null;
  return events
    .slice(lastModelBridgeIndex + 1)
    .findLast((event) => event.type === "post_bridge_transfer_decision") ?? null;
}

function recordRunGapDecision({ events, ctx, runGap, source }) {
  const recorded = latestPostBridgeTransferDecision(events);
  if (recorded) {
    ctx.postBridgeTransfer = { runGap: recorded.run_gap };
    return recorded.run_gap;
  }
  events.push(eventBuilders.postBridgeTransferDecision({
    run_gap: runGap,
    decision_source: source,
    at: GAP_AT,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
  }));
  ctx.postBridgeTransfer = { runGap };
  return runGap;
}
