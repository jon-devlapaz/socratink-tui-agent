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
  assert.equal(payload.title, "Socratink Founder Dashboard");
  assert.equal(payload.case_summary.total, 8);
});
