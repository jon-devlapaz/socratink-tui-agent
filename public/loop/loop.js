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
const llmPicker = document.getElementById("llm-picker");
const llmPickerMenu = document.getElementById("llm-picker-menu");
const sessionTag = document.getElementById("session-tag");
const srStatus = document.getElementById("sr-status");
const composerCtaEl = document.getElementById("composer-cta");
const composerCtaLabel = document.getElementById("composer-cta-label");
const composerCtaText = document.getElementById("composer-cta-text");
const voiceButton = document.getElementById("voice-input");
const tutorVoiceButton = document.getElementById("tutor-voice");
const sendButton = form.querySelector('button[type="submit"]');
const sendButtonLabel = sendButton?.querySelector(".send-label");

let sessionId = null;
let busy = false;
let lastPromptMarker = null;
let currentAwaiting = null;
let llmOverrideAllowed = false;
let llmOptions = [];
let activeLlmSelection = null;
let busyNoticeTimer = null;
let speechRecognition = null;
let listening = false;
let speechBaseText = "";
let tutorVoiceEnabled = false;
let lastSpokenPromptMarker = null;

const LLM_PREF_KEY = "socratink.loop.llmPreference";
const TUTOR_VOICE_PREF_KEY = "socratink.loop.tutorVoice";
const LOCAL_LLM_PROVIDERS = new Set(["openai_compatible"]);
const LONG_RUNNING_AFTER_MS = 15_000;

const THINKING_COPY = {
  idle: "starting session",
  ignition: "reading your starting model",
  substrate_gate: "finding your first foothold",
  route: "choosing your first question",
  map: "choosing your first question",
  cold_attempt: "reading your answer",
  delta: "finding the missing link",
  study: "unlocking study material",
  repair_dialogue: "checking your repair",
  repair_recovery: "getting you unstuck",
  model_bridge: "preparing model bridge",
  post_bridge_transfer: "setting up a transfer check",
  spacing: "giving memory a little space",
  spaced_redrill: "checking what came back",
  strong_cold_path: "moving to memory check",
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
  "own_words_repair": "own_words_repair",
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
  route: "first question",
  map: "first question",
  cold_attempt: "first question",
  delta: "missing link",
  study: "study",
  repair_dialogue: "repair",
  own_words_repair: "repair",
  repair_recovery: "recovery",
  model_bridge: "model answer",
  post_bridge_transfer: "transfer check",
  spacing: "spacing",
  spaced_redrill: "memory check",
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

function appendTranscript(lines) {
  for (const entry of lines || []) {
    const t = entry.text || "";
    const trimmed = t.trim();
    if (!trimmed) continue;
    if (t.startsWith("[Bridge error]")) {
      appendChatLine("error", t, { force: true });
      continue;
    }
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

function resizeComposerInput() {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
}

function setVoiceListening(isListening) {
  listening = isListening;
  if (!voiceButton) return;
  if (isListening) window.speechSynthesis?.cancel();
  voiceButton.classList.toggle("is-listening", isListening);
  voiceButton.setAttribute("aria-pressed", String(isListening));
  voiceButton.setAttribute(
    "aria-label",
    isListening ? "Stop dictating answer" : "Dictate answer",
  );
}

function setTutorVoiceEnabled(enabled) {
  tutorVoiceEnabled = enabled;
  if (!tutorVoiceButton) return;
  tutorVoiceButton.classList.toggle("is-speaking", enabled);
  tutorVoiceButton.setAttribute("aria-pressed", String(enabled));
  tutorVoiceButton.setAttribute(
    "aria-label",
    enabled ? "Tutor voice on" : "Tutor voice off",
  );
  try {
    localStorage.setItem(TUTOR_VOICE_PREF_KEY, enabled ? "1" : "0");
  } catch {
    /* preference just won't stick */
  }
}

function speakTutorPrompt(awaiting, marker) {
  const text = String(awaiting?.ctaText ?? "").trim();
  if (!tutorVoiceEnabled || !text || marker === lastSpokenPromptMarker) return;
  lastSpokenPromptMarker = marker;
  window.speechSynthesis?.cancel();
  window.speechSynthesis?.speak(new window.SpeechSynthesisUtterance(text));
}

function isContinueAwaiting(awaiting = currentAwaiting) {
  return awaiting?.key === "continue";
}

function setSendButtonMode(awaiting) {
  if (!sendButtonLabel || !sendButton) return;
  if (isContinueAwaiting(awaiting) && !input.value.trim()) {
    sendButtonLabel.textContent = "continue";
    sendButton.setAttribute("aria-label", "Continue (Return)");
    return;
  }
  sendButtonLabel.textContent = "return";
  sendButton.setAttribute("aria-label", "Send (Return)");
}

function promptPlaceholder(label) {
  const base = "Type your answer…";
  if (!label) return base;
  const clean = label.replace(/:\s*$/, "").trim();
  if (clean === ">") return "Pick a concept…";
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
  if (isLoading && listening) speechRecognition?.stop();
  if (isLoading) window.speechSynthesis?.cancel();
  input.disabled = isLoading;
  if (voiceButton) voiceButton.disabled = isLoading;
  sendButton.disabled = isLoading;
}

function clearBusyNotice() {
  if (busyNoticeTimer) {
    clearTimeout(busyNoticeTimer);
    busyNoticeTimer = null;
  }
}

function setBusy(isBusy, phase) {
  clearBusyNotice();
  terminalEl.classList.toggle("is-busy", isBusy);
  terminalEl.setAttribute("aria-busy", String(isBusy));
  if (isBusy) {
    const message = thinkingMessage(phase);
    srStatus.textContent = message;
    setComposerLoading(true, phase);
    busyNoticeTimer = setTimeout(() => {
      if (!busy) return;
      composerBusyLabel.textContent = `${message} - still thinking`;
      srStatus.textContent = `${message} - still thinking`;
    }, LONG_RUNNING_AFTER_MS);
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
    resizeComposerInput();
    return;
  }
  const marker = `${awaiting.key ?? ""}:${awaiting.ctaText ?? ""}:${awaiting.label ?? ""}`;
  if (marker !== lastPromptMarker) {
    lastPromptMarker = marker;
    speakTutorPrompt(awaiting, marker);
  }
  setComposerCta(awaiting);
  if (isContinueAwaiting(awaiting)) {
    input.value = "";
    input.placeholder = "Press Return to continue…";
    setSendButtonMode(awaiting);
    resizeComposerInput();
    return;
  }
  const hasCtaBody = Boolean(String(awaiting.ctaText ?? "").trim());
  if (hasCtaBody) {
    input.placeholder = "Type your answer…";
  } else {
    input.placeholder = promptPlaceholder(awaiting.ctaLabel || awaiting.label);
  }
  resizeComposerInput();
}

function setComposerEnabled(enabled) {
  if (busy) return;
  input.disabled = !enabled;
  if (voiceButton) voiceButton.disabled = !enabled;
  sendButton.disabled = !enabled;
}

function initVoiceInput() {
  if (!voiceButton) return;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return;

  speechRecognition = new Recognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.lang = navigator.language || "en-US";
  voiceButton.hidden = false;

  speechRecognition.addEventListener("start", () => {
    speechBaseText = input.value.trim();
    setVoiceListening(true);
    srStatus.textContent = "listening";
  });

  speechRecognition.addEventListener("result", (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript;
    }
    input.value = [speechBaseText, transcript.trim()].filter(Boolean).join(" ");
    resizeComposerInput();
    setSendButtonMode(currentAwaiting);
  });

  speechRecognition.addEventListener("end", () => {
    setVoiceListening(false);
    srStatus.textContent = "";
    input.focus();
  });

  speechRecognition.addEventListener("error", (event) => {
    setVoiceListening(false);
    srStatus.textContent = event.error ? `voice input: ${event.error}` : "voice input stopped";
  });

  voiceButton.addEventListener("click", () => {
    if (busy || voiceButton.disabled) return;
    if (listening) {
      speechRecognition.stop();
      return;
    }
    try {
      speechRecognition.start();
    } catch {
      setVoiceListening(false);
    }
  });
}

function initTutorVoice() {
  if (!tutorVoiceButton || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  tutorVoiceButton.hidden = false;
  try {
    setTutorVoiceEnabled(localStorage.getItem(TUTOR_VOICE_PREF_KEY) === "1");
  } catch {
    setTutorVoiceEnabled(false);
  }
  tutorVoiceButton.addEventListener("click", () => {
    const enabled = !tutorVoiceEnabled;
    setTutorVoiceEnabled(enabled);
    if (!enabled) window.speechSynthesis.cancel();
    if (enabled && currentAwaiting) {
      const marker = `${currentAwaiting.key ?? ""}:${currentAwaiting.ctaText ?? ""}:${currentAwaiting.label ?? ""}`;
      lastSpokenPromptMarker = null;
      speakTutorPrompt(currentAwaiting, marker);
    }
  });
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

function llmPillLabel(llm) {
  if (llm.provider === "openai_compatible") {
    return `LM Studio · ${llm.model}`;
  }
  const prefix = LOCAL_LLM_PROVIDERS.has(llm.provider) ? "local" : "live";
  return `${prefix} · ${llm.model}`;
}

function loadLlmPreference() {
  try {
    const raw = localStorage.getItem(LLM_PREF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.provider && parsed?.model) return parsed;
  } catch {
    /* corrupted preference — ignore */
  }
  return null;
}

function saveLlmPreference(llm) {
  try {
    localStorage.setItem(LLM_PREF_KEY, JSON.stringify(llm));
  } catch {
    /* storage unavailable — preference just won't stick */
  }
}

function setLlmSelection(llm) {
  activeLlmSelection = llm;
  llmPill.dataset.mode = "live";
  llmPill.textContent = llmPillLabel(llm);
  const sourceLabel =
    llm.provider === "openai_compatible" ? "LM Studio" : llm.provider;
  llmPill.title = `tutor via bridge (${sourceLabel}) — click to switch model`;
}

function closeLlmMenu() {
  if (!llmPickerMenu) return;
  llmPickerMenu.hidden = true;
  llmPill.setAttribute("aria-expanded", "false");
}

function renderLlmMenu() {
  llmPickerMenu.innerHTML = "";
  const activeId = activeLlmSelection
    ? `${activeLlmSelection.provider}:${activeLlmSelection.model}`
    : null;
  for (const option of llmOptions) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.textContent = option.label;
    li.setAttribute(
      "aria-selected",
      String(!option.custom && option.id === activeId),
    );
    li.addEventListener("click", () => selectLlmOption(option));
    llmPickerMenu.appendChild(li);
  }
}

async function selectLlmOption(option) {
  closeLlmMenu();
  let model = option.model;
  if (option.custom) {
    model = (window.prompt("Model id (as loaded in LM Studio):") || "").trim();
    if (!model || model.length > 128) return;
  }
  const llm = { provider: option.provider, model };
  try {
    if (sessionId) {
      const res = await fetch(`/api/session/${sessionId}/llm`, {
        method: "PATCH",
        headers: apiHeaders(),
        body: JSON.stringify({ llm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
    }
    setLlmSelection(llm);
    saveLlmPreference(llm);
    const modelLabel =
      llm.provider === "openai_compatible"
        ? `LM Studio/${llm.model}`
        : `${llm.provider}/${llm.model}`;
    appendChatLine("meta", `[tutor] model → ${modelLabel}`, { force: true });
  } catch (error) {
    appendChatLine("error", `Model switch failed: ${error.message}`, {
      force: true,
    });
  }
}

function initLlmPicker(health) {
  llmOverrideAllowed = Boolean(health?.llm_override_allowed);
  llmOptions = Array.isArray(health?.llm_options) ? health.llm_options : [];
  if (!llmOverrideAllowed || !llmOptions.length || !llmPickerMenu) return;
  llmPill.dataset.interactive = "true";
  const stored = loadLlmPreference();
  if (stored) setLlmSelection(stored);
  llmPill.addEventListener("click", () => {
    const open = llmPickerMenu.hidden;
    if (open) renderLlmMenu();
    llmPickerMenu.hidden = !open;
    llmPill.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (event) => {
    if (!llmPicker.contains(event.target)) closeLlmMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLlmMenu();
  });
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
  if (!health.gemini_configured && !health.llm_override_allowed) {
    llmPill.dataset.mode = "error";
    llmPill.textContent = "live · no API key";
    llmPill.title = "Set GEMINI_API_KEY in .env and restart ./socratink-loop-server";
    return;
  }
  if (activeLlmSelection) {
    setLlmSelection(activeLlmSelection);
    return;
  }
  llmPill.dataset.mode = "live";
  llmPill.textContent = llmPillLabel({
    provider: health.llm_provider || "gemini",
    model: health.llm_model || "gemini",
  });
  const healthProvider = health.llm_provider || "gemini";
  const healthSource =
    healthProvider === "openai_compatible" ? "LM Studio" : healthProvider;
  llmPill.title = `tutor via bridge (${healthSource})`;
}

function setVersionPillFromHealth(health) {
  if (!versionPill) return;
  const label = health?.app_version || "v0.44";
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

function applyTurnResponse(data) {
  if (llmOverrideAllowed && data.llm_active?.provider && data.llm_active?.model) {
    setLlmSelection(data.llm_active);
  }
  setPhaseChrome(data.phase);
  appendTranscript(data.learnerTranscript || data.transcript);
  if (data.complete) {
    appendChatLine("meta", "— session ended — type a concept to start a new session.");
    sessionId = null;
    showAwaitingPrompt({ label: "Concept: ", key: "concept" });
    setComposerEnabled(true);
    input.placeholder = "Pick a concept…";
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
    const preference = llmOverrideAllowed ? loadLlmPreference() : null;
    const data = await post(
      "/api/session",
      preference ? { llm: preference } : {},
    );
    sessionId = data.sessionId;
    setSessionChrome(sessionId);
    appendTranscript(data.learnerTranscript || data.transcript);
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
  resizeComposerInput();
  try {
    if (continueTurn && !text) {
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

input.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  form.requestSubmit();
});

input.addEventListener("input", () => {
  resizeComposerInput();
  setSendButtonMode(currentAwaiting);
});

initVoiceInput();
initTutorVoice();

refreshHealth().then((health) => {
  // Picker must init before the auto-started session so the stored model
  // preference applies to the first POST /api/session, not just the next one.
  initLlmPicker(health);
  return ensureSession().catch((error) => {
    busy = false;
    appendChatLine("error", error.message || "Could not start session.", { force: true });
    setBusy(false);
    setComposerEnabled(false);
  });
});
