const GRAPH_TRUTH_COPY =
  "only spaced strong reconstruction may derive solidified";

/**
 * Terminal abandon: repair_abandoned occurred, model bridge never reached, and
 * recovery (if any) closed to idle — not recovered.
 *
 * Mid-loop repair_abandoned (recovery branch → model_bridge) is not terminal.
 */
export function isTerminalRepairAbandon(events = []) {
  const reachedModelBridge = events.some((e) => e.type === "model_bridge");
  const hasRepairAbandoned = events.some((e) => e.type === "repair_abandoned");
  const lastRecoveryStartedIndex = events.findLastIndex(
    (e) => e.type === "repair_recovery_started",
  );
  const lastRecoveryClosedIndex = events.findLastIndex(
    (e) => e.type === "repair_recovery_closed",
  );
  const lastRecoveryClosed = events[lastRecoveryClosedIndex];
  const recoveryClosedToIdle =
    lastRecoveryClosedIndex > lastRecoveryStartedIndex &&
    lastRecoveryClosed?.outcome === "idle_return";
  return (
    hasRepairAbandoned &&
    !reachedModelBridge &&
    (lastRecoveryStartedIndex === -1 || recoveryClosedToIdle)
  );
}

/**
 * Derive the mutually exclusive product_loop branch from the fact chain.
 */
export function deriveProductLoopBranch(events) {
  const tookStrongCold = events.some((e) => e.type === "strong_cold_path");

  if (isTerminalRepairAbandon(events)) {
    return {
      bridge_gate:
        "own-words hinge process must connect starting situation to outcome (bridge_ready gate)",
    };
  }

  return {
    strong_cold_path: tookStrongCold ? "skip_repair_until_spacing" : "not_taken",
  };
}

export function buildProductLoop(events) {
  return {
    repair_position: "before_model_bridge",
    ...deriveProductLoopBranch(events),
    graph_truth: GRAPH_TRUTH_COPY,
    graph_neutral_events: [
      ...new Set(
        events.filter((event) => event.graph_neutral).map((event) => event.type),
      ),
    ],
  };
}

export function buildSessionRecord({
  events,
  ctx,
  derived,
  evidenceHolds,
  llmCalls,
  training,
  agentContracts,
}) {
  return {
    source_mode: "source_less",
    concept: ctx.concept,
    learner_goal: ctx.learnerGoal || null,
    concept_id: ctx.conceptId,
    route: ctx.route
      ? {
          provisional_map: ctx.route.provisional_map,
          first_node: ctx.firstNode,
          map_displayed: ctx.route.map_displayed || null,
          retry_count: ctx.route.retry_count || 0,
          retry_reasons: ctx.route.retry_reasons || [],
        }
      : null,
    product_loop: buildProductLoop(events),
    agent_contract: {
      orchestrator: agentContracts.architecture.orchestrator,
      truth_contract: agentContracts.architecture.truth_contract,
      state_owner: agentContracts.architecture.state_owner,
    },
    events,
    derived,
    evidence_holds: evidenceHolds,
    llm_calls: llmCalls,
    training,
  };
}
