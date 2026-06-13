import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { EVENT_FACT_DEFINITIONS, EVENT_FACT_TYPES } from "../seda/event-facts.mjs";
import { DIRECT_PHASE, MAX_REPAIR_TURNS } from "../seda/next-phase.mjs";

export const GATE_GROUPS = Object.freeze([
  { id: "setup", label: "Setup / Idle" },
  { id: "substrate", label: "Substrate" },
  { id: "route", label: "Route" },
  { id: "cold", label: "Cold Evidence" },
  { id: "repair", label: "Repair" },
  { id: "bridge_transfer", label: "Bridge / Transfer" },
  { id: "spacing_redrill", label: "Spacing / Redrill" },
  { id: "failure", label: "Failure / Diagnostic" },
]);

const GROUP_ORDER = Object.freeze(Object.fromEntries(GATE_GROUPS.map((group, index) => [group.id, index])));

const CONDITIONAL_NEXT_PHASE = Object.freeze({
  cold_attempt: "solid -> strong_cold_path; otherwise -> delta",
  repair_dialogue_turn: `bridge_ready -> repair; abandon or turn_index >= ${MAX_REPAIR_TURNS} -> repair_abandoned; otherwise -> repair_dialogue`,
  repair_abandoned: "next_step=recovery_prompt -> repair_recovery; otherwise -> idle",
  repair_recovery_closed: "next_phase=repair -> repair; otherwise -> idle",
});

const EVENT_DOCS = Object.freeze({
  default: ["lib/seda/event-facts.mjs", "lib/seda/next-phase.mjs", "HARNESS.md"],
  substrate: ["docs/adr/0001-substrate-gate-before-route.md", "lib/seda/handlers/substrate-gate.mjs"],
  route: ["lib/seda/handlers/route.mjs", "lib/seda/route-generation.mjs"],
  cold: ["lib/seda/handlers/cold-attempt.mjs", "lib/seda/cold-gating.mjs"],
  repair: ["lib/seda/handlers/repair-dialogue.mjs", "lib/seda/repair-policy.mjs"],
  bridge_transfer: [
    "lib/seda/handlers/model-bridge.mjs",
    "lib/seda/handlers/post-bridge-transfer.mjs",
  ],
  spacing_redrill: ["lib/seda/handlers/spaced-redrill.mjs", "lib/seda/evidence-hold.mjs"],
  failure: ["lib/seda/bridge-fail-closed.mjs", "lib/bridge/client.mjs"],
});

function registryPath() {
  return fileURLToPath(new URL("../bridge/registry.json", import.meta.url));
}

function loadRegistry() {
  return JSON.parse(fs.readFileSync(registryPath(), "utf8"));
}

function bridgeActionsByEvent(registry = loadRegistry()) {
  const actions = {};
  for (const [action, config] of Object.entries(registry.actions || {})) {
    for (const eventType of config.emitted_events || []) {
      actions[eventType] ||= [];
      actions[eventType].push(action);
    }
    for (const mode of Object.values(config.modes || {})) {
      for (const eventType of mode.emitted_events || []) {
        actions[eventType] ||= [];
        actions[eventType].push(action);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(actions).map(([eventType, eventActions]) => [
      eventType,
      [...new Set(eventActions)].sort(),
    ]),
  );
}

function groupFor(type) {
  if (type === "bridge_error") return "failure";
  if (
    type.startsWith("idle_") ||
    type === "learner_goal_set" ||
    type === "launch_attempt" ||
    type === "meta_turn"
  ) {
    return "setup";
  }
  if (type.startsWith("substrate_")) return "substrate";
  if (type.startsWith("route_")) return "route";
  if (type.startsWith("cold_")) return "cold";
  if (
    type.startsWith("repair_") ||
    type === "gap_identified"
  ) {
    return "repair";
  }
  if (type === "model_bridge" || type.startsWith("post_bridge_")) {
    return "bridge_transfer";
  }
  if (
    type === "spaced_redrill" ||
    type === "spacing_advanced" ||
    type === "strong_cold_path" ||
    type === "evidence_hold_recorded"
  ) {
    return "spacing_redrill";
  }
  return "setup";
}

function nextPhaseFor(type, definition) {
  if (!definition.routing_fact) return "not a routing fact";
  if (CONDITIONAL_NEXT_PHASE[type]) return CONDITIONAL_NEXT_PHASE[type];
  if (Object.hasOwn(DIRECT_PHASE, type)) {
    return DIRECT_PHASE[type] === null ? "terminal" : DIRECT_PHASE[type];
  }
  return "conditional or handler-owned";
}

function graphRole(definition) {
  if (definition.score_eligible) return "evidence_candidate";
  if (definition.graph_neutral) return "graph_neutral";
  if (definition.routing_fact) return "routing_context";
  return "context";
}

function authorityFor(definition, bridgeActions) {
  const parts = [];
  if (definition.routing_fact) parts.push("nextPhase(events)");
  if (definition.score_eligible) parts.push("training derivation");
  if (bridgeActions.length) parts.push(`bridge: ${bridgeActions.join(", ")}`);
  if (!parts.length) parts.push("event taxonomy");
  return parts.join(" + ");
}

function whyFor(type, group, definition) {
  if (type === "bridge_error") {
    return "Captures provider or schema failure as a graph-neutral stop without exposing raw bridge output.";
  }
  if (definition.score_eligible) {
    return "Learner reconstruction can feed evidence derivation; it still does not directly solidify graph truth.";
  }
  if (group === "substrate") {
    return "Pre-route context for orienting the map; substrate is explicitly graph-neutral.";
  }
  if (group === "route") {
    return "Provisional map context that selects the first active knowledge component.";
  }
  if (group === "cold") {
    return "Cold-path support or routing around the first genuine learner attempt.";
  }
  if (group === "repair") {
    return "Graph-neutral repair work that prepares an own-words bridge before recognition.";
  }
  if (group === "bridge_transfer") {
    return "Graph-neutral bridge or transfer boundary after repair and before spacing.";
  }
  if (group === "spacing_redrill") {
    return "Spacing, redrill, or evidence-hold boundary used by derivation and reports.";
  }
  return "Session setup, idle, or operator-control fact; not graph truth.";
}

function docsFor(group, bridgeActions) {
  return [
    ...EVENT_DOCS.default,
    ...(EVENT_DOCS[group] || []),
    ...(bridgeActions.length ? ["lib/bridge/registry.json", "HARNESS-TRACEABILITY.md"] : []),
  ].filter((item, index, list) => list.indexOf(item) === index);
}

export function getCanonicalGateMap({ registry = loadRegistry() } = {}) {
  const actionMap = bridgeActionsByEvent(registry);
  const events = EVENT_FACT_TYPES.map((type) => {
    const definition = EVENT_FACT_DEFINITIONS[type];
    const group = groupFor(type);
    const bridgeActions = actionMap[type] || [];
    return {
      type,
      group,
      graph_role: graphRole(definition),
      graph_neutral: definition.graph_neutral,
      score_eligible: definition.score_eligible,
      learner_text: definition.learner_text,
      routing_fact: definition.routing_fact,
      requires_kc_id: definition.requires_kc_id,
      replay_relevant: definition.replay_relevant,
      persisted_fields: [...definition.persisted_fields],
      required_fields: [...definition.required_fields],
      next_phase: nextPhaseFor(type, definition),
      bridge_actions: bridgeActions,
      authority: authorityFor(definition, bridgeActions),
      why_it_exists: whyFor(type, group, definition),
      docs: docsFor(group, bridgeActions),
    };
  }).sort((a, b) => {
    const groupDelta = GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
    if (groupDelta !== 0) return groupDelta;
    return EVENT_FACT_TYPES.indexOf(a.type) - EVENT_FACT_TYPES.indexOf(b.type);
  });

  return {
    version: "canonical-gates-v1",
    doctrine: [
      "Context is not evidence.",
      "Only cold_attempt and spaced_redrill are evidence candidates.",
      "Graph truth is derived, not judged.",
      "handlers -> events.append(...) -> nextPhase(events)",
    ],
    groups: GATE_GROUPS.map((group) => ({
      ...group,
      count: events.filter((event) => event.group === group.id).length,
    })),
    events,
    sources: [
      "lib/seda/event-facts.mjs",
      "lib/seda/next-phase.mjs",
      "lib/bridge/registry.json",
      "lib/lab/loop-rubric.mjs",
    ],
  };
}
