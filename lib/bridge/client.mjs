import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { eventBuilders } from "../seda/event-facts.mjs";

const MAX_DIAGNOSTIC_TEXT_CHARS = 20_000;
const DEFAULT_BRIDGE_TIMEOUT_MS = 45_000;
const SECRET_ENV_KEYS = /(?:API|TOKEN|KEY|SECRET|PASSWORD|AUTH)/i;

function truncate(value, limit = MAX_DIAGNOSTIC_TEXT_CHARS) {
  const text = String(value ?? "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]`;
}

function redactValue(key, value) {
  if (value == null) return value;
  if (SECRET_ENV_KEYS.test(key)) return "[redacted]";
  return value;
}

function diagnosticEnv(env) {
  const source = env || process.env;
  const keys = [
    "LLM_PROVIDER",
    "LLM_TARGET",
    "LLM_MODEL",
    "LLM_BASE_URL",
    "LLM_ROUTER_BASE_URL",
    "LM_STUDIO_BASE_URL",
    "PERSONA_LLM_PROVIDER",
    "PERSONA_LLM_TARGET",
    "PERSONA_LLM_MODEL",
    "PERSONA_LLM_BASE_URL",
  ];
  return Object.fromEntries(
    keys
      .filter((key) => source[key] != null)
      .map((key) => [key, redactValue(key, source[key])]),
  );
}

function diagnosticId(action) {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const safeAction = String(action || "bridge").replace(/[^a-z0-9_-]+/gi, "-");
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${stamp}-${safeAction}-${suffix}`;
}

function writeDiagnostic({
  diagnosticsDir,
  action,
  payload,
  result,
  parsed,
  spawnEnv,
  transportError = null,
  durationMs = null,
  timeoutMs = null,
}) {
  if (!diagnosticsDir) return null;
  fs.mkdirSync(diagnosticsDir, { recursive: true });
  const id = diagnosticId(action);
  const filePath = path.join(diagnosticsDir, `${id}.json`);
  const diagnostic = {
    id,
    created_at: new Date().toISOString(),
    action,
    status: result.status,
    signal: result.signal || null,
    error: transportError?.error || parsed?.error || (parsed ? null : "BridgeNonJson"),
    message:
      transportError?.message ||
      parsed?.message ||
      (parsed ? "" : "bridge returned non-json output"),
    duration_ms: durationMs,
    timeout_ms: timeoutMs,
    env: diagnosticEnv(spawnEnv),
    request: {
      keys: Object.keys(payload || {}).sort(),
      log_raw_llm: Boolean(payload?.log_raw_llm),
    },
    bridge: {
      stderr: truncate(result.stderr || ""),
      stdout: truncate(result.stdout || ""),
      parsed: parsed
        ? {
            error: parsed.error || null,
            message: parsed.message || null,
            diagnostic: parsed.diagnostic
              ? {
                  ...parsed.diagnostic,
                  raw_text: truncate(parsed.diagnostic.raw_text || ""),
                }
              : null,
          }
        : null,
    },
  };
  fs.writeFileSync(filePath, `${JSON.stringify(diagnostic, null, 2)}\n`, "utf8");
  return { id, path: filePath };
}

function normalizeTimeoutMs(raw) {
  if (raw == null || raw === "") return DEFAULT_BRIDGE_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_BRIDGE_TIMEOUT_MS;
  return value;
}

export function createBridgeClient({
  workspaceRoot,
  bridgePath,
  python,
  envOverrides = null,
  diagnosticsDir = null,
  timeoutMs = process.env.SOCRATINK_BRIDGE_TIMEOUT_MS,
}) {
  const bridgeTimeoutMs = normalizeTimeoutMs(timeoutMs);
  const spawnEnv =
    envOverrides && Object.keys(envOverrides).length
      ? { ...process.env, ...envOverrides }
      : null;
  function runBridge(action, payload) {
    const startedAt = Date.now();
    const result = spawnSync(python, [bridgePath, action], {
      cwd: workspaceRoot,
      input: JSON.stringify(payload),
      encoding: "utf8",
      ...(bridgeTimeoutMs > 0
        ? { timeout: bridgeTimeoutMs, killSignal: "SIGTERM" }
        : {}),
      ...(spawnEnv ? { env: spawnEnv } : {}),
    });
    const durationMs = Date.now() - startedAt;
    const timedOut = result.error?.code === "ETIMEDOUT";
    const transportError = timedOut
      ? {
          error: "BridgeTimeout",
          message: `bridge subprocess timed out after ${bridgeTimeoutMs}ms`,
          timeout_ms: bridgeTimeoutMs,
          duration_ms: durationMs,
        }
      : null;
    let parsed;
    try {
      parsed = JSON.parse(result.stdout || "{}");
    } catch {
      parsed = null;
    }
    const diagnostic =
      transportError || !parsed || result.status !== 0
        ? writeDiagnostic({
            diagnosticsDir,
            action,
            payload,
            result,
            parsed,
            spawnEnv,
            transportError,
            durationMs,
            timeoutMs: bridgeTimeoutMs,
          })
        : null;
    return {
      parsed,
      status: result.status,
      stderr: result.stderr,
      diagnostic,
      transportError,
      duration_ms: durationMs,
    };
  }

  function callBridge(action, payload) {
    const result = runBridge(action, payload);
    if (result.transportError) {
      const bridgeError = new Error(result.transportError.message);
      bridgeError.error = result.transportError.error;
      bridgeError.action = action;
      bridgeError.diagnostic = result.diagnostic;
      bridgeError.duration_ms = result.duration_ms;
      bridgeError.timeout_ms = result.transportError.timeout_ms;
      throw bridgeError;
    }
    if (!result.parsed) {
      const bridgeError = new Error("bridge returned non-json output");
      bridgeError.error = "BridgeNonJson";
      bridgeError.action = action;
      bridgeError.diagnostic = result.diagnostic;
      throw bridgeError;
    }
    if (result.status !== 0) {
      const bridgeError = new Error(
        result.parsed.message || result.stderr || "bridge exited nonzero",
      );
      bridgeError.error = result.parsed.error || "BridgeExitNonZero";
      bridgeError.action = action;
      bridgeError.diagnostic = result.diagnostic;
      throw bridgeError;
    }
    return result.parsed;
  }

  function callBridgeResult(action, payload) {
    const result = runBridge(action, payload);
    if (result.transportError) {
      return {
        ok: false,
        error: result.transportError.error,
        message: result.transportError.message,
        diagnostic: result.diagnostic,
        duration_ms: result.duration_ms,
        timeout_ms: result.transportError.timeout_ms,
      };
    }
    if (!result.parsed) {
      return {
        ok: false,
        error: "BridgeNonJson",
        message: "bridge returned non-json output",
        diagnostic: result.diagnostic,
      };
    }
    if (result.status !== 0) {
      return {
        ok: false,
        error: result.parsed.error || "BridgeExitNonZero",
        message:
          result.parsed.message || result.stderr || "bridge exited nonzero",
        diagnostic: result.diagnostic,
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
