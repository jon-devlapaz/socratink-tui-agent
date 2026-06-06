import test from "node:test";
import assert from "node:assert/strict";

import { HANDLERS } from "../../lib/seda/handlers/index.mjs";
import {
  createSessionKernel,
  makeAgentLookup,
} from "../../lib/seda/session-kernel.mjs";
import { createSessionState } from "../../lib/loop-server/runtime.mjs";

function createMemoryTrainingStore() {
  const trainings = new Map();
  return {
    createTrainingStore: () => ({
      async loadTraining(conceptId) {
        return trainings.get(conceptId) || null;
      },
      async saveTraining(conceptId, training) {
        trainings.set(conceptId, training);
      },
    }),
  };
}

function createKernel(overrides = {}) {
  const { createTrainingStore } = createMemoryTrainingStore();
  const agentContracts = {
    architecture: {
      orchestrator: "orchestrator",
      truth_contract: "truth",
      state_owner: "state",
    },
    agents: [{ id: "route_designer" }],
  };
  return createSessionKernel({
    createTrainingStore,
    bridge: {
      callBridge: async () => ({}),
      callBridgeResult: async () => ({}),
    },
    agentContracts,
    agentLookup: makeAgentLookup(agentContracts),
    section: (_kind, label) => `[${label}]`,
    ...overrides,
  });
}

test("kernel creates the canonical ctx defaults and shared accumulators", () => {
  const kernel = createKernel({
    scripted: { concept: "Photosynthesis" },
    colorEnabled: true,
    logDir: "/tmp/socratink-session",
  });

  assert.deepEqual(kernel.events, []);
  assert.deepEqual(kernel.derived, []);
  assert.deepEqual(kernel.llmCalls, []);
  assert.deepEqual(kernel.evidenceHolds, []);
  assert.equal(kernel.ctx.events, kernel.events);
  assert.equal(kernel.ctx.evidenceHolds, kernel.evidenceHolds);

  assert.deepEqual(
    {
      concept: kernel.ctx.concept,
      conceptId: kernel.ctx.conceptId,
      learnerGoal: kernel.ctx.learnerGoal,
      launchAttempt: kernel.ctx.launchAttempt,
      firstNode: kernel.ctx.firstNode,
      nodeIds: kernel.ctx.nodeIds,
      route: kernel.ctx.route,
      coldEval: kernel.ctx.coldEval,
      coldAttemptText: kernel.ctx.coldAttemptText,
      zeroSchemaCold: kernel.ctx.zeroSchemaCold,
      isMisconception: kernel.ctx.isMisconception,
      repairScaffold: kernel.ctx.repairScaffold,
      postBridgeTransfer: kernel.ctx.postBridgeTransfer,
      gapId: kernel.ctx.gapId,
      repairState: kernel.ctx.repairState,
      composerCta: kernel.ctx.composerCta,
    },
    {
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
    },
  );

  assert.equal(kernel.ctx.scripted, kernel.scripted);
  assert.equal(kernel.ctx.colorEnabled, true);
  assert.equal(kernel.ctx.logDir, "/tmp/socratink-session");
  assert.equal(kernel.handlers, HANDLERS);
});

test("kernel excludes hosted adapter wrapper state", () => {
  const kernel = createKernel();

  assert.equal("id" in kernel, false);
  assert.equal("phase" in kernel, false);
  assert.equal("status" in kernel, false);
  assert.equal("pendingInput" in kernel, false);
  assert.equal("transcript" in kernel, false);
  assert.equal("awaiting" in kernel, false);
  assert.equal("record" in kernel, false);
  assert.equal("options" in kernel, false);
});

test("hosted session wraps the kernel without replacing kernel-owned identity", async () => {
  const agentContracts = {
    architecture: {
      orchestrator: "orchestrator",
      truth_contract: "truth",
      state_owner: "state",
    },
    agents: [{ id: "route_designer" }],
  };
  const session = await createSessionState({
    agentLookup: makeAgentLookup(agentContracts),
    agentContracts,
  });

  assert.equal(typeof session.id, "string");
  assert.equal(session.phase, "idle");
  assert.equal(session.status, "active");
  assert.equal(session.pendingInput, null);
  assert.deepEqual(session.transcript, []);
  assert.equal(session.awaiting, null);
  assert.equal(session.events, session.ctx.events);
  assert.equal(session.evidenceHolds, session.ctx.evidenceHolds);
  assert.equal(session.handlers, HANDLERS);
  assert.equal(session.ctx.logDir, null);
  assert.equal(session.ctx.composerCta, null);
});
