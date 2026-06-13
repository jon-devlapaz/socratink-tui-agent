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
const LOCAL_PROVIDER_LABEL = "LM Studio";

function llmOptionLabel(provider, model) {
  return LOCAL_PROVIDERS.has(provider)
    ? `${LOCAL_PROVIDER_LABEL} · ${model}`
    : `live · ${model}`;
}

function geminiConfigured(env) {
  return Boolean((env.GEMINI_API_KEY || "").trim());
}

function localBaseUrl(env) {
  return (env.LLM_BASE_URL || "").trim();
}

export function activeLlm(env = process.env) {
  return {
    provider: (env.LLM_PROVIDER || "gemini").trim().toLowerCase(),
    model: (env.LLM_MODEL || "gemini-2.5-flash").trim(),
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
  if (localBaseUrl(env)) {
    const localDefault = (env.LLM_LOCAL_DEFAULT_MODEL || "google/gemma-4-12b").trim();
    options.push({
      id: `openai_compatible:${localDefault}`,
      provider: "openai_compatible",
      model: localDefault,
      label: llmOptionLabel("openai_compatible", localDefault),
    });
    options.push({
      id: "openai_compatible:custom",
      provider: "openai_compatible",
      model: null,
      custom: true,
      label: "Custom…",
    });
  }
  const active = activeLlm(env);
  const activeId = `${active.provider}:${active.model}`;
  if (!options.some((option) => option.id === activeId)) {
    options.unshift({
      id: activeId,
      provider: active.provider,
      model: active.model,
      label: llmOptionLabel(active.provider, active.model),
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
    if (!localBaseUrl(env)) {
      return {
        ok: false,
        error: "local provider not configured (set LLM_BASE_URL)",
      };
    }
    // Free-text model ids are intentionally allowed for local providers
    // (LM Studio model names are arbitrary). LLM_BASE_URL/LLM_API_KEY stay
    // server-owned; the session only swaps provider + model id.
    return { ok: true, llm: { provider, model } };
  }
  return { ok: false, error: `unsupported provider '${provider}'` };
}

export function llmEnvOverrides(llm) {
  if (!llm?.provider || !llm?.model) return null;
  return { LLM_PROVIDER: llm.provider, LLM_MODEL: llm.model };
}
