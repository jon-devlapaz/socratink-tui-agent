import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sessionResponse } from "../../lib/loop-server/session.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

function readRepoFile(relativePath) {
  return readFileSync(path.join(WORKSPACE_ROOT, relativePath), "utf8");
}

test("canonical docs do not make repair an evidence candidate", () => {
  const files = [
    "AGENTS.md",
    "HARNESS.md",
    "CONTEXT.md",
    "README.md",
    "docs/greenfield-ai-native-implementation-plan.md",
  ];
  const repairAsEvidence = /\brepairs?\b[^.\n|;]*\bevidence candidates?\b|\bevidence candidates?\b[^.\n|;]*\brepairs?\b/i;

  const violations = files
    .map((file) => ({
      file,
      line: readRepoFile(file)
        .split("\n")
        .find((text) => repairAsEvidence.test(text)),
    }))
    .filter((entry) => entry.line);

  assert.deepEqual(violations, []);
});

test("session response keeps caseComplete distinct from hosted complete", () => {
  const baseSession = {
    id: "session-1",
    status: "awaiting_input",
    phase: "idle",
    awaiting: null,
    transcript: [],
    ctx: {},
    llmCalls: [],
  };

  const caseDone = sessionResponse(
    { ...baseSession, events: [{ type: "spaced_redrill" }] },
    [],
  );
  assert.equal(caseDone.caseComplete, true);
  assert.equal(caseDone.complete, false);

  const sessionDone = sessionResponse(
    {
      ...baseSession,
      status: "complete",
      phase: null,
      events: [{ type: "idle_exit" }],
    },
    [],
  );
  assert.equal(sessionDone.caseComplete, false);
  assert.equal(sessionDone.complete, true);
});

test("session response sets caseComplete on terminal repair abandon", () => {
  const baseSession = {
    id: "session-abandon",
    status: "awaiting_input",
    phase: "idle",
    awaiting: null,
    transcript: [],
    ctx: {},
    llmCalls: [],
  };

  const abandoned = sessionResponse(
    {
      ...baseSession,
      events: [
        { type: "gap_identified", graph_neutral: true },
        { type: "repair_dialogue_turn", graph_neutral: true },
        { type: "repair_state_bucketed", graph_neutral: true },
        { type: "repair_cap_selected", graph_neutral: true },
        { type: "repair_recovery_started", graph_neutral: true },
        { type: "repair_recovery_closed", graph_neutral: true, outcome: "idle_return" },
        { type: "repair_abandoned", graph_neutral: true },
      ],
    },
    [],
  );
  assert.equal(abandoned.caseComplete, true);
  assert.equal(abandoned.complete, false);

  const pendingRecovery = sessionResponse(
    {
      ...baseSession,
      events: [
        { type: "repair_recovery_started", graph_neutral: true },
        { type: "repair_abandoned", graph_neutral: true, next_step: "recovery_prompt" },
      ],
    },
    [],
  );
  assert.equal(pendingRecovery.caseComplete, false);

  const recovered = sessionResponse(
    {
      ...baseSession,
      events: [
        { type: "repair_abandoned", graph_neutral: true },
        { type: "repair_recovery_closed", graph_neutral: true, outcome: "recovered" },
        { type: "repair" },
        { type: "model_bridge" },
      ],
    },
    [],
  );
  assert.equal(recovered.caseComplete, false);
});

test("sessionResponse exposes materialized session record for persona export", () => {
  const record = {
    events: [{ type: "spaced_redrill" }],
    derived: [{ event: "spaced_redrill" }],
  };
  const body = sessionResponse(
    {
      id: "session-1",
      status: "awaiting_input",
      phase: "idle",
      awaiting: null,
      transcript: [],
      ctx: {},
      llmCalls: [],
      events: [{ type: "spaced_redrill" }],
      record,
    },
    [],
  );
  assert.equal(body.caseComplete, true);
  assert.deepEqual(body.record, record);
});

test("sessionResponse projects learner transcript without mutating raw transcript", () => {
  const transcript = [
    { level: "log", text: "[Hypothesis Map]" },
    { level: "log", text: "Thesis: hidden route detail" },
    { level: "log", text: "[Route LLM] gemini/gemini-2.5-flash · 20ms" },
    { level: "log", text: "Learner goal: explain caching" },
    { level: "log", text: "You skipped recomputing. What connects that to speed?" },
    { level: "log", text: "[Bridge error] generate-route: failed closed" },
  ];
  const body = sessionResponse(
    {
      id: "session-learner-transcript",
      status: "awaiting_input",
      phase: "idle",
      awaiting: null,
      transcript: [],
      ctx: {},
      llmCalls: [],
      events: [],
    },
    transcript,
  );

  assert.deepEqual(body.transcript, transcript);
  assert.deepEqual(
    body.learnerTranscript.map((entry) => entry.text),
    [
      "Learner goal: explain caching",
      "You skipped recomputing. What connects that to speed?",
      "[Bridge error] generate-route: failed closed",
    ],
  );
});
