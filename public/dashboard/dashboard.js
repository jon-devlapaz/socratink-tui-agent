const statusEl = document.getElementById("status");
const statusPillEl = document.getElementById("status-pill");

function byId(id) {
  return document.getElementById(id);
}

function setLoadState(state, message) {
  if (statusPillEl) {
    statusPillEl.dataset.state = state;
    statusPillEl.textContent = message;
  }
  if (!statusEl) return;
  if (state === "ready") {
    statusEl.hidden = true;
    return;
  }
  statusEl.hidden = false;
  statusEl.dataset.state = state;
  statusEl.textContent = message;
}

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value;
}

function pct(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function apiHeaders() {
  const headers = { Accept: "application/json" };
  const key = window.SOCRATINK_LOOP_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function pill(text, className = "pill") {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

function slugifyOutcomeKey(label) {
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function renderPipeline(pipeline) {
  const list = byId("pipeline-list");
  list.textContent = "";
  for (const stage of pipeline || []) {
    const item = document.createElement("li");
    item.className = "pipeline-stage";

    const label = document.createElement("span");
    label.textContent = stage.label;
    const count = document.createElement("strong");
    count.textContent = `${stage.reached}`;
    const rate = document.createElement("small");
    rate.textContent = `${pct(stage.rate)} of runs`;

    item.append(label, count, rate);
    list.appendChild(item);
  }
}

function renderFriction(items) {
  const list = byId("friction-list");
  list.textContent = "";
  for (const item of items || []) {
    const row = document.createElement("div");
    row.className = "friction-row";
    const label = document.createElement("span");
    label.textContent = item.label;
    const count = document.createElement("strong");
    count.textContent = item.count;
    row.append(label, count);
    list.appendChild(row);
  }
}

function renderRecommendations(items) {
  const list = byId("recommendation-list");
  list.textContent = "";
  for (const item of items || []) {
    const card = document.createElement("article");
    card.className = `recommendation-card priority-${item.priority}`;
    const priority = pill(item.priority, "priority-pill");
    const title = document.createElement("h3");
    title.textContent = item.focus;
    const why = document.createElement("p");
    why.textContent = item.why;
    const step = document.createElement("p");
    step.className = "next-step";
    step.textContent = item.next_step;
    card.append(priority, title, why, step);
    list.appendChild(card);
  }
}

function renderProductMetrics(metrics) {
  const list = byId("product-metrics");
  if (!list) return;
  list.textContent = "";
  const entries = [
    ["meaningful cold", metrics.meaningful_cold_attempt_rate],
    ["bridge reach", metrics.bridge_reach_rate],
    ["case complete", metrics.case_complete_rate],
    ["repair load", metrics.repair_load_rate],
    ["evidence hold", metrics.evidence_hold_rate],
    ["substrate seed", metrics.substrate_seed_use_rate],
  ].filter(([, value]) => value != null);
  for (const [label, value] of entries) {
    const group = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = pct(typeof value === "object" ? value.rate : value);
    if (value && typeof value === "object") {
      dd.title = value.formula_label || "";
    }
    group.append(dt, dd);
    list.appendChild(group);
  }
}

function renderDogfoodEvidence(evidence) {
  const list = byId("dogfood-evidence");
  if (!list) return;
  list.textContent = "";
  const entries = [
    ["Promoted traces", evidence.promoted_trace_count ?? 0],
    ["Human dogfood", evidence.human_dogfood_count ?? 0],
    ["Simulated learners", evidence.simulated_learner_count ?? 0],
    ["Regression traces", evidence.regression_trace_count ?? 0],
  ];
  for (const [label, value] of entries) {
    const group = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    group.append(dt, dd);
    list.appendChild(group);
  }
  setText("dogfood-boundary", evidence.evidence_boundary || "");
}

function renderRuns(runs) {
  const list = byId("run-list");
  list.textContent = "";
  for (const run of runs || []) {
    const card = document.createElement("article");
    card.className = "run-card";

    const header = document.createElement("header");
    const titleWrap = document.createElement("div");
    const concept = document.createElement("h3");
    concept.textContent = run.concept;
    const question = document.createElement("p");
    question.textContent = run.product_question;
    titleWrap.append(concept, question);
    const outcome = pill(run.outcome, "outcome-pill");
    outcome.dataset.outcome =
      run.outcome_key || slugifyOutcomeKey(run.outcome || "");
    header.append(titleWrap, outcome);

    const path = document.createElement("ol");
    path.className = "mini-path";
    for (const stage of run.stage_path || []) {
      const step = document.createElement("li");
      step.dataset.reached = String(Boolean(stage.reached));
      step.textContent = stage.label;
      path.appendChild(step);
    }

    const facts = document.createElement("dl");
    facts.className = "run-facts";
    const factPairs = [
      ["Cold", run.cold_classification],
      ["Spaced", run.spaced_classification],
      ["Repair turns", run.repair_dialogue_turns],
      ["Graph", run.final_state],
    ];
    for (const [term, value] of factPairs) {
      const group = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      group.append(dt, dd);
      facts.appendChild(group);
    }

    const tags = document.createElement("div");
    tags.className = "tag-list";
    for (const tag of run.friction || []) {
      tags.appendChild(pill(tag));
    }

    const next = document.createElement("p");
    next.className = "run-next";
    next.textContent = run.next_improvement;

    card.append(header, path, facts, tags, next);
    list.appendChild(card);
  }
}

function renderDashboard(payload) {
  const tracker = payload.version_tracker || {};
  const systems = payload.systems_view || {};
  const health = systems.harness_health || {};
  const graph = systems.graph_honesty || {};
  const trace = systems.traceability || {};
  const cases = payload.case_summary || {};
  const loop = payload.learning_loop || {};
  const outcomes = loop.outcomes || {};
  const recommendations = payload.improvement_queue || [];
  const strategy = payload.product_strategy_v2 || {};
  const northStar = strategy.north_star || {};
  const productMetrics = strategy.activation_funnel?.product_metrics || {};
  const dogfoodEvidence = strategy.dogfood_evidence || {};
  const topRecommendation = recommendations[0] || {};

  setText("hero-next-focus", topRecommendation.focus || "Add learner evidence");
  setText("hero-next-why", topRecommendation.why || "No recommendation available.");
  setText("version-dashboard", tracker.dashboard_version || "-");
  setText("version-payload", tracker.payload_version || "-");
  setText("version-logic", tracker.logic_owner || "-");

  setText("metric-cases", cases.total ?? "-");
  setText(
    "metric-case-mix",
    `${cases.regression ?? 0} regression / ${cases.golden ?? 0} golden / ${cases.research ?? 0} research`,
  );
  setText("metric-bridge-reached", outcomes.bridge_reached ?? "-");
  setText("metric-runs-analyzed", `${health.sessions_analyzed ?? 0} runs analyzed`);
  setText("metric-stopped", outcomes.stopped_before_bridge ?? "-");
  setText("metric-holds", graph.evidence_hold_sessions ?? "-");

  setText("north-star-label", northStar.label || "-");
  setText("north-star-definition", northStar.definition || "-");
  setText("north-star-rate", pct(northStar.primary_rate));

  setText("graph-neutral", graph.graph_neutral_events ?? "-");
  setText("evidence-candidates", graph.evidence_candidate_events ?? "-");
  setText("solidified-derivations", graph.solidified_derivations ?? "-");
  setText("trace-risk", trace.residual_risk || "");

  renderPipeline(loop.pipeline || []);
  renderFriction(loop.friction_counts || []);
  renderProductMetrics(productMetrics);
  renderRecommendations(recommendations);
  renderDogfoodEvidence(dogfoodEvidence);
  renderRuns(payload.runs || []);
}

async function load() {
  setLoadState("loading", "loading…");
  try {
    const response = await fetch("/api/dashboard", {
      headers: apiHeaders(),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`dashboard request failed: HTTP ${response.status}`);
    }
    const payload = await response.json();
    renderDashboard(payload);
    setLoadState("ready", "ready");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load dashboard.";
    setLoadState("error", message);
  }
}

load();
