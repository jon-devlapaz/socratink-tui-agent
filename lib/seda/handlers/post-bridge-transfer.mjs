import { agentCall } from "../agent-call.mjs";
import { GAP_AT, TRAINING_NOW } from "../constants.mjs";
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
    ? Boolean(ctx.scripted.run_gap_drill)
    : await resolveRunGapDecision({ prompt, ctx });
  if (!runGap) {
    // Skipping the transfer check is a routing fact, not an off-log escape:
    // emit it so the controller (nextPhase) owns the transition to spacing and
    // observability sees the decision.
    events.push({
      type: "post_bridge_transfer_skipped",
      graph_neutral: true,
      at: GAP_AT,
      kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
    });
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
  const gap = bridge.callBridge("evaluate-attempt", {
    knowledge_map: ctx.route.provisional_map,
    node_id: ctx.firstNode.id,
    node_label: ctx.firstNode.label,
    node_mechanism: ctx.firstNode.mechanism,
    learner_text: gapAttempt,
    repair_drill_context: repairEv?.text,
    drill_mode: "gap_drill",
    log_raw_llm: options.logRawLlm,
  });
  const gapCall = agentCall(ctx.agentLookup, "evidence_judge", {
    stage: "gap_drill",
    ...gap.llm_call,
  });
  events.push({
    type: "post_bridge_transfer_check",
    text: gapAttempt,
    prompt: pressurePrompt.trim(),
    target_missing_operation: ctx.repairScaffold.missing_operation,
    evaluation: gap.evaluation,
    graph_neutral: true,
    at: GAP_AT,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
  });
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

async function resolveRunGapDecision({ prompt, ctx }) {
  if (ctx.postBridgeTransfer?.runGap === true) {
    return true;
  }
  if (ctx.postBridgeTransfer?.runGap === false) {
    return false;
  }
  const answer = await prompt.ask(
    "run_gap_drill",
    "\nPost-bridge transfer check? y/N: ",
    "n",
  );
  const runGap = answer.toLowerCase().startsWith("y");
  ctx.postBridgeTransfer = { runGap };
  return runGap;
}
