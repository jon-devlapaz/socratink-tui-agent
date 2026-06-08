export const MAX_REPAIR_TURNS = 5;

export const DIRECT_PHASE = {
  null: "ignition",
  launch_attempt: "substrate_gate",
  substrate_seed_offered: "substrate_gate",
  substrate_refinement: "substrate_gate",
  substrate_support_exhausted: "substrate_gate",
  substrate_confirmed: "route",
  route_retry: "route",
  route_generated: "cold_attempt",
  strong_cold_path: "spacing",
  gap_identified: "repair_dialogue",
  repair: "model_bridge",
  model_bridge: "post_bridge_transfer",
  post_bridge_transfer_decision: "post_bridge_transfer",
  post_bridge_transfer_check: "spacing",
  post_bridge_transfer_skipped: "spacing",
  gap_drill: "spacing",
  spacing_advanced: "spaced_redrill",
  repair_abandoned: "idle",
  bridge_error: "idle",
  spaced_redrill: "idle",
  evidence_hold_recorded: "idle",
  idle_new_concept: "ignition",
  learner_goal_set: "ignition",
  idle_redrill: "spaced_redrill",
  idle_exit: null,
};

export function nextPhase(events) {
  if (!events.length) return "ignition";
  const last = events.at(-1);
  const t = last.type;
  if (t === "cold_attempt") {
    return last.evaluation?.classification === "solid"
      ? "strong_cold_path"
      : "delta";
  }
  if (t === "cold_help_turn") {
    return "cold_attempt";
  }
  if (t === "cold_support_exhausted") {
    return "delta";
  }
  if (t === "repair_dialogue_turn") {
    // Hard invariant: once ready, dialogue must commit to repair.
    if (last.bridge_ready) return "repair";
    if (
      last.next_dialogue_action === "escalate" ||
      last.next_dialogue_action === "recover_uncertainty"
    ) {
      return "repair_dialogue";
    }
    if (
      last.turn_index >= MAX_REPAIR_TURNS ||
      last.next_dialogue_action === "abandon"
    ) {
      return "repair_abandoned";
    }
    return "repair_dialogue";
  }
  if (t === "repair_abandoned") {
    // `next_step` is a learner-intent annotation set by handleRepairAbandoned
    // (e.g. "micro_scaffold"); only "recovery_prompt" is a routing signal here.
    return last.next_step === "recovery_prompt" ? "repair_recovery" : "idle";
  }
  if (t === "repair_recovery_closed") {
    // `next_phase` is set by handleRepairRecovery to encode the post-recovery
    // destination; any value other than "repair" returns the learner to idle.
    return last.next_phase === "repair" ? "repair" : "idle";
  }
  const phase = DIRECT_PHASE[t];
  if (phase === undefined) throw new Error(`unknown event type: ${t}`);
  return phase;
}
