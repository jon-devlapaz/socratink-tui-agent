import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registry } from "../../lib/bridge/registry.mjs";
import {
  proveRoutingChain,
  simulatePhaseChain,
} from "../../lib/seda/routing-proofs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const TRACES_ROOT = path.join(WORKSPACE_ROOT, "learning_cases/traces");

const ev = (type, extra = {}) => ({ type, ...extra });

test("simulatePhaseChain follows canonical repair path", () => {
  const events = [
    ev("launch_attempt"),
    ev("route_generated"),
    ev("cold_attempt", { evaluation: { classification: "shallow" } }),
    ev("gap_identified"),
    ev("repair_dialogue_turn", { bridge_ready: true, turn_index: 2, next_dialogue_action: "commit_repair" }),
    ev("repair"),
    ev("model_bridge"),
    ev("post_bridge_transfer_check"),
    ev("spacing_advanced"),
    ev("spaced_redrill", { evaluation: { classification: "solid" } }),
  ];
  const result = simulatePhaseChain(events);
  assert.equal(result.ok, true);
  assert.equal(result.phases.at(-1)?.nextPhase, "idle");
  assert.equal(result.terminalPhase, "idle");
});

test("simulatePhaseChain fails on unknown event type", () => {
  const result = simulatePhaseChain([ev("not_a_real_event")]);
  assert.equal(result.ok, false);
  assert.match(result.error, /unknown event type/);
});

test("validateRegistryRoutingFields requires cold_attempt classification", () => {
  const proof = proveRoutingChain(
    [ev("cold_attempt", { evaluation: {} })],
    registry,
  );
  assert.equal(proof.ok, false);
  assert.match(proof.failures[0], /evaluation.classification/);
});

test("promoted learning case traces pass routing proof", () => {
  const caseDirs = fs
    .readdirSync(TRACES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);

  for (const caseId of caseDirs) {
    const sessionPath = path.join(TRACES_ROOT, caseId, "session.json");
    if (!fs.existsSync(sessionPath)) continue;
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    const proof = proveRoutingChain(session.events || [], registry);
    assert.equal(proof.ok, true, `${caseId}: ${proof.failures?.join("; ") || proof.error}`);
  }
});
