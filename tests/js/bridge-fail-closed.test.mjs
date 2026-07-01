import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createBridgeClient } from "../../lib/bridge/client.mjs";
import { resultToBridgeError } from "../../lib/seda/bridge-fail-closed.mjs";
import { handleColdAttempt } from "../../lib/seda/handlers/cold-attempt.mjs";
import { handleModelBridge } from "../../lib/seda/handlers/model-bridge.mjs";
import { handleRepairDialogue } from "../../lib/seda/handlers/repair-dialogue.mjs";
import { handleRoute } from "../../lib/seda/handlers/route.mjs";
import { nextPhase } from "../../lib/seda/next-phase.mjs";

function makeAgentLookup(ids) {
  return new Map(
    ids.map((id) => [
      id,
      {
        id,
        name: id,
        job: `${id} job`,
        required_outputs: [],
        may_propose_events: [],
        truth_permission: "none",
        failure_mode_to_guard: "fixture guard",
      },
    ]),
  );
}

function makeRouteCtx() {
  return {
    concept: "Caching",
    learnerGoal: "Explain repeat request speed",
    launchAttempt: "Caching stores results for later.",
    firstNode: null,
    nodeIds: [],
    route: null,
    composerCta: null,
    colorEnabled: false,
    section: (_kind, label) => `[${label}]`,
    agentLookup: makeAgentLookup(["route", "cold_attempt"]),
  };
}

function makeEvidenceCtx() {
  return {
    conceptId: "caching",
    firstNode: {
      id: "c1_s1",
      kc_id: "c1_s1",
      label: "Cache reuse",
      mechanism: "A stored result is reused for matching later requests.",
      learner_prompt: "Why does caching make the second request faster?",
    },
    nodeIds: ["c1_s1"],
    route: { provisional_map: { nodes: [] } },
    composerCta: null,
    section: (_kind, label) => `[${label}]`,
    agentLookup: makeAgentLookup(["evidence_judge"]),
  };
}

test("bridge client reports typed invalid-json and nonzero errors without raw stdout", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "socratink-bridge-"));
  const diagnosticsDir = path.join(dir, "bridge-diagnostics");
  const bridgePath = path.join(dir, "fake-bridge.mjs");
  writeFileSync(
    bridgePath,
    `
const action = process.argv[2];
if (action === "bad-json") {
  process.stdout.write("RAW MODEL BRIDGE: do not reveal this mechanism");
  process.exit(0);
}
if (action === "nonzero") {
  process.stdout.write(JSON.stringify({ error: "FixtureExit", message: "fixture failed" }));
  process.exit(2);
}
process.stdout.write(JSON.stringify({ ok: true }));
`,
  );
  const client = createBridgeClient({
    workspaceRoot: dir,
    bridgePath,
    python: process.execPath,
    diagnosticsDir,
  });

  const badJson = client.callBridgeResult("bad-json", {});
  assert.equal(badJson.ok, false);
  assert.equal(badJson.error, "BridgeNonJson");
  assert.equal(badJson.message, "bridge returned non-json output");
  assert.ok(badJson.diagnostic?.path);
  assert.doesNotMatch(badJson.message, /RAW MODEL BRIDGE/);
  assert.match(
    readFileSync(badJson.diagnostic.path, "utf8"),
    /RAW MODEL BRIDGE: do not reveal this mechanism/,
  );

  assert.throws(
    () => client.callBridge("bad-json", {}),
    (error) => error.error === "BridgeNonJson" && !/RAW MODEL BRIDGE/.test(error.message),
  );

  const nonzero = client.callBridgeResult("nonzero", {});
  assert.equal(nonzero.ok, false);
  assert.equal(nonzero.error, "FixtureExit");
  assert.equal(nonzero.message, "fixture failed");
  assert.ok(nonzero.diagnostic?.path);
  assert.match(readFileSync(nonzero.diagnostic.path, "utf8"), /FixtureExit/);
});

test("bridge client times out hung subprocesses with diagnostics", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "socratink-bridge-timeout-"));
  const diagnosticsDir = path.join(dir, "bridge-diagnostics");
  const bridgePath = path.join(dir, "slow-bridge.mjs");
  writeFileSync(
    bridgePath,
    `
setTimeout(() => {
  process.stdout.write(JSON.stringify({ ok: true }));
}, 300);
`,
  );
  const client = createBridgeClient({
    workspaceRoot: dir,
    bridgePath,
    python: process.execPath,
    diagnosticsDir,
    timeoutMs: 50,
  });

  const started = Date.now();
  const timeout = client.callBridgeResult("slow-action", {});
  const elapsed = Date.now() - started;

  assert.equal(timeout.ok, false);
  assert.equal(timeout.error, "BridgeTimeout");
  assert.match(timeout.message, /timed out after 50ms/);
  assert.ok(Math.abs(timeout.duration_ms - 50) <= 35);
  assert.ok(elapsed < 250);
  assert.ok(timeout.diagnostic?.path);
  const diagnostic = JSON.parse(readFileSync(timeout.diagnostic.path, "utf8"));
  assert.equal(diagnostic.error, "BridgeTimeout");
  assert.equal(diagnostic.timeout_ms, 50);
  assert.equal(diagnostic.action, "slow-action");

  const event = resultToBridgeError({
    result: timeout,
    action: "slow-action",
    phase: "repair_dialogue",
  });
  assert.equal(event.type, "bridge_error");
  assert.equal(event.error, "BridgeTimeout");
  assert.equal(event.duration_ms, timeout.duration_ms);
  assert.equal(event.timeout_ms, 50);
});

test("bridge client ignores invalid timeout config", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "socratink-bridge-timeout-default-"));
  const bridgePath = path.join(dir, "quick-bridge.mjs");
  writeFileSync(
    bridgePath,
    `
setTimeout(() => {
  process.stdout.write(JSON.stringify({ ok: true }));
}, 25);
`,
  );

  for (const timeoutMs of ["bogus", -1]) {
    const client = createBridgeClient({
      workspaceRoot: dir,
      bridgePath,
      python: process.execPath,
      timeoutMs,
    });

    assert.deepEqual(client.callBridgeResult("quick-action", {}), {
      ok: true,
      payload: { ok: true },
    });
  }
});

test("route retry exhaustion falls back to generic no-leak route", async () => {
  const events = [];
  const ctx = makeRouteCtx();
  const result = await handleRoute({
    events,
    bridge: {
      callBridgeResult: () => ({
        ok: false,
        error: "SmallestRouteCapExceeded",
        message: "copies hidden mechanism",
      }),
    },
    options: {},
    ctx,
  });

  assert.deepEqual(events.map((event) => event.type), [
    "route_retry",
    "route_generated",
  ]);
  assert.equal(events.at(-1).retry_reasons[1].fallback, "generic_before_change_after_prompt");
  assert.equal(
    ctx.firstNode.learner_prompt,
    "Explain the before state, the change, and the result in your own words.",
  );
  assert.equal(ctx.route.first_node.id, "c1_s1");
  assert.equal(nextPhase(events), "cold_attempt");
  assert.equal(result.llm_calls[0].model, "route-fallback");
});

test("non-retryable route failure still fails closed", async () => {
  const events = [];
  const ctx = makeRouteCtx();
  const result = await handleRoute({
    events,
    bridge: {
      callBridgeResult: () => ({
        ok: false,
        error: "ProviderDown",
        message: "provider unavailable",
      }),
    },
    options: {},
    ctx,
  });

  assert.deepEqual(events.map((event) => event.type), ["bridge_error"]);
  assert.equal(events.at(-1).action, "generate-route");
  assert.equal(ctx.route, null);
  assert.equal(nextPhase(events), "idle");
  assert.deepEqual(result.llm_calls, []);
});

test("malformed cold evaluator output does not append evidence or score-eligible event", async () => {
  const events = [];
  const derived = [];
  const appendAttemptCalls = [];
  const ctx = makeEvidenceCtx();

  await handleColdAttempt({
    events,
    derived,
    store: {
      appendAttempt: async (...args) => appendAttemptCalls.push(args),
      loadTraining: async () => ({ node_records: {} }),
    },
    bridge: {
      callBridge: () => ({
        evaluation: { classification: "solid" },
        llm_call: { provider: "fake", model: "bad-evaluator" },
      }),
    },
    prompt: { ask: async () => "It reuses a stored result." },
    options: {},
    ctx,
  });

  assert.equal(appendAttemptCalls.length, 0);
  assert.equal(derived.length, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "bridge_error");
  assert.equal(events[0].phase, "cold_attempt");
  assert.equal(events[0].score_eligible, false);
  assert.equal(events.some((event) => event.type === "cold_attempt"), false);
});

test("malformed repair-dialogue output cannot set bridge_ready", async () => {
  const events = [];
  const ctx = {
    conceptId: "caching",
    firstNode: { id: "c1_s1", kc_id: "c1_s1" },
    gapId: "gap-c1_s1-1",
    repairScaffold: {
      socratic_question: "What must be stored before the second request?",
      analogical_prompt: "",
      micro_scaffold_prompt: "",
      missing_operation: "stored result reused",
      before: "first request",
      after: "later request",
    },
    repairState: {
      turnIndex: 0,
      escalationLevel: 0,
      isFirstTurn: true,
      queuedPrompt: null,
      uncertaintyRecoveryCount: 0,
      hintCount: 0,
      lastHintLevel: 0,
      ladderPolicyVersion: "test",
    },
    composerCta: null,
    section: (_kind, label) => `[${label}]`,
    agentLookup: makeAgentLookup(["repair"]),
  };

  await handleRepairDialogue({
    events,
    bridge: {
      callBridge: () => ({
        repair_dialogue: {
          bridge_ready: true,
          judge_reason: "claims readiness but omits graph neutrality contract",
        },
        llm_call: { provider: "fake", model: "bad-dialogue" },
      }),
    },
    prompt: { ask: async () => "The first request stores the result." },
    options: {},
    ctx,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "bridge_error");
  assert.equal(events[0].phase, "repair_dialogue");
  assert.equal(events.some((event) => event.type === "repair_dialogue_turn"), false);
  assert.equal(nextPhase(events), "idle");
});

test("model bridge refuses to reveal mechanism without valid readiness chain", async () => {
  const events = [];
  const derived = [];
  const ctx = {
    conceptId: "caching",
    firstNode: {
      id: "c1_s1",
      kc_id: "c1_s1",
      mechanism: "MODEL BRIDGE TEXT MUST NOT APPEAR",
    },
    nodeIds: ["c1_s1"],
    section: (_kind, label) => `[${label}]`,
    agentLookup: makeAgentLookup(["model_bridge"]),
  };

  const result = await handleModelBridge({
    events,
    derived,
    store: { loadTraining: async () => ({ node_records: {} }) },
    ctx,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "bridge_error");
  assert.equal(events[0].phase, "model_bridge");
  assert.equal(events.some((event) => event.type === "model_bridge"), false);
  assert.doesNotMatch(JSON.stringify(events), /MODEL BRIDGE TEXT MUST NOT APPEAR/);
  assert.equal(derived.length, 0);
  assert.deepEqual(result.llm_calls, []);
});
