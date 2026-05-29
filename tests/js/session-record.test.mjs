import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildProductLoop,
  deriveProductLoopBranch,
} from "../../lib/seda/session-record.mjs";

const ev = (type, extra = {}) => ({ type, ...extra });
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

test("deriveProductLoopBranch: terminal abandon when repair never reaches bridge", () => {
  const branch = deriveProductLoopBranch([
    ev("gap_identified", { graph_neutral: true }),
    ev("repair_dialogue_turn", { graph_neutral: true }),
    ev("repair_abandoned", { graph_neutral: true }),
    ev("idle_exit"),
  ]);
  assert.deepEqual(branch, {
    bridge_gate:
      "own-words hinge process must connect starting situation to outcome (bridge_ready gate)",
  });
});

test("deriveProductLoopBranch: recovery idle_return is terminal abandon", () => {
  const branch = deriveProductLoopBranch([
    ev("repair_abandoned", { graph_neutral: true }),
    ev("repair_recovery_closed", {
      graph_neutral: true,
      outcome: "idle_return",
    }),
    ev("idle_exit"),
  ]);
  assert.deepEqual(branch, {
    bridge_gate:
      "own-words hinge process must connect starting situation to outcome (bridge_ready gate)",
  });
});

test("deriveProductLoopBranch: recovery success then model_bridge is not terminal abandon", () => {
  const branch = deriveProductLoopBranch([
    ev("repair_abandoned", { graph_neutral: true }),
    ev("repair_recovery_turn", { graph_neutral: true }),
    ev("repair_recovery_closed", {
      graph_neutral: true,
      outcome: "recovered",
    }),
    ev("repair"),
    ev("model_bridge"),
    ev("idle_exit"),
  ]);
  assert.deepEqual(branch, {
    strong_cold_path: "not_taken",
  });
  assert.equal(branch.bridge_gate, undefined);
});

test("deriveProductLoopBranch: strong cold path skips repair branch", () => {
  const branch = deriveProductLoopBranch([
    ev("cold_attempt"),
    ev("strong_cold_path", { graph_neutral: true }),
    ev("spacing_advanced"),
    ev("spaced_redrill"),
  ]);
  assert.deepEqual(branch, {
    strong_cold_path: "skip_repair_until_spacing",
  });
});

test("deriveProductLoopBranch: happy repair dialogue path", () => {
  const branch = deriveProductLoopBranch([
    ev("gap_identified", { graph_neutral: true }),
    ev("repair_dialogue_turn", { graph_neutral: true }),
    ev("repair"),
    ev("model_bridge"),
  ]);
  assert.deepEqual(branch, {
    strong_cold_path: "not_taken",
  });
});

test("buildProductLoop dedupes graph_neutral event types", () => {
  const loop = buildProductLoop([
    ev("gap_identified", { graph_neutral: true }),
    ev("repair_dialogue_turn", { graph_neutral: true }),
    ev("repair_dialogue_turn", { graph_neutral: true }),
    ev("repair"),
    ev("model_bridge"),
  ]);
  assert.equal(loop.repair_position, "before_model_bridge");
  assert.deepEqual(loop.graph_neutral_events, [
    "gap_identified",
    "repair_dialogue_turn",
  ]);
});

test("promoted trace: recovery-success should not broadcast bridge_gate", () => {
  const session = loadTraceSession(
    "recovery-success-routes-to-repair-2026-05-28",
  );
  const branch = deriveProductLoopBranch(session.events);
  assert.equal(branch.bridge_gate, undefined);
  assert.equal(branch.strong_cold_path, "not_taken");
});

test("promoted trace: recovery-close-idle-return should broadcast bridge_gate", () => {
  const session = loadTraceSession("recovery-close-idle-return-2026-05-28");
  const branch = deriveProductLoopBranch(session.events);
  assert.deepEqual(branch, {
    bridge_gate:
      "own-words hinge process must connect starting situation to outcome (bridge_ready gate)",
  });
});

test("promoted trace: cold-help-turn-routing should broadcast bridge_gate", () => {
  const session = loadTraceSession("cold-help-turn-routing-2026-05-28");
  const branch = deriveProductLoopBranch(session.events);
  assert.deepEqual(branch, {
    bridge_gate:
      "own-words hinge process must connect starting situation to outcome (bridge_ready gate)",
  });
});

test("promoted trace: inner-repair happy path uses strong_cold_path not_taken", () => {
  const session = loadTraceSession(
    "inner-repair-dialogue-gates-model-bridge-2026-05-26",
  );
  const branch = deriveProductLoopBranch(session.events);
  assert.deepEqual(branch, {
    strong_cold_path: "not_taken",
  });
});
