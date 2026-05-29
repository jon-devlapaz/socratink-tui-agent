import { spawnSync } from "node:child_process";

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
      throw new Error(
        `bridge returned non-json output: ${result.stdout || result.stderr}`,
      );
    }
    if (result.status !== 0) {
      throw new Error(
        `${parsed.error || "bridge-error"}: ${parsed.message || result.stderr}`,
      );
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
        message: result.stdout || result.stderr,
      };
    }
    if (result.status !== 0) {
      return {
        ok: false,
        error: parsed.error || "bridge-error",
        message: parsed.message || result.stderr,
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
  return {
    type: "route_retry",
    attempt,
    error: error.error || "route_generation_failed",
    message: error.message || "",
    graph_neutral: true,
    retry_guardrail:
      "regenerate learner scaffold without copying hidden mechanism answer phrases",
  };
}
