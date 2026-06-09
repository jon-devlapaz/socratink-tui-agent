const transcriptEl = document.getElementById("transcript");
const terminalEl = document.getElementById("terminal");
const form = document.getElementById("composer");
const composerIdle = document.getElementById("composer-idle");
const composerBusy = document.getElementById("composer-busy");
const composerBusyLabel = document.getElementById("composer-busy-label");
const input = document.getElementById("input");
const phasePill = document.getElementById("phase-pill");
const versionPill = document.getElementById("version-pill");
const llmPill = document.getElementById("llm-pill");
const sessionTag = document.getElementById("session-tag");
const srStatus = document.getElementById("sr-status");
const composerCtaEl = document.getElementById("composer-cta");
const composerCtaLabel = document.getElementById("composer-cta-label");
const composerCtaText = document.getElementById("composer-cta-text");
const sendButton = form.querySelector("button");
const sendButtonLabel = sendButton?.querySelector(".send-label");

let sessionId = null;
let busy = false;
let lastPromptMarker = null;
let lastLlmStamp = null;
let currentAwaiting = null;

const THINKING_COPY = {
  idle: "starting session",
  ignition: "reading your starting model",
  substrate_gate: "checking starting point",
  route: "building provisional map",
  map: "rendering route map",
  cold_attempt: "reading your answer",
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
  substrate: "substrate_gate",
  "substrate gate": "substrate_gate",
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

const PHASE_LABELS = {
  idle: "idle",
  ignition: "starting point",
  substrate_gate: "starting point",
  route: "draft map",
  map: "draft map",
  cold_attempt: "cold attempt",
  delta: "delta",
  study: "study",
  repair_dialogue: "own-words repair",
  repair_recovery: "recovery",
  model_bridge: "model bridge",
  post_bridge_transfer: "post-bridge transfer check",
  spacing: "spacing",
  spaced_redrill: "spaced re-drill",
  strong_cold_path: "strong cold path",
  pressure: "pressure",
  evidence: "evidence",
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

function isSkippedTranscriptLine(text) {
  const t = String(text ?? "").trim();
  if (!t) return true;
  if (t.startsWith("[Question]")) return true;
  if (/^First question:\s*$/i.test(t)) return true;
  return false;
}

function appendTranscript(lines) {
  for (const entry of lines || []) {
    const t = entry.text || "";
    if (!t.trim() || isSkippedTranscriptLine(t)) continue;
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

function setComposerCta(awaiting) {
  if (!composerCtaEl) return;
  const label = String(awaiting?.ctaLabel ?? "").trim();
  const text = String(awaiting?.ctaText ?? "").trim();

  if (text) {
    composerCtaEl.hidden = false;
    if (composerCtaLabel) {
      composerCtaLabel.textContent = label || "Your turn";
      composerCtaLabel.hidden = !label;
    }
    if (composerCtaText) composerCtaText.textContent = text;
    srStatus.textContent = label ? `${label}: ${text}` : text;
    return;
  }

  composerCtaEl.hidden = true;
  if (composerCtaLabel) composerCtaLabel.textContent = "";
  if (composerCtaText) composerCtaText.textContent = "";
}

function isContinueAwaiting(awaiting = currentAwaiting) {
  return awaiting?.key === "continue";
}

function setSendButtonMode(awaiting) {
  if (!sendButtonLabel || !sendButton) return;
  if (isContinueAwaiting(awaiting)) {
    sendButtonLabel.textContent = "continue";
    sendButton.setAttribute("aria-label", "Continue (Return)");
    return;
  }
  sendButtonLabel.textContent = "return";
  sendButton.setAttribute("aria-label", "Send (Return)");
}

function promptPlaceholder(label) {
  const base = "Type your answer… · /help · /hint · /feedback · /exit";
  if (!label) return base;
  const clean = label.replace(/:\s*$/, "").trim();
  if (clean === ">") return base;
  return clean ? `${clean}…` : base;
}

function setPhaseChrome(phase) {
  const slug = phase ? String(phase).toLowerCase() : "—";
  phasePill.dataset.phase = slug;
  phasePill.textContent =
    slug === "—" ? "—" : PHASE_LABELS[slug] ?? slug.replace(/_/g, " ");
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

function setComposerLoading(isLoading, phase) {
  const message = thinkingMessage(phase);
  composerBusyLabel.textContent = message;
  composerIdle.hidden = isLoading;
  composerBusy.hidden = !isLoading;
  input.disabled = isLoading;
  sendButton.disabled = isLoading;
}

function setBusy(isBusy, phase) {
  terminalEl.classList.toggle("is-busy", isBusy);
  terminalEl.setAttribute("aria-busy", String(isBusy));
  if (isBusy) {
    const message = thinkingMessage(phase);
    srStatus.textContent = `Loop is running: ${message}`;
    setComposerLoading(true, phase);
    return;
  }
  srStatus.textContent = "";
  setComposerLoading(false, phase);
}

function showAwaitingPrompt(awaiting) {
  currentAwaiting = awaiting || null;
  setSendButtonMode(awaiting);
  if (!awaiting) {
    lastPromptMarker = null;
    setComposerCta(null);
    input.placeholder = promptPlaceholder();
    return;
  }
  const marker = `${awaiting.key ?? ""}:${awaiting.ctaText ?? ""}:${awaiting.label ?? ""}`;
  if (marker !== lastPromptMarker) {
    lastPromptMarker = marker;
  }
  setComposerCta(awaiting);
  if (isContinueAwaiting(awaiting)) {
    input.value = "";
    input.placeholder = "Press Return to continue…";
    return;
  }
  const hasCtaBody = Boolean(String(awaiting.ctaText ?? "").trim());
  if (hasCtaBody) {
    input.placeholder = "Type your answer… · /help · /hint · /feedback · /exit";
  } else {
    input.placeholder = promptPlaceholder(awaiting.ctaLabel || awaiting.label);
  }
}

function setComposerEnabled(enabled) {
  if (busy) return;
  input.disabled = !enabled;
  sendButton.disabled = !enabled;
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

function setVersionPillFromHealth(health) {
  if (!versionPill) return;
  const label = health?.app_version || "v0.20";
  versionPill.textContent = label;
  versionPill.title = `Loop release ${label}`;
}

async function refreshHealth() {
  try {
    const res = await fetch("/health");
    const health = await res.json();
    setVersionPillFromHealth(health);
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

async function sendTurn(text, options = {}) {
  await ensureSession();
  const phaseBeforeTurn = activePhaseSlug();
  busy = true;
  if (options.appendUser !== false) {
    appendChatLine("user", text, { force: true });
  }
  lastPromptMarker = null;
  setBusy(true, phaseBeforeTurn);
  try {
    const payload = options.emptyPayload ? {} : { text };
    const data = await post(`/api/session/${sessionId}/turn`, payload);
    busy = false;
    setBusy(false, data.phase ?? phasePill.dataset.phase);
    applyTurnResponse(data);
  } catch (error) {
    busy = false;
    setBusy(false);
    throw error;
  }
}

function sendContinueTurn() {
  return sendTurn("", { appendUser: false, emptyPayload: true });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const text = input.value.trim();
  const continueTurn = isContinueAwaiting();
  if (!text && !continueTurn) return;
  const awaitingBeforeSubmit = currentAwaiting;
  input.value = "";
  try {
    if (continueTurn) {
      await sendContinueTurn();
    } else {
      await sendTurn(text);
    }
  } catch (error) {
    busy = false;
    appendChatLine("error", error.message || "Request failed.", { force: true });
    showAwaitingPrompt(awaitingBeforeSubmit);
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
