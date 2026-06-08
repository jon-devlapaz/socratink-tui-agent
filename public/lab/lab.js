const loopPill = document.getElementById("loop-pill");
const tutorPill = document.getElementById("tutor-pill");
const studentPill = document.getElementById("student-pill");
const cartridgeSelect = document.getElementById("cartridge-select");
const studentSelect = document.getElementById("student-select");
const maxTurnsInput = document.getElementById("max-turns");
const allowFakeInput = document.getElementById("allow-fake");
const runBtn = document.getElementById("run-btn");
const cancelBtn = document.getElementById("cancel-btn");
const cartridgePreview = document.getElementById("cartridge-preview");
const theater = document.getElementById("theater");
const runHeader = document.getElementById("run-header");
const busyBar = document.getElementById("busy-bar");
const busyLabel = document.getElementById("busy-label");
const banner = document.getElementById("banner");
const transcriptEl = document.getElementById("transcript");
const openFolderBtn = document.getElementById("open-folder-btn");

let cartridges = [];
let activeRunId = null;
let pollTimer = null;
let renderedTurns = 0;

function phaseFromTagLabel(label) {
  const slug = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "idle";
}

function appendDomLine(el, rawText) {
  el.dataset.raw = rawText;
  transcriptEl.appendChild(el);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function appendChatLine(role, text) {
  const raw = String(text ?? "").trim();
  if (!raw) return;

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
  if (role === "learner") {
    const glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.textContent = "› ";
    el.appendChild(glyph);
    el.appendChild(document.createTextNode(raw));
  } else {
    el.textContent = raw;
  }
  appendDomLine(el, raw);
}

function appendTranscript(lines) {
  for (const entry of lines || []) {
    const t = entry.text || "";
    if (!t.trim()) continue;
    if (/^\[[^\]]+\]$/.test(t.trim())) {
      appendChatLine("phase-tag", t.trim());
      continue;
    }
    appendChatLine("system", t);
  }
}

function setPill(el, text, mode) {
  el.textContent = text;
  el.dataset.mode = mode;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return res.json();
}

async function refreshStatus() {
  try {
    const status = await fetchJson("/api/lab/status");
    const loop = status.loop || {};
    if (loop.status === "ok") {
      setPill(loopPill, "loop online", "live");
      setPill(
        tutorPill,
        loop.fake_llm ? "tutor: sandbox" : "tutor: live gemini",
        loop.fake_llm ? "fake" : "live",
      );
      if (loop.fake_llm) allowFakeInput.checked = true;
    } else {
      setPill(loopPill, "loop offline", "error");
      setPill(tutorPill, "tutor: unknown", "checking");
    }

    const studentMode = studentSelect.value;
    const probe = status.student?.[studentMode] || {};
    if (probe.online) {
      setPill(studentPill, `student: ${probe.mode} ${probe.model || ""}`.trim(), "live");
    } else {
      setPill(studentPill, `student: ${probe.mode || studentMode} offline`, "error");
    }
  } catch {
    setPill(loopPill, "lab unavailable", "error");
    setPill(tutorPill, "tutor: —", "checking");
    setPill(studentPill, "student: —", "checking");
  }
}

function renderCartridgePreview(id) {
  const cart = cartridges.find((c) => c.id === id);
  if (!cart) {
    cartridgePreview.hidden = true;
    return;
  }
  cartridgePreview.hidden = false;
  cartridgePreview.innerHTML = `
    <strong>${cart.label}</strong> — ${cart.concept}<br>
    Goal: ${cart.learner_goal}<br>
    Hint: ${cart.persona_hint || "(none)"}
  `;
}

async function loadCartridges() {
  const data = await fetchJson("/api/lab/cartridges");
  cartridges = data.cartridges || [];
  cartridgeSelect.replaceChildren(
    ...cartridges.map((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.label;
      return opt;
    }),
  );
  if (cartridges.length) {
    cartridgeSelect.value = cartridges[0].id;
    renderCartridgePreview(cartridges[0].id);
  }
}

function setRunning(running) {
  runBtn.disabled = running;
  cancelBtn.disabled = !running;
  theater.setAttribute("aria-busy", running ? "true" : "false");
}

function showBanner(text, kind) {
  banner.hidden = false;
  banner.textContent = text;
  banner.className = `run-banner ${kind || ""}`;
}

function renderRunSnapshot(snapshot) {
  if (snapshot.brains) {
    runHeader.hidden = false;
    runHeader.textContent = snapshot.brains;
  }

  if (snapshot.busy) {
    busyBar.hidden = false;
    busyLabel.textContent = snapshot.busyLabel || "working…";
  } else {
    busyBar.hidden = true;
  }

  const turns = snapshot.log?.turns || [];
  while (renderedTurns < turns.length) {
    const turn = turns[renderedTurns];
    if (turn.display && turn.display !== "[continue]") {
      appendChatLine("learner", turn.display);
    }
    appendTranscript(turn.transcript_delta);
    renderedTurns += 1;
  }

  if (snapshot.status === "done") {
    const fin = snapshot.log?.final || {};
    showBanner(
      fin.case_complete
        ? "case_complete=true"
        : fin.hit_max_turns
          ? "hit_max_turns"
          : "run finished",
      "done",
    );
    setRunning(false);
    if (snapshot.outDir) {
      openFolderBtn.hidden = false;
      openFolderBtn.disabled = false;
      openFolderBtn.dataset.path = snapshot.outDir;
    }
    stopPoll();
  } else if (snapshot.status === "error") {
    showBanner(snapshot.error || "run failed", "error");
    setRunning(false);
    stopPoll();
  } else if (snapshot.status === "cancelled") {
    showBanner("run cancelled", "cancelled");
    setRunning(false);
    stopPoll();
  }
}

let pollFailures = 0;

async function pollRun() {
  if (!activeRunId) return;
  try {
    const snapshot = await fetchJson(`/api/lab/runs/${activeRunId}`);
    pollFailures = 0;
    renderRunSnapshot(snapshot);
  } catch (err) {
    pollFailures += 1;
    // Loop-server blocks the event loop during Gemini bridge calls (spawnSync).
    // Polls fail with generic "fetch failed" while tutor work continues — retry.
    if (pollFailures < 120) {
      busyBar.hidden = false;
      busyLabel.textContent = `waiting for server (${pollFailures}s)…`;
      return;
    }
    showBanner(String(err.message || err), "error");
    setRunning(false);
    stopPoll();
  }
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(pollRun, 1000);
  pollRun();
}

function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function startRun() {
  const cartridgeId = cartridgeSelect.value;
  if (!cartridgeId) return;

  transcriptEl.replaceChildren();
  renderedTurns = 0;
  pollFailures = 0;
  banner.hidden = true;
  runHeader.hidden = true;
  openFolderBtn.hidden = true;
  openFolderBtn.disabled = true;

  setRunning(true);
  const body = {
    cartridgeId,
    student: studentSelect.value,
    maxTurns: Number(maxTurnsInput.value) || 24,
    allowFake: allowFakeInput.checked,
  };
  const { runId } = await fetchJson("/api/lab/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  activeRunId = runId;
  startPoll();
}

async function cancelRun() {
  if (!activeRunId) return;
  await fetchJson(`/api/lab/runs/${activeRunId}/cancel`, { method: "POST" });
}

cartridgeSelect.addEventListener("change", () => {
  renderCartridgePreview(cartridgeSelect.value);
});
studentSelect.addEventListener("change", refreshStatus);
runBtn.addEventListener("click", () => startRun().catch((err) => showBanner(String(err.message || err), "error")));
cancelBtn.addEventListener("click", () => cancelRun().catch((err) => showBanner(String(err.message || err), "error")));
openFolderBtn.addEventListener("click", async () => {
  if (!activeRunId) return;
  try {
    await fetchJson(`/api/lab/runs/${activeRunId}/reveal`, { method: "POST" });
  } catch (err) {
    const path = openFolderBtn.dataset.path;
    showBanner(
      path
        ? `${err.message || err} — path: ${path}`
        : String(err.message || err),
      "error",
    );
  }
});

refreshStatus();
loadCartridges().catch((err) => showBanner(String(err.message || err), "error"));
setInterval(refreshStatus, 15_000);
