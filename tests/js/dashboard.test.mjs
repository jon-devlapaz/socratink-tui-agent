import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeSession,
  buildDashboardPayload,
  computeRecoveryTelemetry,
} from "../../lib/seda/dashboard-metrics.mjs";

function minimalSession(eventTypes) {
  return {
    events: eventTypes.map((type) => ({ type })),
    concept: "Test concept",
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tracesRoot = path.join(__dirname, "../../learning_cases/traces");

function loadTraceSession(relativePath) {
  const sessionPath = path.join(tracesRoot, relativePath, "session.json");
  if (fs.existsSync(sessionPath)) {
    return JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  }
  const dir = path.join(tracesRoot, relativePath);
  const nested = fs
    .readdirSync(dir)
    .filter((name) => fs.statSync(path.join(dir, name)).isDirectory())
    .sort()
    .at(-1);
  return JSON.parse(
    fs.readFileSync(path.join(dir, nested, "session.json"), "utf8"),
  );
}

test("analyzeSession: recovery-success is not terminal abandon", () => {
  const session = loadTraceSession("recovery-success-routes-to-repair-2026-05-28");
  const stats = analyzeSession(session);
  assert.equal(stats.terminalAbandon, false);
  assert.equal(stats.recoveryStarted, true);
  assert.equal(stats.recoveryRecovered, true);
  assert.equal(stats.bridgeReadyWithinConcept, true);
});

test("analyzeSession: cold-help terminal abandon after recovery idle_return", () => {
  const session = loadTraceSession("cold-help-turn-routing-2026-05-28");
  const stats = analyzeSession(session);
  assert.equal(stats.terminalAbandon, true);
  assert.equal(stats.recoveryStarted, true);
  assert.equal(stats.recoveryRecovered, false);
  assert.equal(stats.falseReady, false);
});

test("computeRecoveryTelemetry exposes all founder rates", () => {
  const sessions = [
    loadTraceSession("recovery-success-routes-to-repair-2026-05-28"),
    loadTraceSession("recovery-close-idle-return-2026-05-28"),
    loadTraceSession("cold-help-turn-routing-2026-05-28"),
    loadTraceSession("inner-repair-dialogue-gates-model-bridge-2026-05-26"),
  ];
  const telemetry = computeRecoveryTelemetry(sessions);
  assert.deepEqual(Object.keys(telemetry).sort(), [
    "bridge_ready_within_same_concept_rate",
    "false_ready_rate",
    "recovery_enter_rate",
    "recovery_success_rate",
    "repair_abandoned_rate",
    "status_reversal_rate",
  ]);
  assert.equal(telemetry.recovery_success_rate, 0.333);
});

test("buildDashboardPayload counts bridge_error in graph-neutral telemetry", () => {
  const payload = buildDashboardPayload({
    cases: [],
    sessions: [
      {
        events: [
          { type: "bridge_error", graph_neutral: true },
          { type: "meta_turn", graph_neutral: true },
          { type: "cold_attempt" },
        ],
      },
    ],
  });
  assert.equal(payload.systems_view.graph_honesty.graph_neutral_events, 2);
});

test("buildDashboardPayload pairs sessions by session_log, not array index", () => {
  const cases = [
    {
      case_id: "with-log",
      case_type: "golden",
      case_source: "test",
      session_log: "learning_cases/traces/a/session.json",
      concept: "A",
    },
    {
      case_id: "no-log",
      case_type: "research",
      case_source: "test",
      concept: "B",
    },
    {
      case_id: "second-log",
      case_type: "golden",
      case_source: "test",
      session_log: "learning_cases/traces/c/session.json",
      concept: "C",
    },
  ];
  const sessions = [
    minimalSession(["model_bridge", "idle_exit"]),
    minimalSession(["repair_abandoned", "idle_exit"]),
  ];
  const payload = buildDashboardPayload({ cases, sessions });
  const byId = Object.fromEntries(payload.runs.map((run) => [run.id, run]));

  assert.equal(byId["with-log"].concept, "A");
  assert.equal(byId["with-log"].outcome_key, "bridge_reached");
  assert.equal(byId["no-log"].event_count, 0);
  assert.equal(byId["second-log"].outcome_key, "stopped_before_bridge");
});

test("buildDashboardPayload matches promoted case count", () => {
  const cases = fs
    .readFileSync(
      path.join(__dirname, "../../learning_cases/cases.jsonl"),
      "utf8",
    )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const sessions = cases.map((caseRecord) => {
    const rel = caseRecord.session_log.replace(/^learning_cases\/traces\//, "");
    const nested = rel.replace(/\/session\.json$/, "");
    return loadTraceSession(nested);
  });
  const payload = buildDashboardPayload({ cases, sessions });
  assert.equal(payload.title, "Socratink Learning Loop Dashboard");
  assert.deepEqual(payload.version_tracker, {
    dashboard_version: "learning-loop-dashboard-v1",
    payload_version: "dashboard-payload-v1",
    logic_owner: "lib/seda/dashboard-metrics.mjs",
    source_artifacts: [
      "learning_cases/cases.jsonl",
      "learning_cases/traces/**/session.json",
    ],
  });
  assert.equal(payload.case_summary.total, 8);
  assert.equal(payload.runs.length, 8);
  assert.ok(payload.runs.every((run) => typeof run.outcome_key === "string"));
  assert.ok(payload.learning_loop.outcomes.stopped_before_bridge >= 1);
  assert.ok(payload.improvement_queue.length >= 1);
  assert.equal(payload.product_strategy_v2.payload_version, "dashboard-product-v2");
  assert.equal(
    payload.product_strategy_v2.north_star.label,
    "Verified reconstruction",
  );
  assert.deepEqual(
    Object.keys(payload.product_strategy_v2.activation_funnel.product_metrics).sort(),
    [
      "bridge_reach_rate",
      "case_complete_rate",
      "evidence_hold_rate",
      "meaningful_cold_attempt_rate",
      "repair_load_rate",
      "substrate_seed_use_rate",
    ],
  );
  assert.ok(payload.product_strategy_v2.friction_segments.length >= 1);
  assert.ok(payload.product_strategy_v2.experiment_queue.length >= 1);
  assert.match(
    payload.product_strategy_v2.dogfood_evidence.evidence_boundary,
    /learning_cases/,
  );
});

test("product metrics expose source metadata and denominators from canonical events", () => {
  const sessions = [
    {
      events: [
        { type: "launch_attempt" },
        { type: "substrate_seed_offered", graph_neutral: true, score_eligible: false },
        { type: "route_generated" },
        {
          type: "cold_attempt",
          kc_id: "kc-1",
          evaluation: { classification: "shallow", score_eligible: true },
        },
        { type: "gap_identified", graph_neutral: true, score_eligible: false },
        { type: "repair_dialogue_turn", graph_neutral: true, score_eligible: false },
        { type: "model_bridge", graph_neutral: true },
        {
          type: "spaced_redrill",
          kc_id: "kc-1",
          evaluation: { classification: "solid", score_eligible: true },
        },
        {
          type: "evidence_hold_recorded",
          kc_id: "kc-1",
          graph_neutral: true,
          score_eligible: false,
        },
        { type: "meta_turn", graph_neutral: true, score_eligible: false },
      ],
    },
    {
      events: [
        { type: "launch_attempt" },
        { type: "route_generated" },
        {
          type: "cold_attempt",
          kc_id: "kc-2",
          evaluation: { classification: "solid", score_eligible: true },
        },
      ],
      evidence_holds: [{ should_not_define_product_metric: true }],
    },
  ];

  const payload = buildDashboardPayload({
    cases: [
      { case_id: "a", case_type: "golden", case_source: "test", session_log: "a" },
      { case_id: "b", case_type: "golden", case_source: "test", session_log: "b" },
    ],
    sessions,
  });
  const metrics = payload.product_strategy_v2.activation_funnel.product_metrics;

  assert.deepEqual(metrics.meaningful_cold_attempt_rate, {
    rate: 1,
    numerator_count: 2,
    denominator_count: 2,
    source_event_types: [
      "cold_attempt_submitted",
      "cold_attempt_prompted",
    ],
    formula_label: "cold_attempt_submitted / cold_attempt_prompted",
    empty_state_reason: null,
    critical_path: true,
  });
  assert.deepEqual(metrics.substrate_seed_use_rate, {
    rate: 0.5,
    numerator_count: 1,
    denominator_count: 2,
    source_event_types: ["substrate_seed_requested", "loop_started"],
    formula_label: "substrate_seed_requested / loop_started",
    empty_state_reason: null,
    critical_path: true,
  });
  assert.equal(metrics.bridge_reach_rate.numerator_count, 1);
  assert.equal(metrics.bridge_reach_rate.denominator_count, 2);
  assert.deepEqual(metrics.bridge_reach_rate.source_event_types, [
    "bridge_prompted",
    "cold_attempt_evaluated",
  ]);
  assert.equal(metrics.repair_load_rate.numerator_count, 1);
  assert.equal(metrics.repair_load_rate.denominator_count, 2);
  assert.deepEqual(metrics.repair_load_rate.source_event_types, [
    "repair_prompted",
    "cold_attempt_evaluated",
  ]);
  assert.equal(metrics.case_complete_rate.numerator_count, 1);
  assert.equal(metrics.case_complete_rate.denominator_count, 2);
  assert.deepEqual(metrics.case_complete_rate.source_event_types, [
    "case_completed",
    "loop_started",
  ]);
  assert.equal(metrics.evidence_hold_rate.numerator_count, 1);
  assert.equal(metrics.evidence_hold_rate.denominator_count, 2);
  assert.deepEqual(metrics.evidence_hold_rate.source_event_types, [
    "evidence_hold_recorded",
    "cold_attempt_evaluated",
  ]);
  assert.equal(metrics.meta_use_rate, undefined);
});

test("product metrics report empty-state reason when canonical denominator is zero", () => {
  const payload = buildDashboardPayload({ cases: [], sessions: [] });
  const metrics = payload.product_strategy_v2.activation_funnel.product_metrics;

  for (const metric of Object.values(metrics)) {
    assert.equal(metric.rate, 0);
    assert.equal(metric.numerator_count, 0);
    assert.equal(metric.denominator_count, 0);
    assert.match(metric.empty_state_reason, /No canonical/);
    assert.equal(metric.critical_path, true);
  }
});

test("metric-specific denominators do not use loop_started as a blanket denominator", () => {
  const payload = buildDashboardPayload({
    cases: [
      { case_id: "prompted", case_type: "golden", case_source: "test", session_log: "prompted" },
      { case_id: "evaluated", case_type: "golden", case_source: "test", session_log: "evaluated" },
      { case_id: "complete", case_type: "golden", case_source: "test", session_log: "complete" },
    ],
    sessions: [
      {
        events: [
          { type: "launch_attempt" },
          { type: "route_generated" },
        ],
      },
      {
        events: [
          { type: "launch_attempt" },
          { type: "route_generated" },
          {
            type: "cold_attempt",
            score_eligible: true,
            evaluation: { classification: "thin" },
          },
          { type: "gap_identified", graph_neutral: true, score_eligible: false },
          { type: "model_bridge", graph_neutral: true, score_eligible: false },
        ],
      },
      {
        events: [
          { type: "launch_attempt" },
          { type: "route_generated" },
          {
            type: "cold_attempt",
            score_eligible: true,
            evaluation: { classification: "shallow" },
          },
          {
            type: "spaced_redrill",
            score_eligible: true,
            evaluation: { classification: "solid" },
          },
          {
            type: "evidence_hold_recorded",
            graph_neutral: true,
            score_eligible: false,
          },
        ],
      },
    ],
  });
  const metrics = payload.product_strategy_v2.activation_funnel.product_metrics;

  assert.equal(metrics.meaningful_cold_attempt_rate.denominator_count, 3);
  assert.equal(metrics.meaningful_cold_attempt_rate.numerator_count, 2);
  assert.equal(metrics.meaningful_cold_attempt_rate.rate, 0.667);

  assert.equal(metrics.bridge_reach_rate.denominator_count, 2);
  assert.equal(metrics.bridge_reach_rate.numerator_count, 1);
  assert.equal(metrics.bridge_reach_rate.rate, 0.5);

  assert.equal(metrics.repair_load_rate.denominator_count, 2);
  assert.equal(metrics.repair_load_rate.numerator_count, 1);
  assert.equal(metrics.repair_load_rate.rate, 0.5);

  assert.equal(metrics.evidence_hold_rate.denominator_count, 2);
  assert.equal(metrics.evidence_hold_rate.numerator_count, 1);
  assert.equal(metrics.evidence_hold_rate.rate, 0.5);

  assert.equal(metrics.case_complete_rate.denominator_count, 3);
  assert.equal(metrics.case_complete_rate.numerator_count, 1);
  assert.equal(metrics.case_complete_rate.rate, 0.333);
});

test("substrate seed use counts actual slow-path seed events, not launch attempts", () => {
  const payload = buildDashboardPayload({
    cases: [
      { case_id: "fast", case_type: "golden", case_source: "test", session_log: "fast" },
      { case_id: "slow", case_type: "golden", case_source: "test", session_log: "slow" },
    ],
    sessions: [
      {
        events: [
          { type: "launch_attempt", text: "I can explain the mechanism." },
          { type: "substrate_confirmed", graph_neutral: true, score_eligible: false },
        ],
      },
      {
        events: [
          { type: "launch_attempt", text: "I don't know." },
          { type: "substrate_seed_offered", graph_neutral: true, score_eligible: false },
        ],
      },
    ],
  });
  const metrics = payload.product_strategy_v2.activation_funnel.product_metrics;

  assert.deepEqual(metrics.substrate_seed_use_rate, {
    rate: 0.5,
    numerator_count: 1,
    denominator_count: 2,
    source_event_types: ["substrate_seed_requested", "loop_started"],
    formula_label: "substrate_seed_requested / loop_started",
    empty_state_reason: null,
    critical_path: true,
  });
});
