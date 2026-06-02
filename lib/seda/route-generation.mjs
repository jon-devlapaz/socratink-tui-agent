import {
  isRetryableRouteError,
  routeRetryEvent,
} from "../bridge/client.mjs";

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
      return {
        route: result.payload,
        retryReasons,
      };
    }
    if (!isRetryableRouteError(result) || attempt === maxAttempts) {
      throw new Error(
        `${result.error || "route-generation-failed"}: ${result.message || ""}`,
      );
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
  throw new Error("route-generation-failed");
}
