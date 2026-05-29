import { MAX_REPAIR_TURNS } from "../next-phase.mjs";
import {
  bucketFromRepairTurn,
  canEnterRecoveryBucket,
  recoveryNextActionText,
} from "../repair-dialogue-helpers.mjs";
import {
  isRecoveryBranchEnabled,
  REPAIR_RECOVERY_POLICY_VERSION,
} from "../repair-recovery-config.mjs";
import { TRAINING_NOW } from "../constants.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handleRepairAbandoned({ events, derived, store, ctx }) {
  const lastTurn = events.at(-1);
  const bucket = bucketFromRepairTurn(lastTurn);
  const capValue = MAX_REPAIR_TURNS;
  const recoveryEnabled = isRecoveryBranchEnabled() && canEnterRecoveryBucket(bucket);
  const reason = lastTurn?.uncertainty
    ? "uncertain_nonrepair"
    : lastTurn?.next_dialogue_action === "abandon"
      ? "dialogue_abandoned"
      : "unresolved_gap";
  events.push({
    type: "repair_state_bucketed",
    source_event_type: lastTurn?.type || "unknown",
    bucket,
    bucket_reason: reason,
    concept_id: ctx.conceptId,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
    policy_version: REPAIR_RECOVERY_POLICY_VERSION,
    graph_neutral: true,
  });
  events.push({
    type: "repair_cap_selected",
    bucket,
    cap_value: capValue,
    cap_policy_version: REPAIR_RECOVERY_POLICY_VERSION,
    inputs_fingerprint: `${bucket}:${capValue}`,
    concept_id: ctx.conceptId,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
    policy_version: REPAIR_RECOVERY_POLICY_VERSION,
    graph_neutral: true,
  });
  events.push({
    type: "repair_recovery_started",
    trigger: "repair_abandoned",
    recovery_mode: "same_kc_single_turn",
    concept_id: ctx.conceptId,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
    policy_version: REPAIR_RECOVERY_POLICY_VERSION,
    graph_neutral: true,
  });
  if (!recoveryEnabled) {
    events.push({
      type: "repair_recovery_closed",
      outcome: "idle_return",
      next_phase: "idle",
      learner_next_action: recoveryNextActionText(ctx.repairScaffold),
      concept_id: ctx.conceptId,
      kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
      policy_version: REPAIR_RECOVERY_POLICY_VERSION,
      graph_neutral: true,
    });
  }
  events.push({
    type: "repair_abandoned",
    text: lastTurn?.text || "",
    reason,
    graph_neutral: true,
    // next_step doubles as the learner-intent annotation and the recovery
    // router signal: only "recovery_prompt" routes to repair_recovery (see
    // nextPhase); "micro_scaffold" is the intended learner next action and
    // routes to idle.
    next_step: recoveryEnabled ? "recovery_prompt" : "micro_scaffold",
  });
  derived.push({
    event: "repair_abandoned",
    ...summarizeTraining(
      await store.loadTraining(ctx.conceptId),
      ctx.nodeIds,
      TRAINING_NOW,
    ),
  });
  console.log(
    `${ctx.section("repair", "Repair Abandoned")} No model bridge yet. The gap is still unresolved; uncertainty is useful, but it is not repair evidence.`,
  );
  if (!recoveryEnabled) {
    console.log(recoveryNextActionText(ctx.repairScaffold));
  }
  return {};
}
