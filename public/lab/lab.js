const loopPill = document.getElementById("loop-pill");
const tutorPill = document.getElementById("tutor-pill");
const studentPill = document.getElementById("student-pill");
const cartridgeSelect = document.getElementById("cartridge-select");
const conceptInput = document.getElementById("concept-input");
const goalInput = document.getElementById("goal-input");
const tutorSelect = document.getElementById("tutor-select");
const tutorModelInput = document.getElementById("tutor-model");
const testTutorBtn = document.getElementById("test-tutor-btn");
const testTutorStatus = document.getElementById("test-tutor-status");
const tutorEndpointStatus = document.getElementById("tutor-endpoint-status");
const studentSelect = document.getElementById("student-select");
const studentModelInput = document.getElementById("student-model");
const testStudentBtn = document.getElementById("test-student-btn");
const testStudentStatus = document.getElementById("test-student-status");
const studentEndpointStatus = document.getElementById("student-endpoint-status");
const runCountInput = document.getElementById("run-count");
const maxTurnsInput = document.getElementById("max-turns");
const runBtn = document.getElementById("run-btn");
const cartridgePreview = document.getElementById("cartridge-preview");
const runDecisionShape = document.getElementById("run-decision-shape");
const runDecisionDeliverable = document.getElementById("run-decision-deliverable");
const runDecisionRisk = document.getElementById("run-decision-risk");
const refreshRunsBtn = document.getElementById("refresh-runs-btn");
const runsList = document.getElementById("runs-list");
const theater = document.getElementById("theater");
const runHeader = document.getElementById("run-header");
const busyBar = document.getElementById("busy-bar");
const busyLabel = document.getElementById("busy-label");
const banner = document.getElementById("banner");
const transcriptEl = document.getElementById("transcript");
const dialogueSummary = document.getElementById("dialogue-summary");
const dialogueRuns = document.getElementById("dialogue-runs");
const thurmanWorkbench = document.getElementById("thurman-workbench");
const thurmanTitle = document.getElementById("thurman-title");
const thurmanState = document.getElementById("thurman-state");
const thurmanBody = document.getElementById("thurman-body");
const thurmanEvidencePath = document.getElementById("thurman-evidence-path");
const thurmanDecision = document.getElementById("thurman-decision");
const thurmanPrompt = document.getElementById("thurman-prompt");
const copyThurmanPromptBtn = document.getElementById("copy-thurman-prompt-btn");
const openFolderBtn = document.getElementById("open-folder-btn");
const tabButtons = [...document.querySelectorAll("[data-tab-target]")];
const tabPanels = [...document.querySelectorAll("[data-tab-panel]")];
const canonicalGatesCount = document.getElementById("canonical-gates-count");
const canonicalGatesDoctrine = document.getElementById("canonical-gates-doctrine");
const canonicalGatesBody = document.getElementById("canonical-gates-body");
const gateLive = document.getElementById("gate-live");
const gateLiveSummary = document.getElementById("gate-live-summary");
const gateLiveState = document.getElementById("gate-live-state");
const gateLiveEvent = document.getElementById("gate-live-event");
const gateLiveAuthority = document.getElementById("gate-live-authority");
const gateLiveNext = document.getElementById("gate-live-next");
const gateDecisionNext = document.getElementById("gate-decision-next");
const gateDecisionSignal = document.getElementById("gate-decision-signal");
const gateDecisionReason = document.getElementById("gate-decision-reason");
const gateStatusStage = document.getElementById("gate-status-stage");
const gateStatusRouting = document.getElementById("gate-status-routing");
const gateStatusNext = document.getElementById("gate-status-next");
const gateStatusEvidence = document.getElementById("gate-status-evidence");
const gatePipelineStages = document.getElementById("gate-pipeline-stages");
const gateTimelineSummary = document.getElementById("gate-timeline-summary");
const gateTimelineCount = document.getElementById("gate-timeline-count");
const gateTimelineLanes = document.getElementById("gate-timeline-lanes");
const gateTimelineEvents = document.getElementById("gate-timeline-events");
const gateInspectorSummary = document.getElementById("gate-inspector-summary");
const gateInspectorDetails = document.getElementById("gate-inspector-details");
const gateJudgmentMetrics = document.getElementById("gate-judgment-metrics");
const gateComparisonSummary = document.getElementById("gate-comparison-summary");
const gateComparisonMetrics = document.getElementById("gate-comparison-metrics");
const gateComparisonRuns = document.getElementById("gate-comparison-runs");

let cartridges = [];
let latestStatus = null;
let canonicalGates = null;
let latestGateEvent = null;
let activeBatchSnapshot = null;
let activeBatchId = null;
let selectedRunDialogue = null;
let selectedLabRun = null;
let recentLabRuns = [];
let pollTimer = null;
let pollFailures = 0;

const LOOP_STAGES = [
  ["substrate", "context"],
  ["route", "map"],
  ["cold", "evidence"],
  ["repair", "active"],
  ["bridge", "context"],
  ["transfer", "check"],
  ["redrill", "evidence"],
  ["report", "analysis"],
];

function setPill(el, text, mode) {
  el.textContent = text;
  el.dataset.mode = mode;
}

function sourceLabel(mode) {
  if (mode === "lmstudio") return "LM Studio";
  if (mode === "router") return "FreeLLMAPI";
  return mode || "";
}

function selectedModel(provider, input) {
  const value = input.value.trim();
  if (value) return value;
  if (provider === "lmstudio") return "google/gemma-4-12b";
  if (provider === "router") return "auto";
  return "gemini-2.5-flash";
}

function endpointForProvider(provider, status) {
  if (provider === "lmstudio" || provider === "router") return status?.endpoints?.[provider] || null;
  if (provider === "cloud" || provider === "gemini") {
    const gemini = status?.config?.setup_status?.find((item) => item.id === "gemini");
    return {
      label: "Gemini",
      configured: gemini?.status === "ready",
      env_var: "GEMINI_API_KEY",
    };
  }
  return null;
}

function setEndpointStatus(el, provider, status) {
  if (!el) return;
  const endpoint = endpointForProvider(provider, status);
  if (!endpoint) {
    el.textContent = "";
    delete el.dataset.state;
    return;
  }
  if (endpoint.configured) {
    const display = endpoint.base_url_display ? ` ${endpoint.base_url_display}` : "";
    el.textContent = `${endpoint.label} endpoint${display} configured via ${endpoint.env_var}.`;
    el.dataset.state = "ok";
  } else {
    el.textContent = `${endpoint.label} endpoint missing ${endpoint.env_var}.`;
    el.dataset.state = "error";
  }
}

function rolePillMode(provider, status) {
  const endpoint = endpointForProvider(provider, status);
  if (!endpoint) return "checking";
  return endpoint.configured ? "live" : "error";
}

function refreshRolePills(status = latestStatus) {
  if (!status) return;
  const tutorProvider = tutorSelect.value;
  const studentProvider = studentSelect.value;
  const tutorModel = selectedModel(tutorProvider, tutorModelInput);
  const studentModel = selectedModel(studentProvider, studentModelInput);
  const tutorLabel = tutorProvider === "gemini" ? "Gemini" : sourceLabel(tutorProvider);
  const studentLabel = studentProvider === "cloud" ? "Cloud Gemini" : sourceLabel(studentProvider);

  setPill(
    tutorPill,
    `tutor: ${tutorLabel} ${tutorModel}`.trim(),
    rolePillMode(tutorProvider, status),
  );
  setPill(
    studentPill,
    `student: ${studentLabel} ${studentModel}`.trim(),
    rolePillMode(studentProvider, status),
  );
  setEndpointStatus(tutorEndpointStatus, tutorProvider, status);
  setEndpointStatus(studentEndpointStatus, studentProvider, status);
  renderRunDecision();
}

function renderRunDecision() {
  if (!runDecisionShape || !runDecisionDeliverable || !runDecisionRisk) return;
  const count = Math.max(1, Number(runCountInput.value) || 1);
  const tutor = tutorSelect.value === "gemini" ? "Gemini" : sourceLabel(tutorSelect.value);
  const student = studentSelect.value === "cloud" ? "Cloud Gemini" : sourceLabel(studentSelect.value);
  const cart = cartridges.find((entry) => entry.id === cartridgeSelect.value);
  runDecisionShape.textContent = `${count} ${count === 1 ? "run" : "runs"} · ${cart?.label || "scenario"}`;
  runDecisionDeliverable.textContent = count > 1 ? "Report + comparison" : "Report + dialogue";
  const tutorMode = rolePillMode(tutorSelect.value, latestStatus);
  const studentMode = rolePillMode(studentSelect.value, latestStatus);
  runDecisionRisk.textContent =
    tutorMode === "error" || studentMode === "error"
      ? "Model endpoint missing"
      : `${tutor} tutor vs ${student} student`;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body.error || text || res.statusText);
  return body;
}

function option(value, label) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function node(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function badge(text, tone = "") {
  const el = node("span", "gate-badge", text);
  if (tone) el.dataset.tone = tone;
  return el;
}

function setActiveTab(tabName) {
  for (const button of tabButtons) {
    const active = button.dataset.tabTarget === tabName;
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const panel of tabPanels) {
    panel.hidden = panel.dataset.tabPanel !== tabName;
  }
}

function gateFor(type) {
  if (!type || !canonicalGates) return null;
  return canonicalGates.events.find((gate) => gate.type === type) || null;
}

function latestTimelineEntry(snapshot = activeBatchSnapshot) {
  const entries = Array.isArray(snapshot?.timeline) ? snapshot.timeline : [];
  return entries.at(-1) || null;
}

function latestRoutingEntry(snapshot = activeBatchSnapshot) {
  const entries = Array.isArray(snapshot?.timeline) ? snapshot.timeline : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.routing_fact) return entries[index];
  }
  return null;
}

function evidenceStatus(snapshot = activeBatchSnapshot) {
  const reportStatus = snapshot?.report?.evidence_status;
  if (reportStatus) return reportStatus;
  const count = Number(snapshot?.judgment?.score_eligible_events || 0);
  if (count === 0) return "starved";
  return `${count} candidate${count === 1 ? "" : "s"}`;
}

function gateDecision(snapshot = activeBatchSnapshot) {
  const latest = latestTimelineEntry(snapshot);
  const latestEvent = latest?.type || latestSnapshotEvent(snapshot);
  const evidence = evidenceStatus(snapshot);
  const failures = Number(snapshot?.judgment?.failure_events || 0);
  const divergent = Boolean(snapshot?.comparison?.divergent || snapshot?.report?.comparison?.divergent);
  if (!snapshot || (!latestEvent && !snapshot.status)) {
    return ["Run a batch", "idle", "No gate evidence yet."];
  }
  if (snapshot.status === "running" || snapshot.busy) {
    return ["Watch latest gate", latestEvent || "running", "Wait for the routing fact before judging quality."];
  }
  if (latestEvent === "bridge_error" || failures) {
    return ["Fix provider/schema", "failure", `${failures || 1} failure event${failures === 1 ? "" : "s"} observed.`];
  }
  if (evidence === "rejected") {
    return ["Prepare patch", "rejected", "Evidence failed; use the report and dialogue to propose a prompt/output patch."];
  }
  if (divergent || evidence === "caveated") {
    return ["Compare runs", evidence, "Signals diverged; compare signatures before changing prompts."];
  }
  if (evidence === "solid") {
    return ["Keep as baseline", "solid", "Gate path produced usable evidence."];
  }
  if (evidence === "starved") {
    return ["Find missing attempt", "starved", "No score-eligible learner evidence reached the graph path."];
  }
  return ["Inspect gate path", evidence, "Check whether routing and evidence candidates match the intended loop stage."];
}

function renderGateDecision(snapshot = activeBatchSnapshot) {
  if (!gateDecisionNext || !gateDecisionSignal || !gateDecisionReason) return;
  const [next, signal, reason] = gateDecision(snapshot);
  gateDecisionNext.textContent = next;
  gateDecisionSignal.textContent = signal;
  gateDecisionReason.textContent = reason;
}

function renderGateStatus(snapshot = activeBatchSnapshot) {
  const latest = latestTimelineEntry(snapshot);
  const routing = latestRoutingEntry(snapshot);
  const gate = gateFor(routing?.type || latest?.type || latestSnapshotEvent(snapshot));
  if (gateStatusStage) gateStatusStage.textContent = snapshot?.monitor?.stage || latest?.stage || "idle";
  if (gateStatusRouting) gateStatusRouting.textContent = routing?.type || "none";
  if (gateStatusNext) gateStatusNext.textContent = gate?.next_phase || "n/a";
  if (gateStatusEvidence) gateStatusEvidence.textContent = evidenceStatus(snapshot);
}

function renderGatePipeline(snapshot = activeBatchSnapshot) {
  if (!gatePipelineStages) return;
  const currentStage = snapshot?.monitor?.stage || latestTimelineEntry(snapshot)?.stage || "substrate";
  const currentIndex = LOOP_STAGES.findIndex(([name]) => name === currentStage);
  gatePipelineStages.replaceChildren(
    ...LOOP_STAGES.map(([name, role], index) => {
      const item = node("div", "gate-pipeline-stage");
      item.dataset.stage = name;
      item.dataset.state =
        currentIndex < 0 ? "queued" : index < currentIndex ? "done" : name === currentStage ? "active" : "queued";
      item.append(node("strong", "", name), node("span", "", role));
      return item;
    }),
  );
}

function addInspectorPair(label, value) {
  gateInspectorDetails.append(node("dt", "", label), node("dd", "", value || "n/a"));
}

function renderGateInspector(snapshot = activeBatchSnapshot) {
  if (!gateInspectorDetails || !gateInspectorSummary) return;
  const entry = latestTimelineEntry(snapshot);
  const type = entry?.type || latestSnapshotEvent(snapshot);
  const gate = gateFor(type);
  gateInspectorDetails.replaceChildren();
  if (!type) {
    gateInspectorSummary.textContent = "No SEDA event observed for this batch yet.";
    addInspectorPair("Event", "none");
    addInspectorPair("Authority", "n/a");
    addInspectorPair("Graph role", "n/a");
    addInspectorPair("Next phase", "n/a");
    return;
  }
  gateInspectorSummary.textContent = gate?.why_it_exists || "Observed event from the active lab timeline.";
  addInspectorPair("Event", type);
  addInspectorPair("Sequence", entry?.seq ? `#${entry.seq}` : "n/a");
  addInspectorPair("Run / turn", entry ? `run ${entry.run || "?"}, turn ${entry.turn || "?"}` : "n/a");
  addInspectorPair("Graph role", gate?.graph_role || entry?.role || "unknown");
  addInspectorPair("Authority", gate?.authority || entry?.authority || "unknown");
  addInspectorPair("Next phase", gate?.next_phase || entry?.next_phase || "unknown");
}

function judgmentMetric(label, value, tone = "") {
  const item = node("div", "gate-judgment-metric");
  if (tone) item.dataset.tone = tone;
  item.append(node("span", "", label), node("strong", "", String(value)));
  return item;
}

function renderGateJudgment(snapshot = activeBatchSnapshot) {
  if (!gateJudgmentMetrics) return;
  const judgment = snapshot?.judgment || {};
  const reportStatus = snapshot?.report?.evidence_status || "pending";
  const scoreEligible = Number(judgment.score_eligible_events || 0);
  const failures = Number(judgment.failure_events || 0);
  const routing = Number(judgment.routing_events || 0);
  const graphNeutral = Number(judgment.graph_neutral_events || 0);
  gateJudgmentMetrics.replaceChildren(
    judgmentMetric("Evidence candidates", scoreEligible, scoreEligible === 0 ? "warn" : "evidence"),
    judgmentMetric("Graph-neutral events", graphNeutral, "diagnostic"),
    judgmentMetric("Routing facts", routing, routing > 12 ? "warn" : "routing"),
    judgmentMetric("Failures", failures, failures ? "failure" : "quiet"),
    judgmentMetric("Report evidence", reportStatus, reportStatus === "rejected" ? "failure" : "quiet"),
  );
}

function comparisonMetric(label, value, tone = "") {
  const item = node("div", "gate-comparison-metric");
  if (tone) item.dataset.tone = tone;
  item.append(node("span", "", label), node("strong", "", String(value)));
  return item;
}

function renderGateComparison(snapshot = activeBatchSnapshot) {
  if (!gateComparisonMetrics || !gateComparisonRuns || !gateComparisonSummary) return;
  const comparison = snapshot?.comparison || snapshot?.report?.comparison || null;
  const signatures = snapshot?.report?.signatures || snapshot?.report?.runs?.map((run) => run.signature).filter(Boolean) || [];
  gateComparisonMetrics.replaceChildren();
  gateComparisonRuns.replaceChildren();
  if (!comparison && !signatures.length) {
    gateComparisonSummary.textContent = "Run signatures appear after a batch report is ready.";
    gateComparisonMetrics.append(comparisonMetric("Runs", snapshot?.runs || 0, "quiet"));
    return;
  }
  gateComparisonSummary.textContent = comparison?.divergent
    ? "Runs diverged; compare signatures before changing prompts."
    : "Runs share the same signature shape or this is a single-run batch.";
  gateComparisonMetrics.append(
    comparisonMetric("Runs", comparison?.run_count || signatures.length || 0, "quiet"),
    comparisonMetric("Variants", comparison?.signature_variants ?? 0, comparison?.divergent ? "warn" : "quiet"),
    comparisonMetric(
      "Evidence range",
      `${comparison?.evidence_range?.min ?? 0}-${comparison?.evidence_range?.max ?? 0}`,
      (comparison?.evidence_starved_runs || []).length ? "warn" : "evidence",
    ),
    comparisonMetric("Failure runs", (comparison?.failure_runs || []).join(", ") || "none", (comparison?.failure_runs || []).length ? "failure" : "quiet"),
  );
  for (const signature of signatures) {
    const item = node("article", "gate-comparison-run");
    item.append(
      node("strong", "", `Run ${signature.index || "?"}`),
      node("span", "", signature.signature || "signature unavailable"),
      node(
        "small",
        "",
        `terminal=${signature.terminal_event || "none"} · evidence=${signature.score_eligible_events || 0} · failures=${signature.failure_events || 0} · graph=${signature.graph_badge || "unknown"}`,
      ),
    );
    gateComparisonRuns.append(item);
  }
}

function renderGateObservatory(snapshot = activeBatchSnapshot) {
  renderGateDecision(snapshot);
  renderGateStatus(snapshot);
  renderGatePipeline(snapshot);
  renderGateInspector(snapshot);
  renderGateJudgment(snapshot);
  renderGateComparison(snapshot);
}

function timelineRole(entry) {
  if (entry.group === "failure" || entry.type === "bridge_error") return "failure";
  if (entry.score_eligible) return "evidence";
  if (entry.routing_fact && !entry.graph_neutral) return "routing";
  if (entry.graph_neutral) return "diagnostic";
  return "context";
}

function timelineRoleLabel(role) {
  if (role === "evidence") return "Evidence candidates";
  if (role === "routing") return "Routing facts";
  if (role === "diagnostic") return "Diagnostics";
  if (role === "failure") return "Failures";
  return "Context";
}

function renderTimelineLanes(entries) {
  if (!gateTimelineLanes) return;
  const roles = ["routing", "evidence", "diagnostic", "failure", "context"];
  const counts = Object.fromEntries(roles.map((role) => [role, 0]));
  for (const entry of entries) counts[timelineRole(entry)] += 1;
  gateTimelineLanes.replaceChildren(
    ...roles.map((role) => {
      const lane = node("div", "gate-timeline-lane");
      lane.dataset.role = role;
      lane.append(
        node("strong", "", String(counts[role])),
        node("span", "", timelineRoleLabel(role)),
      );
      return lane;
    }),
  );
}

function burstCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    const key = `${entry.run || "?"}:${entry.turn || "?"}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function formatDurationMs(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return null;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s`;
  return `${Math.round(value)}ms`;
}

function timelineNoteText(entry, role) {
  if (entry.error) {
    const action = entry.action ? `${entry.action}: ` : "";
    const timeout = formatDurationMs(entry.timeout_ms);
    const duration = formatDurationMs(entry.duration_ms);
    const timing = timeout
      ? ` after ${timeout}`
      : duration
        ? ` in ${duration}`
        : "";
    return `${action}${entry.error}${timing}${entry.message ? ` - ${entry.message}` : ""}`;
  }
  if (role === "evidence") return "Evidence candidate only; graph truth is still derived later.";
  if (entry.next_phase && entry.next_phase !== "not a routing fact") return `next: ${entry.next_phase}`;
  return entry.authority || "context";
}

function renderTimelineEntry(entry, counts) {
  const role = timelineRole(entry);
  const row = node("li", "gate-timeline-row");
  row.dataset.role = role;
  row.dataset.eventType = entry.type;
  const burstKey = `${entry.run || "?"}:${entry.turn || "?"}`;
  const burstCount = counts[burstKey] || 1;

  const seq = node("span", "gate-timeline-seq", `#${entry.seq}`);
  const body = node("div", "gate-timeline-row-body");
  const top = node("div", "gate-timeline-row-top");
  top.append(
    node("strong", "gate-timeline-type", entry.type),
    badge(entry.role || role, role === "evidence" ? "evidence" : role),
  );
  const meta = node("div", "gate-timeline-meta");
  meta.append(
    node("span", "", `run ${entry.run || "?"}`),
    node("span", "", `turn ${entry.turn || "?"}`),
    node("span", "", entry.stage || entry.group || "stage unknown"),
    node("span", "", entry.group || "group unknown"),
  );
  const note = node(
    "p",
    "gate-timeline-note",
    timelineNoteText(entry, role),
  );
  const chips = node("div", "gate-timeline-chips");
  chips.append(badge(`burst ${burstCount}`, burstCount > 1 ? "replay" : "context"));
  if (entry.timeout_ms != null) chips.append(badge(`timeout ${formatDurationMs(entry.timeout_ms)}`, "failure"));
  if (entry.duration_ms != null) chips.append(badge(`duration ${formatDurationMs(entry.duration_ms)}`, "diagnostic"));
  body.append(top, meta, note, chips);
  row.append(seq, body);
  return row;
}

function renderGateTimeline(snapshot = activeBatchSnapshot) {
  const entries = Array.isArray(snapshot?.timeline) ? snapshot.timeline : [];
  if (gateTimelineCount) {
    gateTimelineCount.textContent = `${entries.length} event${entries.length === 1 ? "" : "s"}`;
  }
  if (gateTimelineSummary) {
    gateTimelineSummary.textContent = entries.length
      ? `Ordered SEDA facts for ${snapshot?.status || "active"} batch.`
      : "Run a batch to see ordered events by role.";
  }
  renderTimelineLanes(entries);
  if (!gateTimelineEvents) return;
  if (!entries.length) {
    const empty = node("li", "gate-timeline-empty", "No timeline events yet.");
    gateTimelineEvents.replaceChildren(empty);
    return;
  }
  const counts = burstCounts(entries);
  gateTimelineEvents.replaceChildren(...entries.map((entry) => renderTimelineEntry(entry, counts)));
}

function latestSnapshotEvent(snapshot) {
  if (snapshot?.monitor && Object.hasOwn(snapshot.monitor, "latestEvent") && snapshot.monitor.latestEvent) {
    return snapshot.monitor.latestEvent;
  }
  if (snapshot?.busy || snapshot?.status === "running") {
    return null;
  }
  return latestGateEvent || null;
}

function renderGateLive(snapshot = activeBatchSnapshot) {
  if (!gateLive) return;
  const latestEvent = latestSnapshotEvent(snapshot);
  const gate = gateFor(latestEvent);
  const hasActiveRun = Boolean(snapshot?.busy || snapshot?.status === "running");
  let state = snapshot?.status || (hasActiveRun ? "running" : "idle");
  let tone = hasActiveRun ? "watch" : "idle";
  let summary = hasActiveRun
    ? "Waiting for the first event from the active batch."
    : "Start a batch to watch the latest event move through the gate map.";

  if (snapshot?.status === "error") {
    tone = "error";
    summary = snapshot.error || "Batch failed before a founder report was produced.";
  } else if (latestEvent === "bridge_error") {
    tone = "error";
    summary = "Bridge/schema failure surfaced. Inspect the run diagnostics before trusting downstream evidence.";
  } else if (snapshot?.status === "done" && snapshot.report?.evidence_status === "rejected") {
    tone = "error";
    summary = `Evidence rejected: ${snapshot.report.recommendation || "review the batch report."}`;
  } else if (snapshot?.status === "done" && snapshot.report?.evidence_status) {
    tone = snapshot.report.evidence_status === "solid" ? "evidence" : "neutral";
    summary = `Batch finished with ${snapshot.report.evidence_status} evidence: ${snapshot.report.recommendation || "review the batch report."}`;
  } else if (gate?.score_eligible) {
    tone = "evidence";
    summary = "Latest event is an evidence candidate; graph truth still depends on derivation gates.";
  } else if (gate?.graph_neutral) {
    tone = "neutral";
    summary = "Latest event is graph-neutral context/control. It can explain breakage without becoming mastery evidence.";
  } else if (gate) {
    tone = "watch";
    summary = "Latest event is moving through the canonical route map.";
  }

  gateLive.dataset.state = tone;
  gateLiveSummary.textContent = summary;
  gateLiveState.textContent = state;
  gateLiveEvent.textContent = latestEvent || "none";
  gateLiveAuthority.textContent = gate?.authority || "n/a";
  gateLiveNext.textContent = gate?.next_phase || "n/a";
}

function gateFlagBadges(gate) {
  const badges = [];
  badges.push(
    gate.score_eligible
      ? badge("evidence candidate", "evidence")
      : badge(gate.graph_neutral ? "graph-neutral" : "context", gate.graph_neutral ? "neutral" : "context"),
  );
  if (gate.routing_fact) badges.push(badge("routing fact", "routing"));
  if (gate.learner_text) badges.push(badge("learner text", "learner"));
  if (gate.replay_relevant) badges.push(badge("replay", "replay"));
  if (gate.requires_kc_id) badges.push(badge("KC required", "kc"));
  if (gate.bridge_actions?.length) badges.push(badge("bridge", "bridge"));
  return badges;
}

function renderGate(gate) {
  const row = node("article", "gate-row");
  row.dataset.eventType = gate.type;
  if (gate.type === latestGateEvent) row.dataset.active = "true";

  const top = node("div", "gate-row-top");
  top.append(node("strong", "gate-type", gate.type));
  const badges = node("div", "gate-badges");
  badges.append(...gateFlagBadges(gate));
  top.append(badges);

  const why = node("p", "gate-why", gate.why_it_exists);
  const meta = node("dl", "gate-meta");
  const pairs = [
    ["Next", gate.next_phase],
    ["Authority", gate.authority],
    ["Docs", (gate.docs || []).slice(0, 3).join(" · ")],
  ];
  for (const [label, value] of pairs) {
    meta.append(node("dt", "", label), node("dd", "", value || "n/a"));
  }

  row.append(top, why, meta);
  return row;
}

function renderCanonicalGates(activeEvent = latestGateEvent) {
  if (!canonicalGates || !canonicalGatesBody) return;
  latestGateEvent = activeEvent || null;
  canonicalGatesCount.textContent = `${canonicalGates.events.length} events`;
  canonicalGatesDoctrine.replaceChildren(
    ...canonicalGates.doctrine.map((item) => badge(item, item.includes("Only") ? "evidence" : "doctrine")),
  );
  canonicalGatesBody.replaceChildren();
  for (const group of canonicalGates.groups) {
    const gates = canonicalGates.events.filter((gate) => gate.group === group.id);
    const section = node("section", "gate-group");
    const header = node("div", "gate-group-header");
    header.append(node("h3", "", group.label), node("span", "", `${gates.length}`));
    const rows = node("div", "gate-group-rows");
    rows.append(...gates.map(renderGate));
    section.append(header, rows);
    canonicalGatesBody.append(section);
  }
  renderGateLive();
  renderGateTimeline();
  renderGateObservatory();
}

async function loadCanonicalGates() {
  try {
    canonicalGates = await fetchJson("/api/lab/gates");
    renderCanonicalGates();
  } catch (err) {
    if (canonicalGatesCount) canonicalGatesCount.textContent = "unavailable";
    if (canonicalGatesBody) {
      canonicalGatesBody.replaceChildren(
        node("p", "canonical-gates-loading", String(err.message || err)),
      );
    }
  }
}

function setModelDefaults(status) {
  const loop = status?.loop || {};
  if (!tutorModelInput.value.trim()) {
    if (tutorSelect.value === "lmstudio" || tutorSelect.value === "router") {
      const option = loop.llm_options?.find(
        (entry) =>
          entry.provider === "openai_compatible" &&
          entry.target === tutorSelect.value &&
          entry.model,
      );
      tutorModelInput.value =
        option?.model || (tutorSelect.value === "lmstudio" ? "google/gemma-4-12b" : "auto");
    } else {
      tutorModelInput.value = loop.llm_model || "gemini-2.5-flash";
    }
  }

  const student = status?.student?.[studentSelect.value] || {};
  if (!studentModelInput.value.trim()) {
    studentModelInput.value =
      student.model ||
      (studentSelect.value === "lmstudio"
        ? "google/gemma-4-12b"
        : studentSelect.value === "router"
          ? "auto"
          : "gemini-2.5-flash");
  }
}

async function refreshStatus() {
  try {
    const status = await fetchJson("/api/lab/status");
    latestStatus = status;
    const loop = status.loop || {};
    if (loop.status === "ok") {
      setPill(loopPill, "loop online", "live");
    } else {
      setPill(loopPill, "loop offline", "error");
    }
    setModelDefaults(status);
    refreshRolePills(status);
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
    conceptInput.value = "";
    goalInput.value = "";
    return;
  }
  conceptInput.value = cart.concept || "";
  goalInput.value = cart.learner_goal || "";
  cartridgePreview.hidden = false;
  cartridgePreview.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = cart.label;
  const hint = document.createElement("span");
  hint.textContent = `Persona: ${cart.persona_hint || "(none)"}`;
  cartridgePreview.append(title, hint);
  renderRunDecision();
}

async function loadCartridges() {
  const data = await fetchJson("/api/lab/cartridges");
  cartridges = data.cartridges || [];
  cartridgeSelect.replaceChildren(...cartridges.map((c) => option(c.id, c.label)));
  if (cartridges.length) {
    cartridgeSelect.value = cartridges[0].id;
    renderCartridgePreview(cartridges[0].id);
  }
}

function setRunning(running) {
  runBtn.disabled = running;
  theater.setAttribute("aria-busy", running ? "true" : "false");
}

function showBanner(text, kind) {
  banner.hidden = false;
  banner.textContent = text;
  banner.className = `run-banner ${kind || ""}`;
}

function setModelTestStatus(el, text, state = "") {
  if (!el) return;
  el.textContent = text || "";
  if (state) el.dataset.state = state;
  else delete el.dataset.state;
}

function clearModelTestStatus(kind = "both") {
  if (kind === "tutor" || kind === "both") setModelTestStatus(testTutorStatus, "");
  if (kind === "student" || kind === "both") setModelTestStatus(testStudentStatus, "");
}

async function testModel(kind) {
  const isTutor = kind === "tutor";
  const button = isTutor ? testTutorBtn : testStudentBtn;
  const statusEl = isTutor ? testTutorStatus : testStudentStatus;
  const provider = isTutor ? tutorSelect.value : studentSelect.value;
  const model = (isTutor ? tutorModelInput.value : studentModelInput.value).trim();

  button.disabled = true;
  setModelTestStatus(statusEl, "testing…");
  try {
    const result = await fetchJson("/api/lab/model-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: kind, provider, model }),
    });
    const latency = Number.isFinite(result.latency_ms) ? ` ${result.latency_ms}ms` : "";
    setModelTestStatus(
      statusEl,
      `${result.ok ? "ok" : "failed"}${latency}: ${result.message || "no detail"}`,
      result.ok ? "ok" : "error",
    );
  } catch (err) {
    setModelTestStatus(statusEl, String(err.message || err), "error");
  } finally {
    button.disabled = false;
  }
}

function renderAxisTable(report) {
  const table = document.createElement("table");
  table.className = "report-table";
  const head = document.createElement("thead");
  head.innerHTML = "<tr><th>Axis</th><th>Pass</th><th>Watch</th><th>Fail</th></tr>";
  const body = document.createElement("tbody");
  for (const [axis, counts] of Object.entries(report.axis_counts || {})) {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${axis}</td><td>${counts.pass || 0}</td><td>${counts.watch || 0}</td><td>${counts.fail || 0}</td>`;
    body.appendChild(row);
  }
  table.append(head, body);
  return table;
}

function renderRunTable(report) {
  const table = document.createElement("table");
  table.className = "report-table";
  const head = document.createElement("thead");
  head.innerHTML = "<tr><th>Run</th><th>Overall</th><th>Evaluator</th><th>Graph</th><th>Signal</th></tr>";
  const body = document.createElement("tbody");
  for (const run of report.runs || []) {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${run.index}</td><td>${run.overall}</td><td>${run.evaluator_spaced_classification || "n/a"}</td><td>${run.graph_badge || "n/a"}</td><td>${run.signature?.signature || "n/a"}</td>`;
    body.appendChild(row);
  }
  table.append(head, body);
  return table;
}

function renderReport(report) {
  transcriptEl.replaceChildren();
  const summary = document.createElement("article");
  summary.className = "report-card";

  const title = document.createElement("h2");
  title.textContent = "Batch report";
  const meta = document.createElement("p");
  meta.textContent = `${report.run_count} runs · evidence ${report.evidence_status}`;
  const recommendation = document.createElement("p");
  recommendation.className = "recommendation";
  recommendation.textContent = report.recommendation;

  summary.append(title, meta, recommendation, renderAxisTable(report), renderRunTable(report));
  transcriptEl.appendChild(summary);
}

function formatRunDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function runPrimaryText(run) {
  return [run.concept, run.cartridgeId || run.label].filter(Boolean).join(" · ") || run.id;
}

function runDecision(run) {
  if (run.source === "founder-batch") {
    if (run.evidence === "rejected") return ["Patch candidate", "bad"];
    if (run.evidence === "caveated") return ["Compare runs", "warn"];
    if (run.evidence === "solid") return ["Keep signal", "good"];
    return ["Review report", "warn"];
  }
  if (run.status === "error") return ["Debug run", "bad"];
  if (run.status === "cancelled") return ["Ignore", "quiet"];
  return ["Inspect dialogue", "quiet"];
}

function runEvidencePath(run) {
  return run?.reportPath || run?.outDir || run?.id || "n/a";
}

function thurmanDeliverable(run, payload = selectedRunDialogue) {
  const [decision] = runDecision(run || {});
  const path = runEvidencePath(run);
  const turnCount = (payload?.dialogue?.runs || []).reduce(
    (sum, entry) => sum + Number(entry.turn_count || entry.turns?.length || 0),
    0,
  );
  if (!run) {
    return {
      title: "Select founder evidence",
      state: "idle",
      body: "Choose a founder run to prepare one bounded Thurman deliverable.",
      prompt: "",
    };
  }
  if (run.source !== "founder-batch") {
    return {
      title: "No patch prompt",
      state: "read-only",
      body: "This is a debug/persona run. Use it to inspect runner behavior, not to propose product or prompt patches.",
      prompt: "",
    };
  }
  if (decision === "Patch candidate") {
    return {
      title: "Prompt/output patch proposal",
      state: "copy-ready",
      body: `Evidence was rejected. Ask for the smallest copy/prompt/output patch, then rerun this same cartridge before treating it as a product fix.`,
      prompt: [
        "Inspect this Socratink founder run and propose the smallest copy/prompt/output patch only.",
        `Evidence path: ${path}`,
        `Dialogue endpoint: /api/lab/runs/${encodeURIComponent(run.dialogueId || run.id)}/dialogue`,
        `Observed decision: ${decision}; evidence=${run.evidence || "n/a"}; turns=${turnCount}.`,
        "Preserve SEDA graph-truth boundaries. Do not apply patches. Recommend exactly one rerun/comparison check.",
      ].join("\n"),
    };
  }
  if (decision === "Compare runs") {
    return {
      title: "Comparison recommendation",
      state: "copy-ready",
      body: "Evidence is caveated. Compare another run against this signature before changing prompts.",
      prompt: [
        "Compare this Socratink founder run before proposing any prompt change.",
        `Evidence path: ${path}`,
        `Dialogue endpoint: /api/lab/runs/${encodeURIComponent(run.dialogueId || run.id)}/dialogue`,
        `Observed decision: ${decision}; evidence=${run.evidence || "n/a"}; turns=${turnCount}.`,
        "Return the smallest next experiment and only propose a patch if both runs show the same failure.",
      ].join("\n"),
    };
  }
  return {
    title: "No patch indicated",
    state: "baseline",
    body: "This founder run is not asking for a Thurman patch prompt. Keep it as evidence or compare it manually.",
    prompt: "",
  };
}

function renderThurmanWorkbench(run = selectedLabRun, payload = selectedRunDialogue) {
  if (!thurmanWorkbench) return;
  const deliverable = thurmanDeliverable(run, payload);
  thurmanWorkbench.hidden = false;
  thurmanTitle.textContent = deliverable.title;
  thurmanState.textContent = deliverable.state;
  thurmanBody.textContent = deliverable.body;
  thurmanEvidencePath.textContent = runEvidencePath(run);
  thurmanDecision.textContent = run ? runDecision(run)[0] : "n/a";
  thurmanPrompt.value = deliverable.prompt;
  thurmanPrompt.hidden = !deliverable.prompt;
  copyThurmanPromptBtn.hidden = !deliverable.prompt;
}

function runSortScore(run) {
  const [decision] = runDecision(run);
  if (decision === "Patch candidate") return 0;
  if (decision === "Compare runs") return 1;
  if (run.source === "founder-batch") return 2;
  if (decision === "Debug run") return 3;
  return 4;
}

function renderRunsSummary(runs) {
  const founder = runs.filter((run) => run.source === "founder-batch");
  const needsAction = runs.filter((run) => {
    const [label] = runDecision(run);
    return label === "Patch candidate" || label === "Compare runs" || label === "Debug run";
  });
  const latest = runs[0];
  const strip = node("div", "runs-summary");
  for (const [label, value] of [
    ["Founder reports", founder.length],
    ["Needs action", needsAction.length],
    ["Latest", latest ? formatRunDate(latest.updatedAtIso) : "none"],
  ]) {
    const item = node("div", "runs-summary-item");
    item.append(node("span", "", label), node("strong", "", String(value)));
    strip.append(item);
  }
  return strip;
}

function renderRuns(runs) {
  if (!runsList) return;
  recentLabRuns = runs;
  runsList.replaceChildren();
  if (!runs.length) {
    runsList.append(node("p", "runs-empty", "No run artifacts found yet."));
    renderThurmanWorkbench(null);
    return;
  }
  runsList.append(renderRunsSummary(runs));
  const sortedRuns = [...runs].sort((a, b) => {
    const score = runSortScore(a) - runSortScore(b);
    if (score) return score;
    return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  });
  const table = node("table", "runs-table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Updated", "Source", "Run", "Decision", "Evidence", "Report"]) {
    headRow.append(node("th", "", label));
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const run of sortedRuns) {
    const [decision, tone] = runDecision(run);
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.dataset.source = run.source || "run";
    row.dataset.dialogueId = run.dialogueId || "";
    row.dataset.clickable = run.dialogueId ? "true" : "false";
    row.dataset.selected = selectedLabRun?.id === run.id ? "true" : "false";
    row.append(
      node("td", "", formatRunDate(run.updatedAtIso)),
      node("td", "", run.source || "run"),
      node("td", "", runPrimaryText(run)),
      node("td", "runs-decision", decision),
      node("td", "", run.evidence || "n/a"),
      node("td", "runs-path", run.reportPath || run.outDir || ""),
    );
    row.querySelector(".runs-decision").dataset.tone = tone;
    if (run.dialogueId) {
      row.addEventListener("click", () => loadRunDialogue(run));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          loadRunDialogue(run);
        }
      });
    }
    body.append(row);
  }
  table.append(head, body);
  runsList.append(table);
}

async function loadRuns() {
  if (!runsList) return;
  runsList.replaceChildren(node("p", "runs-empty", "Loading runs…"));
  try {
    const data = await fetchJson("/api/lab/runs");
    renderRuns(data.runs || []);
  } catch (err) {
    runsList.replaceChildren(node("p", "runs-empty", String(err.message || err)));
  }
}

async function loadRunDialogue(run) {
  const dialogueId = typeof run === "string" ? run : run.dialogueId;
  const payload = await fetchJson(`/api/lab/runs/${encodeURIComponent(dialogueId)}/dialogue`);
  selectedRunDialogue = payload;
  selectedLabRun = typeof run === "string"
    ? recentLabRuns.find((entry) => entry.dialogueId === run) || null
    : run;
  activeBatchSnapshot = {
    status: "done",
    dialogue: payload.dialogue,
  };
  renderRuns(recentLabRuns);
  renderThurmanWorkbench(selectedLabRun, payload);
  renderDialogue(activeBatchSnapshot);
  setActiveTab("dialogue");
}

function renderDialogue(snapshot = activeBatchSnapshot) {
  if (!dialogueRuns) return;
  renderThurmanWorkbench(selectedLabRun, selectedRunDialogue);
  const runs = Array.isArray(snapshot?.dialogue?.runs) ? snapshot.dialogue.runs : [];
  const turnCount = runs.reduce((sum, run) => sum + Number(run.turn_count || run.turns?.length || 0), 0);
  if (dialogueSummary) {
    dialogueSummary.textContent = runs.length
      ? `${selectedRunDialogue?.source || runs.length} · ${turnCount} turn${turnCount === 1 ? "" : "s"}`
      : snapshot?.status === "running"
        ? "dialogue appears after completed turns"
        : "no dialogue available";
  }
  dialogueRuns.replaceChildren();
  if (!runs.length) {
    dialogueRuns.append(
      node(
        "p",
        "dialogue-empty",
        snapshot?.status === "running"
          ? "The batch is running. Dialogue appears after each completed turn."
          : "Run a batch to inspect the actual exchange.",
      ),
    );
    return;
  }

  for (const run of runs) {
    const article = node("article", "dialogue-run");
    const header = node("div", "dialogue-run-header");
    header.append(
      node("h3", "", `Run ${run.index ?? "?"}`),
      node("span", "", `${Number(run.turn_count || run.turns?.length || 0)} turns`),
    );
    article.append(header);

    const turns = node("ol", "dialogue-turns");
    for (const turn of run.turns || []) {
      const item = node("li", "dialogue-turn");
      const meta = node(
        "div",
        "dialogue-turn-meta",
        `Turn ${turn.n ?? "?"} · ${turn.phase || "unknown"} · ${turn.awaiting || "n/a"}`,
      );
      item.append(meta);
      if (turn.student) {
        const student = node("p", "dialogue-student");
        student.append(node("strong", "", "Student"), document.createTextNode(` ${turn.student}`));
        item.append(student);
      }
      const lines = Array.isArray(turn.lines) ? turn.lines : [];
      if (lines.length) {
        const transcript = node("div", "dialogue-transcript");
        for (const line of lines) transcript.append(node("p", "", line));
        item.append(transcript);
      }
      turns.append(item);
    }
    article.append(turns);
    dialogueRuns.append(article);
  }
}

function renderLoopStage(stage, currentStage) {
  const currentIndex = LOOP_STAGES.findIndex(([name]) => name === currentStage);
  const index = LOOP_STAGES.findIndex(([name]) => name === stage[0]);
  const card = node("div", "loop-state-stage");
  card.dataset.stage = stage[0];
  card.dataset.state = index < currentIndex ? "done" : stage[0] === currentStage ? "active" : "queued";
  const label = node("strong", "", stage[0]);
  const detail = node("span", "", stage[1]);
  card.append(label, detail);
  return card;
}

function renderRunRows(monitor) {
  const rows = node("div", "loop-run-rows");
  const total = Math.max(1, Number(monitor.total) || 1);
  const completed = Math.max(0, Number(monitor.completed) || 0);
  const activeRun = Number(monitor.activeRun) || null;
  for (let i = 1; i <= total; i += 1) {
    const row = node("div", "loop-run-row");
    row.dataset.state = i <= completed ? "done" : i === activeRun ? "active" : "queued";
    row.append(
      node("strong", "", `Run ${i}`),
      node("span", "", i <= completed ? "complete" : i === activeRun ? monitor.state || "running" : "queued"),
    );
    rows.append(row);
  }
  return rows;
}

function renderLoopMonitor(snapshot) {
  const monitor = snapshot.monitor || {};
  const currentStage = monitor.stage || "substrate";
  const completed = Number(monitor.completed) || 0;
  const total = Number(monitor.total || snapshot.runs) || 1;

  const shell = node("article", "loop-state-monitor");
  const header = node("div", "loop-state-header");
  const title = node("div", "loop-state-title");
  title.append(node("h2", "", "Pedagogical loop state"), node("p", "", monitor.label || snapshot.busyLabel || "running batch"));
  const badges = node("div", "loop-state-badges");
  badges.append(
    node("span", "loop-state-badge", `${completed}/${total} complete`),
    node("span", "loop-state-badge loop-state-badge-active", currentStage),
  );
  header.append(title, badges);

  const body = node("div", "loop-state-body");
  const diagram = node("section", "loop-state-diagram");
  const stageGrid = node("div", "loop-state-grid");
  for (const stage of LOOP_STAGES) stageGrid.append(renderLoopStage(stage, currentStage));
  const rails = node("div", "loop-state-rails");
  rails.append(
    node("p", "", "Context: substrate · route · bridge"),
    node("p", "", "Evidence: cold · spaced redrill"),
    node("p", "", "Graph: derived after evidence"),
  );
  diagram.append(stageGrid, rails);

  const side = node("aside", "loop-state-side");
  side.append(node("h3", "", activeBatchId ? "Batch runs" : "Run queue"), renderRunRows({ ...monitor, total }));
  if (monitor.latestEvent) {
    const event = node("p", "loop-state-event", `latest event: ${monitor.latestEvent}`);
    side.append(event);
  }
  body.append(diagram, side);
  shell.append(header, body);
  transcriptEl.replaceChildren(shell);
}

function renderIdleMonitor() {
  if (activeBatchId || transcriptEl.children.length > 0) return;
  renderDialogue(null);
  renderLoopMonitor({
    runs: Number(runCountInput.value) || 1,
    monitor: {
      total: Number(runCountInput.value) || 1,
      completed: 0,
      activeRun: null,
      stage: "substrate",
      state: "ready",
      label: "ready to run closed-loop batch",
    },
  });
}

function renderBatchSnapshot(snapshot) {
  selectedRunDialogue = null;
  selectedLabRun = null;
  activeBatchSnapshot = snapshot;
  runHeader.hidden = false;
  runHeader.textContent = [
    `${snapshot.runs} runs`,
    snapshot.concept ? `concept=${snapshot.concept}` : null,
    `tutor=${snapshot.tutor}${snapshot.tutorModel ? `:${snapshot.tutorModel}` : ""}`,
    `student=${snapshot.student}${snapshot.studentModel ? `:${snapshot.studentModel}` : ""}`,
  ].filter(Boolean).join(" · ");

  if (snapshot.busy) {
    busyBar.hidden = false;
    busyLabel.textContent = snapshot.busyLabel || "running batch";
    renderCanonicalGates(snapshot.monitor?.latestEvent || latestGateEvent);
    renderGateLive(snapshot);
    renderGateTimeline(snapshot);
    renderGateObservatory(snapshot);
    renderDialogue(snapshot);
    renderLoopMonitor(snapshot);
  } else {
    busyBar.hidden = true;
    renderCanonicalGates(snapshot.monitor?.latestEvent || latestGateEvent);
    renderGateLive(snapshot);
    renderGateTimeline(snapshot);
    renderGateObservatory(snapshot);
    renderDialogue(snapshot);
  }

  if (snapshot.status === "done") {
    renderReport(snapshot.report || {});
    showBanner(`report ready: ${snapshot.reportPath || snapshot.batchDir}`, "done");
    loadRuns();
    setRunning(false);
    if (snapshot.batchDir || snapshot.outRoot) {
      openFolderBtn.hidden = false;
      openFolderBtn.disabled = false;
    }
    stopPoll();
  } else if (snapshot.status === "error") {
    renderDialogue(snapshot);
    showBanner(snapshot.error || "batch failed", "error");
    setRunning(false);
    stopPoll();
  }
}

async function pollBatch() {
  if (!activeBatchId) return;
  try {
    const snapshot = await fetchJson(`/api/lab/batches/${activeBatchId}`);
    pollFailures = 0;
    renderBatchSnapshot(snapshot);
  } catch (err) {
    pollFailures += 1;
    if (pollFailures < 180) {
      busyBar.hidden = false;
      busyLabel.textContent = `waiting for server (${pollFailures}s)`;
      return;
    }
    showBanner(String(err.message || err), "error");
    setRunning(false);
    stopPoll();
  }
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(pollBatch, 1000);
  pollBatch();
}

function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function validateLocalChoices() {
  if (!conceptInput.value.trim()) {
    throw new Error("Concept is required.");
  }
  if (!goalInput.value.trim()) {
    throw new Error("Goal is required.");
  }
  if ((tutorSelect.value === "lmstudio" || tutorSelect.value === "router") && !tutorModelInput.value.trim()) {
    throw new Error("Selected tutor endpoint requires a model id.");
  }
  if ((studentSelect.value === "lmstudio" || studentSelect.value === "router") && !studentModelInput.value.trim()) {
    throw new Error("Selected student endpoint requires a model id.");
  }
}

async function startBatch() {
  const cartridgeId = cartridgeSelect.value;
  if (!cartridgeId) return;
  validateLocalChoices();

  transcriptEl.replaceChildren();
  selectedRunDialogue = null;
  selectedLabRun = null;
  activeBatchSnapshot = {
    status: "running",
    busy: true,
    busyLabel: "starting batch",
    monitor: { latestEvent: null },
  };
  pollFailures = 0;
  banner.hidden = true;
  runHeader.hidden = true;
  openFolderBtn.hidden = true;
  openFolderBtn.disabled = true;
  renderGateLive(activeBatchSnapshot);
  renderGateTimeline(activeBatchSnapshot);
  renderGateObservatory(activeBatchSnapshot);
  renderThurmanWorkbench(null);
  renderDialogue(activeBatchSnapshot);

  setRunning(true);
  const body = {
    cartridgeId,
    concept: conceptInput.value.trim(),
    learnerGoal: goalInput.value.trim(),
    runs: Number(runCountInput.value) || 1,
    tutor: tutorSelect.value,
    tutorModel: tutorModelInput.value.trim(),
    student: studentSelect.value,
    studentModel: studentModelInput.value.trim(),
    maxTurns: Number(maxTurnsInput.value) || 24,
    allowFake: false,
  };
  const { batchId } = await fetchJson("/api/lab/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  activeBatchId = batchId;
  startPoll();
}

cartridgeSelect.addEventListener("change", () => {
  renderCartridgePreview(cartridgeSelect.value);
});
tutorSelect.addEventListener("change", () => {
  tutorModelInput.value = "";
  clearModelTestStatus("tutor");
  setModelDefaults(latestStatus);
  refreshRolePills(latestStatus);
  renderRunDecision();
});
studentSelect.addEventListener("change", () => {
  studentModelInput.value = "";
  clearModelTestStatus("student");
  refreshStatus();
  renderRunDecision();
});
tutorModelInput.addEventListener("input", () => {
  clearModelTestStatus("tutor");
  refreshRolePills(latestStatus);
  renderRunDecision();
});
studentModelInput.addEventListener("input", () => {
  clearModelTestStatus("student");
  refreshRolePills(latestStatus);
  renderRunDecision();
});
runCountInput.addEventListener("input", renderRunDecision);
maxTurnsInput.addEventListener("input", renderRunDecision);
testTutorBtn.addEventListener("click", () => testModel("tutor"));
testStudentBtn.addEventListener("click", () => testModel("student"));
refreshRunsBtn?.addEventListener("click", () => loadRuns());
copyThurmanPromptBtn?.addEventListener("click", async () => {
  const value = thurmanPrompt?.value || "";
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copyThurmanPromptBtn.textContent = "Copied";
    setTimeout(() => {
      copyThurmanPromptBtn.textContent = "Copy prompt";
    }, 1200);
  } catch {
    thurmanPrompt.select();
  }
});
for (const button of tabButtons) {
  button.addEventListener("click", () => setActiveTab(button.dataset.tabTarget));
}
runBtn.addEventListener("click", () => startBatch().catch((err) => {
  showBanner(String(err.message || err), "error");
  setRunning(false);
  activeBatchSnapshot = { status: "error", error: String(err.message || err) };
  renderGateLive(activeBatchSnapshot);
  renderGateTimeline(activeBatchSnapshot);
  renderGateObservatory(activeBatchSnapshot);
}));
openFolderBtn.addEventListener("click", async () => {
  if (!activeBatchId) return;
  try {
    await fetchJson(`/api/lab/batches/${activeBatchId}/reveal`, { method: "POST" });
  } catch (err) {
    showBanner(String(err.message || err), "error");
  }
});

refreshStatus();
loadCartridges().catch((err) => showBanner(String(err.message || err), "error"));
loadRuns();
loadCanonicalGates();
renderGateTimeline();
renderGateObservatory();
renderRunDecision();
renderIdleMonitor();
setInterval(refreshStatus, 15_000);
