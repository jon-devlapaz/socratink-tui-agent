/**
 * Per-session tutor model override (operator dogfood chrome).
 *
 * Single owner for: the curated model catalog (/health llm_options), the
 * override gate (env flag + loopback, like /lab), selection validation,
 * and the env-var shape handed to the bridge subprocess. Override is
 * transport/infra only — never an event type and never a nextPhase input.
 */
import { isLoopbackRequest } from "../lab/lab-access.mjs";
import {
  endpointApiKey,
  endpointBaseUrl,
  endpointConfigured,
  endpointDefaultModel,
  endpointOptionLabel,
  normalizeCompatTarget,
} from "../model-endpoints.mjs";

const LOCAL_PROVIDERS = new Set(["openai_compatible"]);
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const MAX_MODEL_ID_LENGTH = 128;

function llmOptionLabel(provider, model, target = null) {
  if (!LOCAL_PROVIDERS.has(provider)) return `live · ${model}`;
  return endpointOptionLabel(target, model);
}

function geminiConfigured(env) {
  return Boolean((env.GEMINI_API_KEY || "").trim());
}

function compatibleDefaultModel(env) {
  return endpointDefaultModel("router", env);
}

function lmStudioDefaultModel(env) {
  return endpointDefaultModel("lmstudio", env);
}

export function activeLlm(env = process.env) {
  const provider = (env.LLM_PROVIDER || "gemini").trim().toLowerCase();
  return {
    provider,
    model:
      provider === "openai_compatible"
        ? (env.LLM_MODEL || compatibleDefaultModel(env)).trim()
        : (env.LLM_MODEL || "gemini-2.5-flash").trim(),
    ...(provider === "openai_compatible" ? { target: normalizeCompatTarget(env.LLM_TARGET) } : {}),
  };
}

export function isModelOverrideAllowed(req, env = process.env) {
  if (env.SOCRATINK_LOOP_ALLOW_MODEL_OVERRIDE !== "1") return false;
  if (env.SOCRATINK_TUI_FAKE_LLM === "1") return false;
  return isLoopbackRequest(req);
}

export function buildLlmOptions(env = process.env) {
  const options = [];
  if (geminiConfigured(env)) {
    for (const model of GEMINI_MODELS) {
      options.push({
        id: `gemini:${model}`,
        provider: "gemini",
        model,
        label: `live · ${model}`,
      });
    }
  }
  const lmStudioModel = lmStudioDefaultModel(env);
  options.push({
    id: `openai_compatible:lmstudio:${lmStudioModel}`,
    provider: "openai_compatible",
    target: "lmstudio",
    model: lmStudioModel,
    label: llmOptionLabel("openai_compatible", lmStudioModel, "lmstudio"),
  });
  options.push({
    id: "openai_compatible:lmstudio:custom",
    provider: "openai_compatible",
    target: "lmstudio",
    model: null,
    custom: true,
    label: "LM Studio custom…",
  });
  if (endpointConfigured("router", env)) {
    const routerDefault = compatibleDefaultModel(env);
    options.push({
      id: `openai_compatible:router:${routerDefault}`,
      provider: "openai_compatible",
      target: "router",
      model: routerDefault,
      label: llmOptionLabel("openai_compatible", routerDefault, "router"),
    });
    options.push({
      id: "openai_compatible:router:custom",
      provider: "openai_compatible",
      target: "router",
      model: null,
      custom: true,
      label: "FreeLLMAPI custom…",
    });
  }
  const active = activeLlm(env);
  const activeId = `${active.provider}:${active.target || ""}:${active.model}`;
  if (!options.some((option) => option.id === activeId)) {
    options.unshift({
      id: activeId,
      provider: active.provider,
      target: active.target,
      model: active.model,
      label: llmOptionLabel(active.provider, active.model, active.target),
    });
  }
  return options;
}

export function validateLlmSelection(selection, env = process.env) {
  if (!selection || typeof selection !== "object") {
    return { ok: false, error: "llm selection required" };
  }
  const provider = String(selection.provider || "").trim().toLowerCase();
  const model = String(selection.model || "").trim();
  if (!provider || !model) {
    return { ok: false, error: "llm provider and model are required" };
  }
  if (model.length > MAX_MODEL_ID_LENGTH) {
    return { ok: false, error: "model id too long" };
  }
  if (provider === "gemini") {
    if (!geminiConfigured(env)) {
      return { ok: false, error: "gemini is not configured on this server" };
    }
    if (!GEMINI_MODELS.includes(model)) {
      return { ok: false, error: `unknown gemini model '${model}'` };
    }
    return { ok: true, llm: { provider, model } };
  }
  if (LOCAL_PROVIDERS.has(provider)) {
    const target = normalizeCompatTarget(selection.target);
    if (target === "router" && !endpointConfigured("router", env)) {
      return {
        ok: false,
        error: "FreeLLMAPI is not configured (set LLM_ROUTER_BASE_URL)",
      };
    }
    if (target === "lmstudio" && !endpointConfigured("lmstudio", env)) {
      return { ok: false, error: "LM Studio base URL missing" };
    }
    // Free-text model ids are intentionally allowed; router and local model names
    // are arbitrary. The session selects a target, while base URL/API key remain
    // resolved from server-owned env.
    return { ok: true, llm: { provider, target, model } };
  }
  return { ok: false, error: `unsupported provider '${provider}'` };
}

export function llmEnvOverrides(llm) {
  if (!llm?.provider || !llm?.model) return null;
  if (llm.provider !== "openai_compatible") {
    return { LLM_PROVIDER: llm.provider, LLM_MODEL: llm.model };
  }
  const target = normalizeCompatTarget(llm.target);
  if (target === "lmstudio") {
    return {
      LLM_PROVIDER: llm.provider,
      LLM_TARGET: target,
      LLM_MODEL: llm.model,
      LLM_BASE_URL: endpointBaseUrl(target, process.env),
      LLM_API_KEY: endpointApiKey(target, process.env),
    };
  }
  return {
    LLM_PROVIDER: llm.provider,
    LLM_TARGET: target,
    LLM_MODEL: llm.model,
    LLM_BASE_URL: endpointBaseUrl(target, process.env),
    LLM_API_KEY: endpointApiKey(target, process.env),
  };
}
