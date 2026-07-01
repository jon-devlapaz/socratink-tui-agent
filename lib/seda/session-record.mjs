const GRAPH_TRUTH_COPY =
  "only spaced strong reconstruction may derive solidified";

const SCORE_EVENT_TYPES = new Set(["cold_attempt", "spaced_redrill"]);

function excerpt(text, max = 160) {
  if (typeof text !== "string") return "";
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function routeNodes(route) {
  const seen = new Set();
  const nodes = [];
  const add = (node) => {
    if (!node?.id || seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
  };
  add(route?.first_node);
  if (Array.isArray(route?.provisional_map?.nodes)) {
    route.provisional_map.nodes.forEach(add);
  }
  return nodes;
}

function latestDerived(derived) {
  return Array.isArray(derived) && derived.length ? derived.at(-1) : null;
}

function graphClaim({ nodes, attempts }) {
  if (nodes.some((node) => node.state === "solidified")) {
    return "durable_solidified";
  }
  const strong = attempts.filter((attempt) => attempt.store_class === "strong");
  const spaced = attempts.find((attempt) => attempt.event_type === "spaced_redrill");
  if (
    strong.length >= 2 &&
    spaced?.store_class === "strong" &&
    strong.every((attempt) => attempt.contamination === "uncued")
  ) {
    return "durable_solidified";
  }
  if (nodes.some((node) => node.state === "primed")) {
    return "same_session_primed";
  }
  if (attempts.some((attempt) => ["strong", "partial"].includes(attempt.store_class))) {
    return "same_session_primed";
  }
  if (attempts.length) return "practice_only";
  return "none";
}

function learnerFacingClaim(claim) {
  if (claim === "durable_solidified") return "Solidified by spaced reconstruction.";
  if (claim === "same_session_primed") return "Useful practice. Not stable yet.";
  if (claim === "practice_only") return "Practice recorded. Needs repair.";
  return "No learner evidence yet.";
}

function claimDisqualifiers({ claim, attempts }) {
  if (claim === "durable_solidified") return [];
  if (!attempts.length) return ["no_score_eligible_attempts"];
  const strong = attempts.filter((attempt) => attempt.store_class === "strong");
  const spaced = attempts.find((attempt) => attempt.event_type === "spaced_redrill");
  return [
    strong.length < 2 ? "not_two_strong_attempts" : null,
    spaced && spaced.store_class !== "strong" ? "spaced_attempt_not_strong" : null,
    !spaced ? "no_spaced_redrill_attempt" : null,
  ].filter(Boolean);
}

function attemptConditions({ event, eventIndex, events }) {
  const sawBridge = eventIndex >= 0
    ? events.slice(0, eventIndex).some((prior) => prior.type === "model_bridge")
    : false;
  return {
    prompt_kind: "generation_before_recognition",
    contamination: sawBridge ? "recent_bridge_visible" : "uncued",
    spacing: event?.type === "spaced_redrill" ? "spaced_redrill" : "same_session",
  };
}

export function buildEvidenceClaimTrace({
  events = [],
  training = null,
  derived = [],
  route = null,
  evidenceHolds = [],
} = {}) {
  const scoreEvents = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => SCORE_EVENT_TYPES.has(event.type));
  const latest = latestDerived(derived);
  const nodes = routeNodes(route).map((node) => {
    const record = training?.node_records?.[node.id] || { attempts: [] };
    const attempts = Array.isArray(record.attempts) ? record.attempts : [];
    return {
      node_id: node.id,
      kc_id: node.kc_id || node.id,
      label: node.label || null,
      state: latest?.nodes?.[node.id]?.state ?? null,
      next_action: latest?.nodes?.[node.id]?.next_action ?? null,
      attempts: attempts.map((attempt, attemptIndex) => {
        const scoreEvent = scoreEvents[attemptIndex] || {};
        const event = scoreEvent.event || {};
        return {
          event_type: event.type || attempt.kind || null,
          kind: attempt.kind || null,
          at: attempt.at,
          evaluator_label: event.evaluation?.classification || null,
          store_class: attempt.classification,
          learner_text_excerpt: excerpt(attempt.user_text),
          gaps: Array.isArray(attempt.gaps) ? attempt.gaps : [],
          ...attemptConditions({ event, eventIndex: scoreEvent.index ?? -1, events }),
        };
      }),
    };
  });
  const attempts = nodes.flatMap((node) => node.attempts);
  const claim = graphClaim({ nodes, attempts });

  return {
    claim,
    learner_facing: learnerFacingClaim(claim),
    evidence: nodes,
    disqualifiers: claimDisqualifiers({ claim, attempts }),
    evidence_holds: evidenceHolds,
  };
}

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
    evidence_claim_trace: buildEvidenceClaimTrace({
      events,
      training,
      derived,
      route: ctx.route,
      evidenceHolds,
    }),
    evidence_holds: evidenceHolds,
    llm_calls: llmCalls,
    training,
  };
}
