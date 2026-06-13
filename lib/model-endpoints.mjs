const TARGETS = new Set(["lmstudio", "router"]);

export function normalizeCompatTarget(target) {
  const value = String(target || "").trim().toLowerCase();
  if (TARGETS.has(value)) return value;
  return "router";
}

export function endpointLabel(target) {
  return normalizeCompatTarget(target) === "lmstudio" ? "LM Studio" : "FreeLLMAPI";
}

export function endpointBaseUrl(target, env = process.env) {
  if (normalizeCompatTarget(target) === "lmstudio") {
    return (env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234/v1").trim();
  }
  return (env.LLM_ROUTER_BASE_URL || "").trim();
}

export function endpointApiKey(target, env = process.env) {
  if (normalizeCompatTarget(target) === "lmstudio") {
    return (env.LM_STUDIO_API_KEY || "lm-studio").trim();
  }
  return (env.LLM_ROUTER_API_KEY || "").trim();
}

export function endpointDefaultModel(target, env = process.env) {
  if (normalizeCompatTarget(target) === "lmstudio") {
    return (env.LM_STUDIO_MODEL || env.LLM_LOCAL_DEFAULT_MODEL || "google/gemma-4-12b").trim();
  }
  return (env.LLM_OPENAI_COMPAT_MODEL || "auto").trim();
}

export function endpointConfigured(target, env = process.env) {
  return Boolean(endpointBaseUrl(target, env));
}

export function endpointOptionLabel(target, model) {
  return `${endpointLabel(target)} · ${model}`;
}
