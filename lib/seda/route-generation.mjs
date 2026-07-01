import {
  isRetryableRouteError,
  routeRetryEvent,
} from "../bridge/client.mjs";
import {
  invalidBridgeError,
  resultToBridgeError,
  validateRoutePayload,
} from "./bridge-fail-closed.mjs";

function fallbackRoute({ concept, learnerGoal, launchAttempt }) {
  const label = String(concept || "Concept").trim() || "Concept";
  const thesis = learnerGoal || `Explain the basic mechanism behind ${label}.`;
  return {
    provisional_map: {
      metadata: { core_thesis: thesis },
      backbone: [
        {
          id: "b1",
          principle: "A process changes a starting state into an outcome.",
          dependent_clusters: ["c1"],
        },
      ],
      clusters: [
        {
          id: "c1",
          label,
          subnodes: [
            {
              id: "c1_s1",
              label,
              learner_scaffold: {
                task_label: "Explain the before-change-after mechanism",
              },
            },
          ],
        },
      ],
    },
    first_node: {
      id: "c1_s1",
      kc_id: "c1_s1",
      label,
      mechanism: launchAttempt || thesis,
      learner_prompt:
        "Explain the before state, the change, and the result in your own words.",
      evidence_goal:
        "Learner reconstructs the before-change-after mechanism without answer leakage.",
    },
    llm_call: {
      provider: "orchestrator",
      model: "route-fallback",
      latency_ms: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  };
}

export function generateRouteWithRetry({
  callBridgeResult,
  concept,
  learnerGoal,
  launchAttempt,
  substrateAdequacy = "adequate",
  logRawLlm,
  events,
  section,
}) {
  const retryReasons = [];
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = callBridgeResult("generate-route", {
      concept,
      learner_goal: learnerGoal || null,
      launch_attempt: launchAttempt,
      substrate_adequacy: substrateAdequacy,
      log_raw_llm: logRawLlm,
      route_attempt: attempt,
      route_retry_reason: retryReasons.at(-1)?.message || null,
    });
    if (result.ok) {
      const invalid = validateRoutePayload(result.payload);
      if (invalid) {
        return {
          route: null,
          retryReasons,
          bridgeError: invalidBridgeError({
            action: "generate-route",
            phase: "route",
            reason: invalid,
          }),
        };
      }
      return {
        route: result.payload,
        retryReasons,
        bridgeError: null,
      };
    }
    if (!isRetryableRouteError(result) || attempt === maxAttempts) {
      if (isRetryableRouteError(result)) {
        retryReasons.push({
          attempt,
          error: result.error || "route_generation_failed",
          message: result.message || "",
          fallback: "generic_before_change_after_prompt",
        });
        return {
          route: fallbackRoute({ concept, learnerGoal, launchAttempt }),
          retryReasons,
          bridgeError: null,
        };
      }
      return {
        route: null,
        retryReasons,
        bridgeError: resultToBridgeError({
          result,
          action: "generate-route",
          phase: "route",
          retryable: isRetryableRouteError(result),
          attempts: attempt,
        }),
      };
    }
    const event = routeRetryEvent(result, attempt);
    retryReasons.push({
      attempt,
      error: event.error,
      message: event.message,
    });
    events.push(event);
    console.log(
      `${section("route", "Route Retry")} ${event.error}: ${event.message}`,
    );
  }
  return {
    route: null,
    retryReasons,
    bridgeError: resultToBridgeError({
      result: {
        error: "route-generation-failed",
        message: "route generation failed",
      },
      action: "generate-route",
      phase: "route",
      attempts: maxAttempts,
    }),
  };
}
