import { spawnSync } from "node:child_process";
import { eventBuilders } from "../seda/event-facts.mjs";

export function createBridgeClient({ workspaceRoot, bridgePath, python }) {
  function callBridge(action, payload) {
    const result = spawnSync(python, [bridgePath, action], {
      cwd: workspaceRoot,
      input: JSON.stringify(payload),
      encoding: "utf8",
    });
    let parsed;
    try {
      parsed = JSON.parse(result.stdout || "{}");
    } catch (error) {
      const bridgeError = new Error("bridge returned non-json output");
      bridgeError.error = "BridgeNonJson";
      bridgeError.action = action;
      throw bridgeError;
    }
    if (result.status !== 0) {
      const bridgeError = new Error(
        parsed.message || result.stderr || "bridge exited nonzero",
      );
      bridgeError.error = parsed.error || "BridgeExitNonZero";
      bridgeError.action = action;
      throw bridgeError;
    }
    return parsed;
  }

  function callBridgeResult(action, payload) {
    const result = spawnSync(python, [bridgePath, action], {
      cwd: workspaceRoot,
      input: JSON.stringify(payload),
      encoding: "utf8",
    });
    let parsed;
    try {
      parsed = JSON.parse(result.stdout || "{}");
    } catch (error) {
      return {
        ok: false,
        error: "BridgeNonJson",
        message: "bridge returned non-json output",
      };
    }
    if (result.status !== 0) {
      return {
        ok: false,
        error: parsed.error || "BridgeExitNonZero",
        message: parsed.message || result.stderr || "bridge exited nonzero",
      };
    }
    return { ok: true, payload: parsed };
  }

  return { callBridge, callBridgeResult };
}

export function isRetryableRouteError(error) {
  return (
    error?.error === "SmallestRouteCapExceeded" ||
    String(error?.message || "").includes("SmallestRouteCapExceeded") ||
    String(error?.message || "").includes("copies hidden mechanism")
  );
}

export function routeRetryEvent(error, attempt) {
  return eventBuilders.routeRetry({
    attempt,
    error: error.error || "route_generation_failed",
    message: error.message || "",
    retry_guardrail:
      "regenerate learner scaffold without copying hidden mechanism answer phrases",
  });
}
