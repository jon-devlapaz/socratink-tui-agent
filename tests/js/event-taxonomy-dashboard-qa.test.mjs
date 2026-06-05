import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDashboardPayload } from "../../lib/seda/dashboard-metrics.mjs";
import {
  CANONICAL_LEARNER_LOOP_EVENTS,
  canonicalEventsForSession,
  canonicalizeEvent,
} from "../../lib/seda/event-taxonomy.mjs";
import { nextPhase } from "../../lib/seda/next-phase.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");

const PROMPT_ONLY_CANONICAL_TYPES = [
  "substrate_seed_requested",
  "cold_attempt_prompted",
  "repair_prompted",
  "bridge_prompted",
  "spaced_redrill_scheduled",
  "meta_requested",
];

function payloadForSessions(sessions) {
  return buildDashboardPayload({
    cases: sessions.map((_, index) => ({
      case_id: `qa-${index + 1}`,
      case_type: "golden",
      case_source: "qa",
      session_log: `qa-${index + 1}`,
    })),
    sessions,
  });
}

function productMetrics(payload) {
  return payload.product_strategy_v2.activation_funnel.product_metrics;
}

test("QA: canonical prompt-only events are projections, not authoritative router events", () => {
  for (const eventType of PROMPT_ONLY_CANONICAL_TYPES) {
    assert.ok(
      CANONICAL_LEARNER_LOOP_EVENTS[eventType],
      `missing canonical prompt-only type ${eventType}`,
    );
    assert.equal(
      nextPhase([{ type: "launch_attempt" }]),
      "substrate_gate",
      "sanity check router still reads legacy event.type",
    );
    assert.throws(
      () => nextPhase([{ type: eventType }]),
      /unknown event type/,
      `${eventType} must not silently become a routing event`,
    );
  }
});

test("QA: runtime append sites do not append prompt-only canonical event types", () => {
  const appendSiteRoots = [
    path.join(ROOT, "lib/seda/handlers"),
    path.join(ROOT, "lib/seda/meta-command.mjs"),
    path.join(ROOT, "lib/loop-server"),
  ];
  const files = appendSiteRoots.flatMap((entry) => {
    const stat = fs.statSync(entry);
    if (stat.isFile()) return [entry];
    return fs
      .readdirSync(entry, { recursive: true })
      .filter((name) => name.endsWith(".mjs"))
      .map((name) => path.join(entry, name));
  });

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const eventType of PROMPT_ONLY_CANONICAL_TYPES) {
      assert.doesNotMatch(
        source,
        new RegExp(`type:\\s*["']${eventType}["']`),
        `${path.relative(ROOT, file)} must not append ${eventType} into events[]`,
      );
    }
  }
});

test("QA: canonical envelope drops unknown legacy events instead of inventing product truth", () => {
  assert.deepEqual(
    canonicalizeEvent({ type: "product_loop_summary", complete: true }),
    [],
  );
});

test("QA: first score-eligible canonical event is the Cold Attempt reconstruction", () => {
  const canonical = canonicalEventsForSession({
    session_id: "qa-session",
    events: [
      { type: "launch_attempt", text: "rough context" },
      { type: "substrate_seed_offered", graph_neutral: true, score_eligible: false },
      { type: "substrate_refinement", text: "starter", graph_neutral: true, score_eligible: false },
      { type: "substrate_confirmed", graph_neutral: true, score_eligible: false },
      { type: "route_generated" },
      { type: "meta_turn", phase: "cold_attempt", graph_neutral: true, score_eligible: false },
      {
        type: "cold_attempt",
        phase: "cold_attempt",
        kc_id: "kc-qa",
        score_eligible: true,
        evaluation: { classification: "shallow" },
      },
      { type: "gap_identified", graph_neutral: true, score_eligible: false },
      { type: "model_bridge", graph_neutral: true, score_eligible: false },
      {
        type: "spaced_redrill",
        kc_id: "kc-qa",
        score_eligible: true,
        evaluation: { classification: "solid" },
      },
    ],
  });

  const scoreEligible = canonical.filter((event) => event.score_eligible);
  assert.ok(scoreEligible.length >= 1);
  assert.equal(scoreEligible[0].event_type, "cold_attempt_submitted");
  assert.equal(scoreEligible[0].kc_id, "kc-qa");
  assert.equal(
    canonical.find((event) => event.event_type === "meta_returned").score_eligible,
    false,
  );
});

test("QA: product metrics ignore product_loop, evidence_holds, and friction lures", () => {
  const payload = payloadForSessions([
    {
      product_loop: {
        bridge_gate: "bridge_reached",
        graph_truth: { final_node_state: "solidified" },
      },
      evidence_holds: [{ classification: "solid", lure: true }],
      friction_tags: ["repair load", "solid answer held at primed"],
      events: [{ type: "idle_exit" }],
    },
  ]);
  const metrics = productMetrics(payload);

  for (const [name, metric] of Object.entries(metrics)) {
    assert.equal(metric.denominator_count, 0, `${name} denominator`);
    assert.equal(metric.numerator_count, 0, `${name} numerator`);
    assert.equal(metric.rate, 0, `${name} rate`);
    assert.match(metric.empty_state_reason, /No canonical denominator/);
  }
});

test("QA: product metrics do not count score-ineligible canonical evidence", () => {
  const payload = payloadForSessions([
    {
      events: [
        { type: "launch_attempt" },
        { type: "route_generated" },
        {
          type: "cold_attempt",
          kc_id: "kc-not-counted",
          score_eligible: false,
          evaluation: { classification: "shallow" },
        },
        {
          type: "spaced_redrill",
          kc_id: "kc-not-counted",
          score_eligible: false,
          evaluation: { classification: "solid" },
        },
        { type: "model_bridge", graph_neutral: true, score_eligible: false },
      ],
    },
  ]);
  const metrics = productMetrics(payload);

  assert.equal(metrics.meaningful_cold_attempt_rate.denominator_count, 1);
  assert.equal(metrics.meaningful_cold_attempt_rate.numerator_count, 0);
  assert.equal(metrics.meaningful_cold_attempt_rate.rate, 0);
  assert.equal(metrics.case_complete_rate.numerator_count, 0);
  assert.equal(metrics.evidence_hold_rate.numerator_count, 0);
  assert.equal(metrics.bridge_reach_rate.numerator_count, 1);
});

test("QA: dashboard metric objects expose decision-grade provenance fields", () => {
  const payload = payloadForSessions([
    {
      events: [
        { type: "launch_attempt" },
        { type: "substrate_seed_offered", graph_neutral: true, score_eligible: false },
        {
          type: "cold_attempt",
          kc_id: "kc-counted",
          score_eligible: true,
          evaluation: { classification: "shallow" },
        },
      ],
    },
  ]);

  for (const [name, metric] of Object.entries(productMetrics(payload))) {
    assert.equal(typeof metric.rate, "number", `${name} rate`);
    assert.equal(typeof metric.numerator_count, "number", `${name} numerator_count`);
    assert.equal(typeof metric.denominator_count, "number", `${name} denominator_count`);
    assert.ok(Array.isArray(metric.source_event_types), `${name} source_event_types`);
    assert.ok(metric.source_event_types.length >= 1, `${name} source_event_types length`);
    assert.equal(typeof metric.formula_label, "string", `${name} formula_label`);
    assert.ok(metric.formula_label.includes("/"), `${name} formula_label names denominator`);
    assert.ok(
      metric.empty_state_reason === null ||
        typeof metric.empty_state_reason === "string",
      `${name} empty_state_reason`,
    );
    assert.equal(typeof metric.critical_path, "boolean", `${name} critical_path`);
  }
});

test("QA: public taxonomy and dashboard surfaces do not revive Repair Reps vocabulary", () => {
  const publicSurfaceFiles = [
    "lib/seda/event-taxonomy.mjs",
    "lib/seda/dashboard-metrics.mjs",
    "lib/seda/meta-command.mjs",
    "lib/loop-server/prompt-help.mjs",
    "public/dashboard/dashboard.js",
    "public/loop/loop.js",
    "public/loop/index.html",
  ];

  for (const relativeFile of publicSurfaceFiles) {
    const source = fs.readFileSync(path.join(ROOT, relativeFile), "utf8");
    assert.doesNotMatch(source, /\bRepair Reps\b/i, relativeFile);
  }
});
