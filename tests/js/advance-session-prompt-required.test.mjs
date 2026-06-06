import test from "node:test";
import assert from "node:assert/strict";

import { advanceSession } from "../../lib/loop-server/session.mjs";
import { promptRequired } from "../../lib/loop-server/errors.mjs";

function makeSession(overrides = {}) {
  const events = [];
  const ctx = {
    events,
    evidenceHolds: [],
    concept: "",
    conceptId: "",
    learnerGoal: null,
    launchAttempt: null,
    firstNode: null,
    nodeIds: [],
    route: null,
    coldEval: null,
    coldAttemptText: "",
    zeroSchemaCold: false,
    isMisconception: false,
    repairScaffold: null,
    postBridgeTransfer: null,
    gapId: "",
    repairState: null,
    composerCta: null,
    agentContracts: null,
  };
  return {
    id: "test-session",
    phase: "substrate_gate",
    status: "active",
    pendingInput: null,
    awaiting: null,
    transcript: [],
    events,
    derived: [],
    llmCalls: [],
    handlers: {
      substrate_gate: async ({ prompt }) => {
        await prompt.ask("substrate_refinement", "Refine the substrate:");
      },
    },
    store: {
      loadTraining: async () => null,
      saveTraining: async () => {},
    },
    bridge: {
      callBridge: async () => ({}),
      callBridgeResult: async () => ({}),
    },
    options: { loopUi: true },
    ctx,
    ...overrides,
  };
}

test("advanceSession keeps the throwing phase when prompt input is required", async () => {
  const session = makeSession();
  const response = await advanceSession(session);

  assert.equal(response.status, "awaiting_input");
  assert.equal(response.phase, "substrate_gate");
  assert.equal(session.phase, "substrate_gate");
  assert.equal(response.awaiting?.key, "substrate_refinement");
});

test("advanceSession preserves phase when handler throws promptRequired directly", async () => {
  const session = makeSession({
    phase: "repair_dialogue",
    handlers: {
      repair_dialogue: async () => {
        throw promptRequired({ key: "repair_dialogue", label: "Repair turn:" });
      },
    },
  });

  const response = await advanceSession(session);
  assert.equal(response.phase, "repair_dialogue");
  assert.equal(session.phase, "repair_dialogue");
});

test("advanceSession keeps phase after a prior handler advanced the loop", async () => {
  const session = makeSession({
    phase: "idle",
    handlers: {
      idle: async ({ events }) => {
        events.push({ type: "idle_new_concept" });
      },
      ignition: async ({ prompt }) => {
        await prompt.ask("concept", "Concept:");
      },
    },
  });

  const response = await advanceSession(session);
  assert.equal(response.status, "awaiting_input");
  assert.equal(response.phase, "ignition");
  assert.equal(session.phase, "ignition");
  assert.equal(response.awaiting?.key, "concept");
});
