const transcriptEl = document.getElementById("transcript");
const terminalEl = document.getElementById("terminal");
const form = document.getElementById("composer");
const composerIdle = document.getElementById("composer-idle");
const composerBusy = document.getElementById("composer-busy");
const composerBusyLabel = document.getElementById("composer-busy-label");
const input = document.getElementById("input");
const phasePill = document.getElementById("phase-pill");
const llmPill = document.getElementById("llm-pill");
const sessionTag = document.getElementById("session-tag");
const srStatus = document.getElementById("sr-status");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let sessionId = null;
let busy = false;
let lastPromptMarker = null;
let lastLlmStamp = null;
let thinkingLineEl = null;
let thinkingDotsTimer = null;

const THINKING_COPY = {
  idle: "starting session",
  ignition: "sketching route",
  route: "building provisional map",
  map: "rendering route map",
  cold_attempt: "evaluating cold attempt",
  delta: "building repair scaffold",
  study: "unlocking study material",
  repair_dialogue: "judging repair dialogue",
  repair_recovery: "recovery step",
  model_bridge: "preparing model bridge",
  post_bridge_transfer: "post-bridge transfer check",
  spacing: "spacing interval",
  spaced_redrill: "evaluating spaced re-drill",
  strong_cold_path: "routing strong cold path",
};

const PHASE_SLUG = {
  idle: "idle",
  ignition: "ignition",
  route: "route",
  map: "map",
  "cold attempt": "cold_attempt",
  "own-words repair": "repair_dialogue",
  "repair dialogue": "repair_dialogue",
  hint: "repair_dialogue",
  "model bridge": "model_bridge",
  "post-bridge transfer check": "post_bridge_transfer",
  spacing: "spacing",
  "spaced re-drill": "spaced_redrill",
  evidence: "evidence",
  study: "study",
  delta: "delta",
  pressure: "pressure",
};

function apiHeaders() {
  const headers = { "Content-Type": "application/json" };
  const key = window.SOCRATINK_LOOP_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function phaseFromTagLabel(label) {
  const key = String(label || "").trim().toLowerCase();
  return PHASE_SLUG[key] || key.replace(/\s+/g, "_");
}

function isRecentDuplicate(raw, lookback = 6) {
  const children = transcriptEl.children;
  for (
    let i = children.length - 1;
    i >= Math.max(0, children.length - lookback);
    i -= 1
  ) {
    if (children[i]?.dataset?.raw === raw) return true;
  }
  return false;
}

function appendDomLine(el, rawText) {
  el.dataset.raw = rawText;
  transcriptEl.appendChild(el);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function appendChatLine(role, text, options = {}) {
  const raw = String(text ?? "").trim();
  if (!raw) return;
  if (!options.force && role !== "user" && isRecentDuplicate(raw)) return;

  const phaseMatch = raw.match(/^\[([^\]]+)\]$/);
  const el = document.createElement("div");

  if (phaseMatch) {
    const slug = phaseFromTagLabel(phaseMatch[1]);
    el.className = `line phase-tag phase-${slug}`;
    el.dataset.phase = slug;
    el.textContent = raw;
    appendDomLine(el, raw);
    return;
  }

  el.className = `line ${role}`;
  if (role === "user") {
    const glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.textContent = "› ";
    el.appendChild(glyph);
    el.appendChild(document.createTextNode(raw));
  } else if (raw.startsWith("[Help]")) {
    el.className = "line help";
    el.textContent = raw;
  } else {
    el.textContent = raw;
  }

  appendDomLine(el, raw);
}

function appendTranscript(lines) {
  for (const entry of lines || []) {
    const t = entry.text || "";
    if (!t.trim()) continue;
    if (t.startsWith("[Help]")) {
      appendChatLine("help", t);
      continue;
    }
    if (/^\[[^\]]+\]$/.test(t.trim())) {
      appendChatLine("phase-tag", t.trim());
      continue;
    }
    appendChatLine("system", t);
  }
}

function promptPlaceholder(label) {
  const base = "Type your answer… · /help · /hint · /feedback · /exit";
  if (!label) return base;
  const clean = label.replace(/:\s*$/, "").trim();
  return clean ? `${clean}…` : base;
}

function setPhaseChrome(phase) {
  const slug = phase ? String(phase).toLowerCase() : "—";
  phasePill.dataset.phase = slug;
  phasePill.textContent = slug === "—" ? "—" : slug.replace(/_/g, " ");
}

function setSessionChrome(id) {
  if (!id) {
    sessionTag.hidden = true;
    return;
  }
  sessionTag.hidden = false;
  sessionTag.textContent = id.slice(0, 8);
}

function activePhaseSlug(phase) {
  const slug = phase ?? phasePill.dataset.phase ?? "idle";
  return slug === "—" ? "idle" : String(slug).toLowerCase();
}

function thinkingMessage(phase) {
  return THINKING_COPY[activePhaseSlug(phase)] ?? "running loop";
}

function scrollTranscript() {
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function clearThinkingDots() {
  if (thinkingDotsTimer) {
    clearInterval(thinkingDotsTimer);
    thinkingDotsTimer = null;
  }
}

function removeThinkingLine() {
  clearThinkingDots();
  thinkingLineEl?.remove();
  thinkingLineEl = null;
}

function showThinkingLine(phase) {
  removeThinkingLine();
  const message = thinkingMessage(phase);
  const el = document.createElement("div");
  el.className = "line thinking";
  el.dataset.raw = "__thinking__";

  const braille = document.createElement("span");
  braille.className = "braille-spinner";
  braille.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "thinking-text";
  text.textContent = message;

  const dots = document.createElement("span");
  dots.className = "thinking-dots";
  if (!reducedMotion) dots.classList.add("is-animated");

  el.append(braille, text, dots);
  transcriptEl.appendChild(el);
  thinkingLineEl = el;
  scrollTranscript();
}

function setComposerLoading(isLoading, phase) {
  const message = thinkingMessage(phase);
  composerBusyLabel.textContent = message;
  composerIdle.hidden = isLoading;
  composerBusy.hidden = !isLoading;
  input.disabled = isLoading;
  form.querySelector("button").disabled = isLoading;
}

function setBusy(isBusy, phase) {
  terminalEl.classList.toggle("is-busy", isBusy);
  terminalEl.setAttribute("aria-busy", String(isBusy));
  if (isBusy) {
    const message = thinkingMessage(phase);
    srStatus.textContent = `Loop is running: ${message}`;
    showThinkingLine(phase);
    setComposerLoading(true, phase);
    return;
  }
  srStatus.textContent = "";
  removeThinkingLine();
  setComposerLoading(false, phase);
}

function showAwaitingPrompt(awaiting) {
  if (!awaiting) {
    lastPromptMarker = null;
    input.placeholder = promptPlaceholder();
    return;
  }
  const marker = `${awaiting.key ?? ""}:${awaiting.label ?? ""}`;
  if (marker !== lastPromptMarker) {
    lastPromptMarker = marker;
    const label = String(awaiting.label ?? "").trim();
    // Composer already shows ›; skip bare REPL prompts like ">" or "> ".
    if (label && !/^>\s*$/.test(label)) {
      appendChatLine("prompt", label);
    }
  }
  input.placeholder = promptPlaceholder(awaiting.label);
}

function setComposerEnabled(enabled) {
  if (busy) return;
  input.disabled = !enabled;
  form.querySelector("button").disabled = !enabled;
}

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function setLlmPillFromHealth(health) {
  if (!llmPill || !health) return;
  if (health.fake_llm) {
    llmPill.dataset.mode = "fake";
    llmPill.textContent = "sandbox · no Gemini";
    llmPill.title =
      "SOCRATINK_TUI_FAKE_LLM=1 — maps/evals are templates. Restart server without it.";
    return;
  }
  if (!health.gemini_configured) {
    llmPill.dataset.mode = "error";
    llmPill.textContent = "live · no API key";
    llmPill.title = "Set GEMINI_API_KEY in .env and restart ./socratink-loop-server";
    return;
  }
  llmPill.dataset.mode = "live";
  llmPill.textContent = `live · ${health.llm_model || "gemini"}`;
  llmPill.title = `Gemini via bridge (${health.llm_provider || "gemini"})`;
}

async function refreshHealth() {
  try {
    const res = await fetch("/health");
    const health = await res.json();
    setLlmPillFromHealth(health);
    return health;
  } catch {
    if (llmPill) {
      llmPill.dataset.mode = "error";
      llmPill.textContent = "health unreachable";
    }
    return null;
  }
}

function appendLlmReceipt(llm) {
  if (!llm?.provider || llm.provider === "orchestrator") return;
  const stamp = `${llm.stage}:${llm.provider}:${llm.model}:${llm.latency_ms}`;
  if (stamp === lastLlmStamp) return;
  lastLlmStamp = stamp;
  const latency =
    llm.latency_ms != null && llm.latency_ms !== "" ? ` · ${llm.latency_ms}ms` : "";
  appendChatLine(
    "meta",
    `[LLM ${llm.stage}] ${llm.provider}/${llm.model}${latency}`,
    { force: true },
  );
}

function applyTurnResponse(data) {
  removeThinkingLine();
  setPhaseChrome(data.phase);
  appendTranscript(data.transcript);
  appendLlmReceipt(data.llm);
  if (data.complete) {
    appendChatLine("meta", "— session ended — type a concept to start a new session.");
    sessionId = null;
    lastLlmStamp = null;
    showAwaitingPrompt({ label: "Concept: ", key: "concept" });
    setComposerEnabled(true);
    input.placeholder = "Type a concept to explore… · /help · /feedback · /exit";
    setPhaseChrome("idle");
    input.focus();
    return;
  }
  showAwaitingPrompt(data.awaiting);
  setComposerEnabled(true);
  input.focus();
}

async function ensureSession() {
  if (sessionId) return sessionId;
  busy = true;
  setBusy(true, "idle");
  try {
    const data = await post("/api/session");
    sessionId = data.sessionId;
    setSessionChrome(sessionId);
    appendTranscript(data.transcript);
    busy = false;
    setBusy(false, data.phase);
    applyTurnResponse(data);
    return sessionId;
  } catch (error) {
    busy = false;
    setBusy(false);
    throw error;
  }
}

async function sendTurn(text) {
  await ensureSession();
  const phaseBeforeTurn = activePhaseSlug();
  busy = true;
  appendChatLine("user", text, { force: true });
  lastPromptMarker = null;
  setBusy(true, phaseBeforeTurn);
  try {
    const data = await post(`/api/session/${sessionId}/turn`, { text });
    busy = false;
    setBusy(false, data.phase ?? phasePill.dataset.phase);
    applyTurnResponse(data);
  } catch (error) {
    busy = false;
    setBusy(false);
    throw error;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  try {
    await sendTurn(text);
  } catch (error) {
    busy = false;
    appendChatLine("error", error.message || "Request failed.", { force: true });
    showAwaitingPrompt(null);
    setBusy(false);
    setComposerEnabled(true);
    input.focus();
  }
});

refreshHealth().then(() =>
  ensureSession().catch((error) => {
    busy = false;
    appendChatLine("error", error.message || "Could not start session.", { force: true });
    setBusy(false);
    setComposerEnabled(false);
  }),
);
