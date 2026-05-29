import { nextPhase } from "./next-phase.mjs";

/** Graph-neutral telemetry appended before the routing event in the same handler turn. */
export const TELEMETRY_ONLY_EVENT_TYPES = new Set([
  "repair_state_bucketed",
  "repair_cap_selected",
  "repair_recovery_started",
  "repair_recovery_turn",
  "repair_hint_requested",
  "route_retry",
]);

/**
 * @param {{ type: string }} event
 */
export function isTelemetryOnlyEvent(event) {
  return TELEMETRY_ONLY_EVENT_TYPES.has(event?.type);
}

/**
 * Walk event prefixes and collect nextPhase after each append.
 * Skips telemetry-only events that never drive nextPhase mid-handler.
 * @param {Array<{ type: string, [key: string]: unknown }>} events
 * @returns {{ ok: boolean, phases: Array<{ afterEventIndex: number, eventType: string, nextPhase: string | null }>, terminalPhase: string | null, error?: string }}
 */
export function simulatePhaseChain(events) {
  const phases = [];
  try {
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      if (isTelemetryOnlyEvent(event)) continue;

      const prefix = events.slice(0, i + 1);
      phases.push({
        afterEventIndex: i,
        eventType: event.type,
        nextPhase: nextPhase(prefix),
      });
    }
    const terminalPhase = nextPhase(events);
    return { ok: true, phases, terminalPhase };
  } catch (error) {
    return {
      ok: false,
      phases,
      terminalPhase: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function getByPath(obj, path) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

/**
 * Cross-check events against registry mode routing field declarations.
 * @param {Array<{ type: string, [key: string]: unknown }>} events
 * @param {import("../bridge/registry.mjs").registry} registry
 */
export function validateRegistryRoutingFields(events, registry) {
  const failures = [];
  const evalAction = registry.actions["evaluate-attempt"];
  const coldMode = evalAction?.modes?.cold_attempt;

  for (const event of events) {
    if (event.type === "cold_attempt" && coldMode?.next_phase_routing_fields?.length) {
      for (const field of coldMode.next_phase_routing_fields) {
        if (getByPath(event, field) === undefined) {
          failures.push(`cold_attempt missing routing field ${field}`);
        }
      }
    }

    if (event.type === "repair_dialogue_turn") {
      const routing = registry.actions["repair-dialogue"]?.next_phase_routing?.[0];
      for (const field of routing?.routing_fields || []) {
        if (field === "turn_index" && event.uncertainty) continue;
        if (event[field] === undefined) {
          failures.push(`repair_dialogue_turn missing routing field ${field}`);
        }
      }
    }
  }

  return failures;
}

/**
 * @param {Array<{ type: string, [key: string]: unknown }>} events
 * @param {import("../bridge/registry.mjs").registry} registry
 */
export function proveRoutingChain(events, registry) {
  const chain = simulatePhaseChain(events);
  if (!chain.ok) return { ...chain, failures: [chain.error] };

  const fieldFailures = validateRegistryRoutingFields(events, registry);
  if (fieldFailures.length) {
    return {
      ok: false,
      phases: chain.phases,
      terminalPhase: chain.terminalPhase,
      failures: fieldFailures,
    };
  }

  return {
    ok: true,
    phases: chain.phases,
    terminalPhase: chain.terminalPhase,
    failures: [],
  };
}
