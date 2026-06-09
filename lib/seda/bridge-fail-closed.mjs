import { eventBuilders } from "./event-facts.mjs";

const SAFE_ERROR_MESSAGES = {
  BridgeNonJson: "bridge returned non-json output",
  BridgeExitNonZero: "bridge exited nonzero",
  BridgeContractInvalid: "bridge response failed contract validation",
};

function clean(value) {
  return String(value ?? "").trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeBridgeMessage(error, fallback = "bridge failed closed") {
  return SAFE_ERROR_MESSAGES[error] || fallback;
}

export function bridgeErrorEvent({
  action,
  phase,
  error = "BridgeContractInvalid",
  message,
  retryable = false,
  attempts = null,
}) {
  return eventBuilders.bridgeError({
    action,
    phase,
    error,
    message: message || safeBridgeMessage(error),
    retryable: Boolean(retryable),
    attempts,
    bridge_output_revealed: false,
  });
}

export function callBridgeSafely({ bridge, action, payload }) {
  if (typeof bridge.callBridgeResult === "function") {
    try {
      const result = bridge.callBridgeResult(action, payload);
      if (result && typeof result.ok === "boolean") return result;
    } catch (error) {
      if (typeof bridge.callBridge !== "function") {
        return {
          ok: false,
          error: error?.error || error?.name || "BridgeCallFailed",
          message: error?.message || "bridge call failed",
        };
      }
    }
  }
  try {
    return { ok: true, payload: bridge.callBridge(action, payload) };
  } catch (error) {
    return {
      ok: false,
      error: error?.error || error?.name || "BridgeCallFailed",
      message: error?.message || "bridge call failed",
    };
  }
}

export function resultToBridgeError({
  result,
  action,
  phase,
  retryable = false,
  attempts = null,
}) {
  const error = result?.error || "BridgeExitNonZero";
  const detail = clean(result?.message);
  return bridgeErrorEvent({
    action,
    phase,
    error,
    retryable,
    attempts,
    message:
      detail || safeBridgeMessage(error, "bridge transport failed closed"),
  });
}

export function invalidBridgeError({ action, phase, reason }) {
  return bridgeErrorEvent({
    action,
    phase,
    error: "BridgeContractInvalid",
    message: reason
      ? `bridge response failed contract validation: ${reason}`
      : SAFE_ERROR_MESSAGES.BridgeContractInvalid,
  });
}

export function validateSubstrateGatePayload(payload) {
  const decision = payload?.substrate_gate;
  if (!isObject(decision)) return "missing substrate_gate object";
  if (typeof decision.substrate_adequate !== "boolean") {
    return "substrate_gate.substrate_adequate must be boolean";
  }
  if (decision.graph_neutral !== true) {
    return "substrate_gate.graph_neutral must be true";
  }
  if (decision.score_eligible !== false) {
    return "substrate_gate.score_eligible must be false";
  }
  return null;
}

export function validateRoutePayload(route) {
  if (!isObject(route)) return "missing route object";
  if (!isObject(route.provisional_map)) return "missing provisional_map object";
  if (!isObject(route.first_node)) return "missing first_node object";
  if (!clean(route.first_node.id)) return "missing first_node.id";
  if (!clean(route.first_node.learner_prompt)) {
    return "missing first_node.learner_prompt";
  }
  return null;
}

export function validateEvaluationPayload(payload, { requireClassification = false } = {}) {
  const evaluation = payload?.evaluation;
  if (!isObject(evaluation)) return "missing evaluation object";
  if (!clean(evaluation.agent_response)) return "missing evaluation.agent_response";
  if (typeof evaluation.score_eligible !== "boolean") {
    return "evaluation.score_eligible must be boolean";
  }
  if (
    (requireClassification || evaluation.score_eligible === true) &&
    !clean(evaluation.classification)
  ) {
    return "missing evaluation.classification";
  }
  return null;
}

export function validateRepairScaffoldPayload(payload) {
  const scaffold = payload?.repair_scaffold;
  if (!isObject(scaffold)) return "missing repair_scaffold object";
  return null;
}

export function validateSocraticDrillPayload(payload) {
  if (!clean(payload?.socratic_question)) return "missing socratic_question";
  return null;
}

export function validateRepairDialoguePayload(payload) {
  const judge = payload?.repair_dialogue;
  if (!isObject(judge)) return "missing repair_dialogue object";
  if (typeof judge.bridge_ready !== "boolean") {
    return "repair_dialogue.bridge_ready must be boolean";
  }
  if (judge.graph_neutral !== true) {
    return "repair_dialogue.graph_neutral must be true";
  }
  if (judge.score_eligible !== false) {
    return "repair_dialogue.score_eligible must be false";
  }
  return null;
}
