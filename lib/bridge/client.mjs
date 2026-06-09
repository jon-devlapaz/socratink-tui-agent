import { spawnSync } from "node:child_process";
import { eventBuilders } from "../seda/event-facts.mjs";

export function createBridgeClient({
  workspaceRoot,
  bridgePath,
  python,
  envOverrides = null,
}) {
  const spawnEnv =
    envOverrides && Object.keys(envOverrides).length
      ? { ...process.env, ...envOverrides }
      : null;
  function runBridge(action, payload) {
    const result = spawnSync(python, [bridgePath, action], {
      cwd: workspaceRoot,
      input: JSON.stringify(payload),
      encoding: "utf8",
      ...(spawnEnv ? { env: spawnEnv } : {}),
    });
    let parsed;
    try {
      parsed = JSON.parse(result.stdout || "{}");
    } catch {
      parsed = null;
    }
    return { parsed, status: result.status, stderr: result.stderr };
  }

  function callBridge(action, payload) {
    const result = runBridge(action, payload);
    if (!result.parsed) {
      const bridgeError = new Error("bridge returned non-json output");
      bridgeError.error = "BridgeNonJson";
      bridgeError.action = action;
      throw bridgeError;
    }
    if (result.status !== 0) {
      const bridgeError = new Error(
        result.parsed.message || result.stderr || "bridge exited nonzero",
      );
      bridgeError.error = result.parsed.error || "BridgeExitNonZero";
      bridgeError.action = action;
      throw bridgeError;
    }
    return result.parsed;
  }

  function callBridgeResult(action, payload) {
    const result = runBridge(action, payload);
    if (!result.parsed) {
      return {
        ok: false,
        error: "BridgeNonJson",
        message: "bridge returned non-json output",
      };
    }
    if (result.status !== 0) {
      return {
        ok: false,
        error: result.parsed.error || "BridgeExitNonZero",
        message:
          result.parsed.message || result.stderr || "bridge exited nonzero",
      };
    }
    return { ok: true, payload: result.parsed };
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
