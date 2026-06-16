import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateLoopRubric,
  renderLoopRubricMarkdown,
} from "../../lib/lab/loop-rubric.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function baseLog(overrides = {}) {
  return {
    llm_mode: "live",
    final: {
      hit_max_turns: false,
      ...overrides.final,
    },
    ...overrides,
  };
}

function healthySession(overrides = {}) {
  return {
    events: [
      { type: "substrate_seed_offered" },
      { type: "substrate_confirmed" },
      { type: "route_generated" },
      { type: "cold_attempt", evaluation: { classification: "shallow" } },
      { type: "repair_dialogue_turn" },
      { type: "repair" },
      { type: "spacing" },
      { type: "spaced_redrill", evaluation: { classification: "solid" } },
      ...(overrides.events || []),
    ],
    derived: [
      { event: "spaced_redrill", concept_status: { badge: "primed" } },
      ...(overrides.derived || []),
    ],
  };
}

test("loop rubric passes a bounded live pedagogical trace", () => {
  const rubric = evaluateLoopRubric({
    log: baseLog(),
    health: {
      fake_llm: false,
      llm_provider: "gemini",
      llm_model: "gemini-2.5-flash",
    },
    sessionRecord: healthySession(),
  });

  assert.equal(rubric.rubric_version, "loop-v1");
  assert.equal(rubric.overall, "pass");
  assert.equal(rubric.axes.substrate_viability.score, "pass");
  assert.equal(rubric.axes.evidence_progression.score, "pass");
  assert.match(renderLoopRubricMarkdown(rubric), /No prompt change indicated/);
});

test("loop rubric fails bridge errors before treating a run as evidence", () => {
  const rubric = evaluateLoopRubric({
    log: baseLog(),
    health: {
      fake_llm: false,
      llm_provider: "gemini",
      llm_model: "gemini-2.5-flash",
    },
    sessionRecord: healthySession({ events: [{ type: "bridge_error" }] }),
  });

  assert.equal(rubric.overall, "fail");
  assert.equal(rubric.axes.model_reliability.score, "fail");
  assert.match(rubric.recommendations.join("\n"), /provider\/schema reliability/);
});

test("loop rubric flags OpenAI-compatible tutor mode as explicit opt-in watch evidence", () => {
  const rubric = evaluateLoopRubric({
    log: baseLog(),
    health: {
      fake_llm: false,
      llm_provider: "openai_compatible",
      llm_model: "auto",
    },
    sessionRecord: healthySession(),
  });

  assert.equal(rubric.overall, "watch");
  assert.equal(rubric.axes.model_reliability.score, "watch");
  assert.match(rubric.axes.model_reliability.evidence.join("\n"), /OpenAI-compatible/);
});

test("loop rubric schema artifact is valid JSON with required axes", () => {
  const schemaPath = path.join(ROOT, "evals/founder-lab/loop-v1.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  assert.equal(schema.properties.rubric_version.const, "loop-v1");
  assert.deepEqual(schema.properties.axes.required, [
    "substrate_viability",
    "generation_before_recognition",
    "repair_load",
    "evidence_progression",
    "model_reliability",
    "prompt_adjustment_signal",
  ]);
});
