/**
 * Per-session tutor model override (operator dogfood chrome).
 *
 * Single owner for: the curated model catalog (/health llm_options), the
 * override gate (env flag + loopback, like /lab), selection validation,
 * and the env-var shape handed to the bridge subprocess. Override is
 * transport/infra only — never an event type and never a nextPhase input.
 */
import { isLoopbackRequest } from "../lab/lab-access.mjs";

const LOCAL_PROVIDERS = new Set(["openai_compatible"]);
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const MAX_MODEL_ID_LENGTH = 128;

function normalizeTarget(target) {
  const value = String(target || "").trim().toLowerCase();
  if (value === "local" || value === "lm_studio" || value === "lmstudio") return "lmstudio";
  if (value === "router" || value === "compatible" || value === "openai_compatible") return "router";
  return value || "router";
}

function llmOptionLabel(provider, model, target = null) {
  if (!LOCAL_PROVIDERS.has(provider)) return `live · ${model}`;
  return `${target === "router" ? "FreeLLMAPI" : "LM Studio"} · ${model}`;
}

function geminiConfigured(env) {
  return Boolean((env.GEMINI_API_KEY || "").trim());
}

function routerBaseUrl(env) {
  return (env.LLM_ROUTER_BASE_URL || "").trim();
}

function localModel(env) {
  return (env.LM_STUDIO_MODEL || env.LLM_LOCAL_DEFAULT_MODEL || "google/gemma-4-12b").trim();
}

function routerModel(env) {
  return (env.LLM_OPENAI_COMPAT_MODEL || "auto").trim();
}

export function activeLlm(env = process.env) {
  const provider = (env.LLM_PROVIDER || "gemini").trim().toLowerCase();
  if (provider === "openai_compatible") {
    const target = normalizeTarget(env.LLM_TARGET);
    return {
      provider,
      target,
      model: (env.LLM_MODEL || (target === "lmstudio" ? localModel(env) : routerModel(env))).trim(),
    };
  }
  return { provider, model: (env.LLM_MODEL || "gemini-2.5-flash").trim() };
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
  const lmStudioModel = localModel(env);
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
    label: "Custom LM Studio…",
  });
  if (routerBaseUrl(env)) {
    const defaultRouterModel = routerModel(env);
    options.push({
      id: `openai_compatible:router:${defaultRouterModel}`,
      provider: "openai_compatible",
      target: "router",
      model: defaultRouterModel,
      label: llmOptionLabel("openai_compatible", defaultRouterModel, "router"),
    });
    options.push({
      id: "openai_compatible:router:custom",
      provider: "openai_compatible",
      target: "router",
      model: null,
      custom: true,
      label: "Custom FreeLLMAPI…",
    });
  }
  const active = activeLlm(env);
  const activeId =
    active.provider === "openai_compatible"
      ? `${active.provider}:${active.target}:${active.model}`
      : `${active.provider}:${active.model}`;
  if (!options.some((option) => option.id === activeId)) {
    options.unshift({
      id: activeId,
      provider: active.provider,
      ...(active.target ? { target: active.target } : {}),
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
    const target = normalizeTarget(selection.target);
    if (target === "router" && !routerBaseUrl(env)) {
      return {
        ok: false,
        error: "FreeLLMAPI provider not configured (set LLM_ROUTER_BASE_URL)",
      };
    }
    // Free-text model ids are intentionally allowed for local providers
    // (LM Studio model names are arbitrary). LLM_BASE_URL/LLM_API_KEY stay
    // server-owned; the session only swaps provider + model id.
    return { ok: true, llm: { provider, target, model } };
  }
  return { ok: false, error: `unsupported provider '${provider}'` };
}

export function llmEnvOverrides(llm) {
  if (!llm?.provider || !llm?.model) return null;
  if (llm.provider !== "openai_compatible") {
    return { LLM_PROVIDER: llm.provider, LLM_MODEL: llm.model };
  }
  const target = normalizeTarget(llm.target);
  return {
    LLM_PROVIDER: "openai_compatible",
    LLM_TARGET: target,
    LLM_MODEL: llm.model,
    LLM_BASE_URL:
      target === "lmstudio"
        ? process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234/v1"
        : process.env.LLM_ROUTER_BASE_URL || "",
    LLM_API_KEY:
      target === "lmstudio"
        ? process.env.LM_STUDIO_API_KEY || "lm-studio"
        : process.env.LLM_ROUTER_API_KEY || "",
  };
}
