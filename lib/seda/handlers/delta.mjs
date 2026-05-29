import { agentCall } from "../agent-call.mjs";
import {
  STUDY_AT,
  TRAINING_NOW,
  UNCERTAINTY_LADDER_POLICY_VERSION,
} from "../constants.mjs";
import {
  applySocraticRepairDrillQuestion,
  prepareRepairScaffold,
} from "../repair-scaffold.mjs";
import { ensureStudyRevealEligible } from "../study-reveal.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handleDelta({ events, derived, store, bridge, options, ctx }) {
  console.log("");
  console.log(ctx.section("study", "Delta"));
  if (ctx.zeroSchemaCold) {
    console.log(
      `${ctx.section("cold", "Cold")} No scored attempt yet. We'll target one link together.`,
    );
    ctx.zeroSchemaCold = false;
  }
  const scaffoldResult = bridge.callBridge("repair-scaffold", {
    node_label: ctx.firstNode.label,
    node_mechanism: ctx.firstNode.mechanism,
    learner_text: ctx.coldAttemptText,
    gap_description: ctx.coldEval?.gap_description || null,
    evidence_goal: ctx.firstNode.evidence_goal || null,
    blank_hint: ctx.firstNode.blank_hint || null,
    is_misconception: ctx.isMisconception || false,
    log_raw_llm: options.logRawLlm,
  });
  const deltaCall = agentCall(ctx.agentLookup, "delta", {
    stage: "repair_scaffold",
    ...scaffoldResult.llm_call,
  });
  const scaffoldReview = prepareRepairScaffold(
    scaffoldResult.repair_scaffold,
    ctx.coldEval,
    ctx.firstNode,
    ctx.coldAttemptText,
  );
  const scaffold = scaffoldReview.scaffold;
  const drillResult = bridge.callBridge("socratic-repair-drill", {
    node_label: ctx.firstNode.label,
    repair_target: scaffold.repair_target,
    hinge_focus: scaffold.hinge_focus,
    contrast_prompt: scaffold.contrast_prompt,
    before: scaffold.before,
    missing_operation: scaffold.missing_operation,
    after: scaffold.after,
    learner_text: ctx.coldAttemptText,
    question_style: scaffold.question_style,
    log_raw_llm: options.logRawLlm,
  });
  const drillCall = agentCall(ctx.agentLookup, "socratic_repair_drill", {
    stage: "socratic_question",
    ...drillResult.llm_call,
  });
  ctx.repairScaffold = applySocraticRepairDrillQuestion(
    scaffold,
    drillResult.socratic_question,
    ctx.firstNode,
  );
  console.log("One causal link is still missing from your explanation.");
  console.log("Rebuild it in your own words — no quoting the map.");
  console.log("");
  console.log(ctx.section("repair", "Socratic Repair Drill"));
  console.log(ctx.repairScaffold.socratic_question);
  await ensureStudyRevealEligible(
    store,
    ctx.conceptId,
    ctx.firstNode.id,
    ctx.coldAttemptText,
  );
  await store.setStudyRevealed(ctx.conceptId, ctx.firstNode.id, STUDY_AT);
  ctx.gapId = `gap-${ctx.firstNode.id}-1`;
  const gapLog = {
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
    hinge_focus: ctx.repairScaffold.hinge_focus,
    contrast_prompt: ctx.repairScaffold.contrast_prompt,
    before: ctx.repairScaffold.before,
    missing_operation: ctx.repairScaffold.missing_operation,
    after: ctx.repairScaffold.after,
    internal_bloom_lens: ctx.repairScaffold.internal_bloom_lens,
    question_style: ctx.repairScaffold.question_style,
  };
  if (ctx.isMisconception) {
    gapLog.misconception_counter =
      ctx.repairScaffold.misconception_counter ||
      `The learner may hold a misconception: ${ctx.coldAttemptText}. The repair should include a counter-example before the Socratic question.`;
  }
  events.push({
    type: "gap_identified",
    surface: "delta",
    cue: ctx.repairScaffold.repair_target,
    gap_log: gapLog,
    repair_scaffold: ctx.repairScaffold,
    scaffold_rejections: scaffoldReview.rejections,
    prompt: ctx.repairScaffold.socratic_question,
    graph_neutral: true,
    training_store_note:
      "uses study_revealed_at internally to unlock repair without revealing model bridge",
  });
  derived.push({
    event: "gap_identified",
    ...summarizeTraining(
      await store.loadTraining(ctx.conceptId),
      ctx.nodeIds,
      TRAINING_NOW,
    ),
  });
  ctx.repairState = {
    turnIndex: 0,
    escalationLevel: 0,
    isFirstTurn: true,
    queuedPrompt: null,
    uncertaintyRecoveryCount: 0,
    hintCount: 0,
    lastHintLevel: 0,
    ladderPolicyVersion: UNCERTAINTY_LADDER_POLICY_VERSION,
  };
  return { llm_calls: [deltaCall, drillCall] };
}
