import { EVENT_FACT_DEFINITIONS } from "./event-facts.mjs";

export const CANONICAL_EVENT_TAXONOMY_VERSION =
  "learner-loop-event-taxonomy-v1";

const V1 = "v1";
const FORBIDDEN_PUBLIC_TERM_PARTS = Object.freeze([["Repair", " Reps"]]);

const LEGACY_TO_CANONICAL = Object.freeze({
  idle_new_concept: ["loop_started"],
  launch_attempt: ["loop_started"],
  substrate_seed_offered: ["substrate_seed_requested", "substrate_seed_shown"],
  substrate_refinement: ["substrate_refinement_submitted"],
  substrate_confirmed: ["substrate_confirmed"],
  route_generated: ["cold_attempt_prompted"],
  cold_attempt: ["cold_attempt_submitted", "cold_attempt_evaluated"],
  gap_identified: ["repair_prompted"],
  repair_dialogue_turn: ["repair_submitted"],
  repair: ["repair_submitted"],
  model_bridge: ["bridge_prompted"],
  post_bridge_transfer_check: ["bridge_submitted"],
  gap_drill: ["bridge_submitted"],
  spacing_advanced: ["spaced_redrill_scheduled"],
  spaced_redrill: ["spaced_redrill_submitted", "case_completed"],
  evidence_hold_recorded: ["evidence_hold_recorded"],
  meta_turn: ["meta_requested", "meta_returned"],
});

const ONE_TO_ONE_RUNTIME_DEFAULT_SOURCE_TYPES = new Set([
  "substrate_refinement",
  "substrate_confirmed",
  "gap_identified",
  "repair_dialogue_turn",
  "repair",
  "model_bridge",
  "post_bridge_transfer_check",
  "evidence_hold_recorded",
]);

function runtimeDefaultsForSource(canonicalType, sourceType) {
  const canonicalTypes = LEGACY_TO_CANONICAL[sourceType] || [];
  const runtimeDefinition = EVENT_FACT_DEFINITIONS[sourceType];
  if (
    canonicalTypes.length === 1 &&
    canonicalTypes[0] === canonicalType &&
    ONE_TO_ONE_RUNTIME_DEFAULT_SOURCE_TYPES.has(sourceType) &&
    runtimeDefinition
  ) {
    return {
      graph_neutral: runtimeDefinition.graph_neutral,
      score_eligible: runtimeDefinition.score_eligible,
    };
  }
  return null;
}

function runtimeDefaultsForDefinition(canonicalType, sourceEventTypes) {
  if (sourceEventTypes.length !== 1) return null;
  return runtimeDefaultsForSource(canonicalType, sourceEventTypes[0]);
}

function def(eventType, options = {}) {
  const sourceEventTypes = options.source_event_types || [];
  const runtimeDefaults = runtimeDefaultsForDefinition(eventType, sourceEventTypes);
  return {
    event_type: eventType,
    event_version: V1,
    graph_neutral: options.graph_neutral ?? runtimeDefaults?.graph_neutral ?? true,
    score_eligible: options.score_eligible ?? runtimeDefaults?.score_eligible ?? false,
    source_event_types: sourceEventTypes,
    staged: Boolean(options.staged),
  };
}

export const CANONICAL_LEARNER_LOOP_EVENTS = Object.freeze({
  loop_started: def("loop_started", {
    source_event_types: ["idle_new_concept", "launch_attempt"],
  }),
  source_submitted: def("source_submitted", {
    source_event_types: [],
    staged: true,
  }),
  goal_submitted: def("goal_submitted", {
    source_event_types: [],
    staged: true,
  }),
  substrate_seed_requested: def("substrate_seed_requested", {
    source_event_types: ["substrate_seed_offered"],
  }),
  substrate_seed_shown: def("substrate_seed_shown", {
    source_event_types: ["substrate_seed_offered"],
  }),
  substrate_refinement_submitted: def("substrate_refinement_submitted", {
    source_event_types: ["substrate_refinement"],
  }),
  substrate_confirmed: def("substrate_confirmed", {
    source_event_types: ["substrate_confirmed"],
  }),
  cold_attempt_prompted: def("cold_attempt_prompted", {
    source_event_types: ["route_generated"],
  }),
  cold_attempt_submitted: def("cold_attempt_submitted", {
    graph_neutral: false,
    score_eligible: true,
    source_event_types: ["cold_attempt"],
  }),
  cold_attempt_evaluated: def("cold_attempt_evaluated", {
    graph_neutral: false,
    score_eligible: true,
    source_event_types: ["cold_attempt"],
  }),
  repair_prompted: def("repair_prompted", {
    source_event_types: ["gap_identified"],
  }),
  repair_submitted: def("repair_submitted", {
    source_event_types: ["repair_dialogue_turn", "repair"],
  }),
  bridge_prompted: def("bridge_prompted", {
    source_event_types: ["model_bridge"],
  }),
  bridge_submitted: def("bridge_submitted", {
    source_event_types: ["post_bridge_transfer_check", "gap_drill"],
  }),
  case_completed: def("case_completed", {
    graph_neutral: false,
    score_eligible: true,
    source_event_types: ["spaced_redrill"],
  }),
  spaced_redrill_scheduled: def("spaced_redrill_scheduled", {
    source_event_types: ["spacing_advanced"],
  }),
  spaced_redrill_submitted: def("spaced_redrill_submitted", {
    graph_neutral: false,
    score_eligible: true,
    source_event_types: ["spaced_redrill"],
  }),
  evidence_hold_recorded: def("evidence_hold_recorded", {
    source_event_types: ["evidence_hold_recorded"],
  }),
  meta_requested: def("meta_requested", {
    source_event_types: ["meta_turn"],
  }),
  meta_returned: def("meta_returned", {
    source_event_types: ["meta_turn"],
  }),
});

const DEFAULT_PHASE_BY_CANONICAL = Object.freeze({
  loop_started: "ignition",
  source_submitted: "ignition",
  goal_submitted: "ignition",
  substrate_seed_requested: "substrate_gate",
  substrate_seed_shown: "substrate_gate",
  substrate_refinement_submitted: "substrate_gate",
  substrate_confirmed: "substrate_gate",
  cold_attempt_prompted: "cold_attempt",
  cold_attempt_submitted: "cold_attempt",
  cold_attempt_evaluated: "cold_attempt",
  repair_prompted: "delta",
  repair_submitted: "repair_dialogue",
  bridge_prompted: "model_bridge",
  bridge_submitted: "post_bridge_transfer",
  case_completed: "spaced_redrill",
  spaced_redrill_scheduled: "spacing",
  spaced_redrill_submitted: "spaced_redrill",
  evidence_hold_recorded: "spaced_redrill",
  meta_requested: null,
  meta_returned: null,
});

function nullable(value) {
  return value === undefined ? null : value;
}

function taxonomyDefinition(eventType) {
  const definition = CANONICAL_LEARNER_LOOP_EVENTS[eventType];
  if (!definition) {
    throw new Error(`unknown canonical event type: ${eventType}`);
  }
  return definition;
}

function scoreEligibleFor(canonicalType, legacyEvent, definition) {
  if (
    canonicalType === "cold_attempt_submitted" ||
    canonicalType === "cold_attempt_evaluated" ||
    canonicalType === "spaced_redrill_submitted" ||
    canonicalType === "case_completed"
  ) {
    return (legacyEvent.score_eligible ?? legacyEvent.evaluation?.score_eligible) !== false;
  }
  return definition.score_eligible;
}

function staticDefaultsFor(canonicalType, legacyEvent, definition) {
  const runtimeDefaults = runtimeDefaultsForSource(canonicalType, legacyEvent?.type);
  if (runtimeDefaults) return runtimeDefaults;
  return {
    graph_neutral: definition.graph_neutral,
    score_eligible: scoreEligibleFor(canonicalType, legacyEvent, definition),
  };
}

function payloadFor(canonicalType, legacyEvent) {
  if (
    canonicalType === "substrate_seed_requested" ||
    canonicalType === "substrate_seed_shown"
  ) {
    return {
      legacy_event_type: legacyEvent.type,
      seed: nullable(legacyEvent.seed),
      refinement_prompt: nullable(legacyEvent.refinement_prompt),
      substrate_classification: nullable(legacyEvent.substrate_classification),
      judge_reason: nullable(legacyEvent.judge_reason),
    };
  }

  const {
    type,
    graph_neutral: _graphNeutral,
    score_eligible: _scoreEligible,
    event_type: _eventType,
    event_version: _eventVersion,
    session_id: _sessionId,
    case_id: _caseId,
    payload: _payload,
    ...rest
  } = legacyEvent;
  return {
    legacy_event_type: type,
    ...rest,
  };
}

export function canonicalizeEvent(legacyEvent, meta = {}) {
  const canonicalTypes = LEGACY_TO_CANONICAL[legacyEvent?.type] || [];
  return canonicalTypes.map((canonicalType) => {
    const definition = taxonomyDefinition(canonicalType);
    const staticDefaults = staticDefaultsFor(canonicalType, legacyEvent, definition);
    return {
      event_type: canonicalType,
      event_version: definition.event_version,
      session_id: nullable(meta.sessionId ?? meta.session_id),
      case_id: nullable(meta.caseId ?? meta.case_id),
      kc_id: nullable(legacyEvent.kc_id ?? legacyEvent.node_id),
      phase:
        legacyEvent.phase === undefined
          ? DEFAULT_PHASE_BY_CANONICAL[canonicalType]
          : legacyEvent.phase,
      timestamp: nullable(legacyEvent.timestamp ?? legacyEvent.at),
      graph_neutral: staticDefaults.graph_neutral,
      score_eligible: staticDefaults.score_eligible,
      payload: payloadFor(canonicalType, legacyEvent),
    };
  });
}

export function canonicalEventsForSession(session = {}) {
  const meta = {
    sessionId: session.session_id ?? session.id,
    caseId: session.case_id,
  };
  return (session.events || []).flatMap((event) => canonicalizeEvent(event, meta));
}

export function assertPublicVocabularySafe(text) {
  const value = String(text || "");
  for (const parts of FORBIDDEN_PUBLIC_TERM_PARTS) {
    const term = parts.join("");
    if (new RegExp(`\\b${term}\\b`, "i").test(value)) {
      throw new Error(`public-vocabulary-forbidden:${term}`);
    }
  }
}
