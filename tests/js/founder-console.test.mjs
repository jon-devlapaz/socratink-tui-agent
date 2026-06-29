import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aggregateFounderReport,
  buildTutorSelection,
  pedagogicalStageFromTrace,
  parseFounderArgs,
  renderFounderReportMarkdown,
} from "../../lib/lab/founder-console.mjs";

function rubric(overrides = {}) {
  return {
    overall: "pass",
    axes: {
      substrate_viability: { score: "pass", evidence: ["ok"] },
      generation_before_recognition: { score: "pass", evidence: ["ok"] },
      repair_load: { score: "pass", evidence: ["ok"] },
      evidence_progression: { score: "pass", evidence: ["ok"] },
      model_reliability: { score: "pass", evidence: ["ok"] },
      prompt_adjustment_signal: { score: "pass", evidence: ["ok"] },
      ...overrides.axes,
    },
  };
}

test("founder lab contract pins the minimal console surface", () => {
  const doc = readFileSync(
    new URL("../../.mex/ACTIVE.md", import.meta.url),
    "utf8",
  );
  for (const label of [
    "Concept",
    "Goal",
    "Cartridge",
    "Tutor model",
    "Student model",
    "Run count",
    "Max turns",
    "Model tests",
    "Live pedagogical state",
    "Report access",
  ]) {
    assert.match(doc, new RegExp(`- ${label}\\b`));
  }
  assert.match(doc, /explicit opt-in choices/);
  assert.match(doc, /must not silently choose a local or router model/);
  assert.match(doc, /They are not graph truth/);
  assert.match(doc, /Run Batch A/);
  assert.match(doc, /Run Batch B/);
});

test("founder console parses minimal run command with cloud defaults", () => {
  const options = parseFounderArgs(["run", "--cartridge", "novice", "--runs", "3"]);
  assert.equal(options.command, "run");
  assert.equal(options.cartridgeId, "novice");
  assert.equal(options.runs, 3);
  assert.equal(options.student, "cloud");
  assert.equal(options.tutor, "gemini");
});

test("founder console normalizes local alias to lmstudio", () => {
  const options = parseFounderArgs(["run", "--tutor", "local", "--student", "local"]);
  assert.equal(options.tutor, "lmstudio");
  assert.equal(options.student, "lmstudio");
});

test("founder console parses custom scenario context", () => {
  const options = parseFounderArgs([
    "run",
    "--cartridge",
    "jordan-ai",
    "--concept",
    "Hallucination",
    "--goal",
    "Explain why fluency is not evidence.",
  ]);
  assert.equal(options.concept, "Hallucination");
  assert.equal(options.learnerGoal, "Explain why fluency is not evidence.");
});

test("router tutor requires explicit base URL and defaults to auto model", () => {
  assert.throws(
    () => buildTutorSelection({ tutor: "router", tutorModel: "auto" }, {}),
    /requires LLM_ROUTER_BASE_URL/,
  );
  assert.deepEqual(
    buildTutorSelection(
      { tutor: "router", tutorModel: null },
      { LLM_ROUTER_BASE_URL: "http://openai-router.test/v1" },
    ),
    {
      provider: "openai_compatible",
      target: "router",
      model: "auto",
      evidenceMode: "router",
    },
  );
});

test("lmstudio tutor keeps local default model", () => {
  assert.deepEqual(
    buildTutorSelection({ tutor: "lmstudio", tutorModel: null }, {}),
    {
      provider: "openai_compatible",
      target: "lmstudio",
      model: "google/gemma-4-12b",
      evidenceMode: "lmstudio",
    },
  );
});

test("gemini tutor default ignores compatible tutor LLM_MODEL", () => {
  const tutor = buildTutorSelection(
    { tutor: "gemini", tutorModel: null },
    { LLM_PROVIDER: "openai_compatible", LLM_MODEL: "local-tutor" },
  );
  assert.deepEqual(tutor, {
    provider: "gemini",
    model: "gemini-2.5-flash",
    evidenceMode: "cloud",
  });
});

test("pedagogical monitor maps trace facts to loop stages", () => {
  assert.equal(pedagogicalStageFromTrace({ phase: "substrate_gate" }), "substrate");
  assert.equal(
    pedagogicalStageFromTrace({ eventsTail: ["route_generated", "cold_attempt"] }),
    "cold",
  );
  assert.equal(
    pedagogicalStageFromTrace({ eventsTail: ["cold_attempt", "repair_dialogue_turn"] }),
    "repair",
  );
  assert.equal(
    pedagogicalStageFromTrace({ eventsTail: ["model_bridge", "repair_dialogue_turn"] }),
    "repair",
  );
  assert.equal(
    pedagogicalStageFromTrace({ eventsTail: ["model_bridge", "post_bridge_transfer_check"] }),
    "transfer",
  );
  assert.equal(pedagogicalStageFromTrace({ eventsTail: ["spaced_redrill"] }), "redrill");
});

test("aggregate report caveats OpenAI-compatible tutor evidence", () => {
  const report = aggregateFounderReport({
    receipt: {
      tutor: { provider: "openai_compatible", model: "auto", mode: "router" },
      student: { provider: "gemini", model: "gemini-2.5-flash", mode: "cloud" },
    },
    runs: [
      {
        index: 1,
        outDir: "/tmp/run",
        rubric: rubric({
          axes: {
            model_reliability: {
              score: "watch",
              evidence: ["OpenAI-compatible tutor provider is explicit opt-in"],
            },
          },
        }),
        sessionRecord: {
          events: [{ type: "spaced_redrill", evaluation: { classification: "solid" } }],
          derived: [{ concept_status: { badge: "primed" } }],
        },
      },
    ],
  });

  assert.equal(report.evidence_status, "caveated");
  assert.match(report.recommendation, /Confirm this pattern/);
  assert.equal(report.runs[0].evaluator_spaced_classification, "solid");
  assert.equal(report.runs[0].graph_badge, "primed");
  assert.equal(report.runs[0].signature.score_eligible_events, 1);
  assert.equal(report.comparison.run_count, 1);
  assert.match(renderFounderReportMarkdown(report), /Graph badge/);
  assert.match(renderFounderReportMarkdown(report), /Run comparison/);
});

test("aggregate report derives divergent run signatures", () => {
  const report = aggregateFounderReport({
    receipt: {
      tutor: { provider: "gemini", model: "gemini-2.5-flash", mode: "cloud" },
      student: { provider: "gemini", model: "gemini-2.5-flash", mode: "cloud" },
    },
    runs: [
      {
        index: 1,
        outDir: "/tmp/run-1",
        log: { final: { hit_max_turns: false } },
        rubric: rubric(),
        sessionRecord: {
          events: [
            { type: "substrate_confirmed" },
            { type: "route_generated" },
            { type: "cold_attempt" },
            { type: "spaced_redrill", evaluation: { classification: "solid" } },
            { type: "idle_exit" },
          ],
          derived: [{ concept_status: { badge: "primed" } }],
        },
      },
      {
        index: 2,
        outDir: "/tmp/run-2",
        log: { final: { hit_max_turns: false } },
        rubric: rubric({ axes: { model_reliability: { score: "fail", evidence: ["bridge_error_count=1"] } } }),
        sessionRecord: {
          events: [
            { type: "substrate_confirmed" },
            { type: "route_generated" },
            { type: "cold_attempt" },
            { type: "bridge_error" },
          ],
          derived: [{ concept_status: { badge: "draft" } }],
        },
      },
    ],
  });

  assert.equal(report.comparison.run_count, 2);
  assert.equal(report.comparison.divergent, true);
  assert.equal(report.comparison.signature_variants, 2);
  assert.deepEqual(report.comparison.failure_runs, [2]);
  assert.deepEqual(report.comparison.evidence_range, { min: 1, max: 2 });
  assert.match(report.runs[0].signature.signature, /terminal=idle_exit/);
  assert.match(report.runs[1].signature.signature, /failures=1/);
});

test("aggregate report signatures count bridge diagnostics without session record", () => {
  const report = aggregateFounderReport({
    receipt: {
      tutor: { provider: "openai_compatible", model: "auto", mode: "router" },
      student: { provider: "openai_compatible", model: "auto", mode: "router" },
    },
    runs: [
      {
        index: 1,
        outDir: "/tmp/router-run",
        log: {
          final: {
            event_types: [
              "idle_new_concept",
              "learner_goal_set",
              "launch_attempt",
              "bridge_error",
              "route_generated",
              "cold_attempt",
            ],
            bridge_errors: [
              { action: "substrate-gate", error: "LLMValidationError" },
              { action: "evaluate-attempt", error: "LLMValidationError" },
            ],
            hit_max_turns: true,
          },
        },
        rubric: null,
        sessionRecord: null,
      },
    ],
  });

  assert.equal(report.runs[0].signature.terminal_event, "cold_attempt");
  assert.equal(report.runs[0].signature.score_eligible_events, 1);
  assert.equal(report.runs[0].signature.failure_events, 2);
  assert.deepEqual(report.comparison.failure_runs, [1]);
  assert.match(report.runs[0].signature.signature, /failures=2/);
});

test("aggregate report does not double count bridge diagnostics already in events", () => {
  const report = aggregateFounderReport({
    receipt: {
      tutor: { provider: "openai_compatible", model: "auto", mode: "router" },
      student: { provider: "openai_compatible", model: "auto", mode: "router" },
    },
    runs: [
      {
        index: 1,
        outDir: "/tmp/router-run",
        log: {
          final: {
            event_types: [
              "idle_new_concept",
              "launch_attempt",
              "bridge_error",
              "idle_new_concept",
              "launch_attempt",
              "bridge_error",
            ],
            bridge_errors: [
              { action: "substrate-gate", error: "LLMValidationError" },
              { action: "evaluate-attempt", error: "LLMValidationError" },
            ],
            hit_max_turns: true,
          },
        },
        rubric: null,
        sessionRecord: null,
      },
    ],
  });

  assert.equal(report.runs[0].signature.failure_events, 2);
  assert.match(report.runs[0].signature.signature, /failures=2/);
});

test("aggregate report rejects fake tutor recommendations", () => {
  const report = aggregateFounderReport({
    receipt: {
      tutor: { provider: "gemini", model: "gemini-2.5-flash", mode: "fake" },
      student: { provider: "gemini", model: "gemini-2.5-flash", mode: "cloud" },
    },
    runs: [{ index: 1, outDir: "/tmp/run", rubric: rubric(), sessionRecord: {} }],
  });

  assert.equal(report.evidence_status, "rejected");
  assert.match(report.recommendation, /Rerun with a live tutor/);
});

test("aggregate report rejects failed pedagogical axes", () => {
  const report = aggregateFounderReport({
    receipt: {
      tutor: { provider: "gemini", model: "gemini-2.5-flash", mode: "cloud" },
      student: { provider: "gemini", model: "gemini-2.5-flash", mode: "cloud" },
    },
    runs: [
      {
        index: 1,
        outDir: "/tmp/run",
        rubric: rubric({
          axes: {
            evidence_progression: {
              score: "fail",
              evidence: ["no score-eligible learner evidence found"],
            },
          },
        }),
        sessionRecord: {},
      },
    ],
  });

  assert.equal(report.evidence_status, "rejected");
  assert.match(report.recommendation, /transfer check|spaced re-drill/i);
});

test("aggregate report rejects missing rubric traces", () => {
  const report = aggregateFounderReport({
    receipt: {
      tutor: { provider: "openai_compatible", model: "auto", mode: "router" },
      student: { provider: "openai_compatible", model: "auto", mode: "router" },
    },
    runs: [{ index: 1, outDir: "/tmp/run", rubric: null, sessionRecord: {} }],
  });

  assert.equal(report.evidence_status, "rejected");
  assert.match(report.recommendation, /complete rubric trace/);
  assert.equal(report.runs[0].overall, "fail");
});
