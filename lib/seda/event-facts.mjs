const KNOWN_EVENT_TYPES = [
  "bridge_error",
  "cold_attempt",
  "cold_help_turn",
  "cold_support_exhausted",
  "evidence_hold_recorded",
  "gap_identified",
  "idle_exit",
  "idle_new_concept",
  "idle_redrill",
  "launch_attempt",
  "learner_goal_set",
  "meta_turn",
  "model_bridge",
  "post_bridge_transfer_check",
  "post_bridge_transfer_decision",
  "post_bridge_transfer_skipped",
  "repair",
  "repair_abandoned",
  "repair_cap_selected",
  "repair_dialogue_turn",
  "repair_hint_requested",
  "repair_recovery_closed",
  "repair_recovery_started",
  "repair_recovery_turn",
  "repair_state_bucketed",
  "route_generated",
  "route_retry",
  "spaced_redrill",
  "spacing_advanced",
  "strong_cold_path",
  "substrate_confirmed",
  "substrate_refinement",
  "substrate_seed_offered",
  "substrate_support_exhausted",
];

function define(type, options = {}) {
  return Object.freeze({
    type,
    graph_neutral: Boolean(options.graph_neutral),
    score_eligible: Boolean(options.score_eligible),
    learner_text: Boolean(options.learner_text),
    routing_fact: Boolean(options.routing_fact),
    requires_kc_id: Boolean(options.requires_kc_id),
    replay_relevant: Boolean(options.replay_relevant),
    persisted_fields: Object.freeze(options.persisted_fields || []),
    required_fields: Object.freeze(options.required_fields || []),
  });
}

const graphNeutral = [
  "bridge_error",
  "cold_help_turn",
  "cold_support_exhausted",
  "evidence_hold_recorded",
  "gap_identified",
  "meta_turn",
  "model_bridge",
  "post_bridge_transfer_check",
  "post_bridge_transfer_decision",
  "post_bridge_transfer_skipped",
  "repair",
  "repair_abandoned",
  "repair_cap_selected",
  "repair_dialogue_turn",
  "repair_hint_requested",
  "repair_recovery_closed",
  "repair_recovery_started",
  "repair_recovery_turn",
  "repair_state_bucketed",
  "route_retry",
  "strong_cold_path",
  "substrate_confirmed",
  "substrate_refinement",
  "substrate_seed_offered",
  "substrate_support_exhausted",
];

const scoreEligible = ["cold_attempt", "spaced_redrill"];

const learnerText = [
  "cold_attempt",
  "cold_help_turn",
  "launch_attempt",
  "post_bridge_transfer_check",
  "repair",
  "repair_dialogue_turn",
  "repair_hint_requested",
  "repair_recovery_turn",
  "spaced_redrill",
  "substrate_refinement",
];

const routingFacts = [
  "bridge_error",
  "cold_attempt",
  "cold_help_turn",
  "cold_support_exhausted",
  "evidence_hold_recorded",
  "gap_identified",
  "idle_exit",
  "idle_new_concept",
  "idle_redrill",
  "learner_goal_set",
  "model_bridge",
  "post_bridge_transfer_check",
  "post_bridge_transfer_decision",
  "post_bridge_transfer_skipped",
  "repair",
  "repair_abandoned",
  "repair_dialogue_turn",
  "repair_recovery_closed",
  "repair_recovery_turn",
  "route_generated",
  "route_retry",
  "spaced_redrill",
  "spacing_advanced",
  "strong_cold_path",
  "substrate_confirmed",
  "substrate_refinement",
  "substrate_seed_offered",
  "substrate_support_exhausted",
];

const kcRequired = [
  "cold_attempt",
  "post_bridge_transfer_check",
  "repair",
  "repair_dialogue_turn",
  "repair_hint_requested",
  "repair_recovery_turn",
  "spaced_redrill",
  "strong_cold_path",
];

const replayRelevant = [
  "cold_attempt",
  "cold_help_turn",
  "cold_support_exhausted",
  "evidence_hold_recorded",
  "gap_identified",
  "idle_new_concept",
  "launch_attempt",
  "learner_goal_set",
  "model_bridge",
  "post_bridge_transfer_check",
  "post_bridge_transfer_decision",
  "post_bridge_transfer_skipped",
  "repair",
  "repair_dialogue_turn",
  "repair_hint_requested",
  "repair_recovery_turn",
  "route_generated",
  "spaced_redrill",
  "strong_cold_path",
  "substrate_confirmed",
  "substrate_refinement",
  "substrate_seed_offered",
  "substrate_support_exhausted",
];

const persistedFieldsByType = {
  cold_attempt: ["text", "evaluation", "kc_id"],
  cold_help_turn: [
    "turn_index",
    "text",
    "answer_mode",
    "score_eligible",
    "classification",
    "routing",
    "help_request_reason",
    "graph_neutral",
    "kc_id",
  ],
  cold_support_exhausted: ["help_turns", "reason", "graph_neutral", "kc_id"],
  evidence_hold_recorded: [
    "phase",
    "graph_neutral",
    "score_eligible",
    "kc_id",
    "hold_event",
    "state",
    "reason",
  ],
  gap_identified: [
    "surface",
    "gap_id",
    "cue",
    "gap_log",
    "repair_scaffold",
    "prompt",
    "graph_neutral",
  ],
  launch_attempt: ["concept", "concept_id", "learner_goal", "text"],
  learner_goal_set: ["learner_goal", "graph_neutral", "score_eligible"],
  post_bridge_transfer_check: [
    "text",
    "prompt",
    "target_missing_operation",
    "evaluation",
    "graph_neutral",
    "score_eligible",
    "at",
    "kc_id",
  ],
  post_bridge_transfer_decision: [
    "run_gap",
    "graph_neutral",
    "score_eligible",
    "kc_id",
  ],
  post_bridge_transfer_skipped: [
    "graph_neutral",
    "score_eligible",
    "at",
    "kc_id",
  ],
  repair_dialogue_turn: [
    "gap_id",
    "turn_index",
    "text",
    "bridge_ready",
    "graph_neutral",
    "score_eligible",
    "kc_id",
  ],
  repair_hint_requested: [
    "gap_id",
    "turn_index",
    "text",
    "graph_neutral",
    "score_eligible",
    "kc_id",
  ],
  route_generated: [
    "first_node",
    "node_ids",
    "provisional_map",
    "map_displayed",
    "substrate_adequacy",
    "retry_count",
    "retry_reasons",
  ],
  spaced_redrill: ["text", "evaluation", "kc_id"],
};

const requiredFieldsByType = {
  cold_attempt: ["text", "evaluation", "kc_id"],
  evidence_hold_recorded: ["hold_event", "state", "reason", "kc_id"],
  launch_attempt: ["concept", "concept_id", "text"],
  post_bridge_transfer_check: ["text", "evaluation", "kc_id"],
  post_bridge_transfer_decision: ["run_gap", "kc_id"],
  repair_dialogue_turn: ["turn_index", "kc_id"],
  route_generated: [
    "first_node",
    "node_ids",
    "provisional_map",
    "map_displayed",
    "substrate_adequacy",
    "retry_count",
    "retry_reasons",
  ],
  spaced_redrill: ["text", "evaluation", "kc_id"],
};

export const EVENT_FACT_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    KNOWN_EVENT_TYPES.map((type) => [
      type,
      define(type, {
        graph_neutral: graphNeutral.includes(type),
        score_eligible: scoreEligible.includes(type),
        learner_text: learnerText.includes(type),
        routing_fact: routingFacts.includes(type),
        requires_kc_id: kcRequired.includes(type),
        replay_relevant: replayRelevant.includes(type),
        persisted_fields: persistedFieldsByType[type] || [],
        required_fields: requiredFieldsByType[type] || [],
      }),
    ]),
  ),
);

export const EVENT_FACT_TYPES = Object.freeze(Object.keys(EVENT_FACT_DEFINITIONS));

export function eventDefinition(type) {
  const definition = EVENT_FACT_DEFINITIONS[type];
  if (!definition) {
    throw new Error(`unknown SEDA event type: ${type}`);
  }
  return definition;
}

export function assertEventInvariants(event) {
  const definition = eventDefinition(event?.type);
  if (definition.requires_kc_id && !event.kc_id) {
    throw new Error(`${event.type} requires kc_id`);
  }
  if (event.graph_neutral === true && event.score_eligible === true) {
    throw new Error(`${event.type} cannot be both graph-neutral and score-eligible`);
  }
  for (const field of definition.required_fields) {
    if (!(field in event)) {
      throw new Error(`${event.type} missing required field: ${field}`);
    }
  }
  return event;
}

export function buildEvent(type, fields = {}) {
  return assertEventInvariants({ type, ...fields });
}

export const eventBuilders = Object.freeze({
  bridgeError: (fields) =>
    buildEvent("bridge_error", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  coldAttempt: ({ text, evaluation, kc_id }) =>
    buildEvent("cold_attempt", { text, evaluation, kc_id }),
  coldHelpTurn: (fields) =>
    buildEvent("cold_help_turn", {
      score_eligible: false,
      graph_neutral: true,
      ...fields,
    }),
  coldSupportExhausted: (fields) =>
    buildEvent("cold_support_exhausted", {
      graph_neutral: true,
      ...fields,
    }),
  evidenceHoldRecorded: (fields) =>
    buildEvent("evidence_hold_recorded", {
      phase: "spaced_redrill",
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  gapIdentified: (fields) =>
    buildEvent("gap_identified", {
      graph_neutral: true,
      ...fields,
    }),
  idleExit: () => buildEvent("idle_exit"),
  idleNewConcept: (fields) => buildEvent("idle_new_concept", fields),
  idleRedrill: () => buildEvent("idle_redrill"),
  launchAttempt: ({ concept, concept_id, learner_goal, text }) =>
    buildEvent("launch_attempt", { concept, concept_id, learner_goal, text }),
  learnerGoalSet: ({ learner_goal }) =>
    buildEvent("learner_goal_set", {
      learner_goal,
      graph_neutral: true,
      score_eligible: false,
    }),
  metaTurn: (fields) =>
    buildEvent("meta_turn", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  modelBridge: (fields) =>
    buildEvent("model_bridge", {
      graph_neutral: true,
      ...fields,
    }),
  postBridgeTransferCheck: (fields) =>
    buildEvent("post_bridge_transfer_check", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  postBridgeTransferDecision: (fields) =>
    buildEvent("post_bridge_transfer_decision", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  postBridgeTransferSkipped: (fields) =>
    buildEvent("post_bridge_transfer_skipped", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  repair: (fields) =>
    buildEvent("repair", {
      graph_neutral: true,
      ...fields,
    }),
  repairAbandoned: (fields) =>
    buildEvent("repair_abandoned", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  repairCapSelected: (fields) =>
    buildEvent("repair_cap_selected", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  repairDialogueTurn: (fields) =>
    buildEvent("repair_dialogue_turn", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  repairHintRequested: (fields) =>
    buildEvent("repair_hint_requested", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  repairRecoveryClosed: (fields) =>
    buildEvent("repair_recovery_closed", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  repairRecoveryStarted: (fields) =>
    buildEvent("repair_recovery_started", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  repairRecoveryTurn: (fields) =>
    buildEvent("repair_recovery_turn", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  repairStateBucketed: (fields) =>
    buildEvent("repair_state_bucketed", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  routeGenerated: (fields) => buildEvent("route_generated", fields),
  routeRetry: (fields) =>
    buildEvent("route_retry", {
      graph_neutral: true,
      ...fields,
    }),
  spacedRedrill: ({ text, evaluation, kc_id }) =>
    buildEvent("spaced_redrill", { text, evaluation, kc_id }),
  spacingAdvanced: (fields) => buildEvent("spacing_advanced", fields),
  strongColdPath: (fields) =>
    buildEvent("strong_cold_path", {
      graph_neutral: true,
      ...fields,
    }),
  substrateConfirmed: (fields) =>
    buildEvent("substrate_confirmed", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  substrateRefinement: (fields) =>
    buildEvent("substrate_refinement", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  substrateSeedOffered: (fields) =>
    buildEvent("substrate_seed_offered", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
  substrateSupportExhausted: (fields) =>
    buildEvent("substrate_support_exhausted", {
      graph_neutral: true,
      score_eligible: false,
      ...fields,
    }),
});
