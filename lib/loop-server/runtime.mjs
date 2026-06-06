import { pathToFileURL } from "node:url";
import { createBridgeClient } from "../bridge/client.mjs";
import { resolveTuiPaths, preflightTuiPaths } from "../config/paths.mjs";
import {
  createSessionKernel,
  loadAgentContracts,
  makeAgentLookup,
} from "../seda/session-kernel.mjs";
import { initTrainingDerive } from "../seda/training-summary.mjs";

const paths = resolveTuiPaths();
preflightTuiPaths(paths);
const { callBridge, callBridgeResult } = createBridgeClient(paths);
await initTrainingDerive(paths);
const trainingStore = await import(
  pathToFileURL(paths.trainingStorePath).href
);
const { createTrainingStore } = trainingStore;

export async function loadAgentLookup() {
  const contracts = await loadAgentContracts(paths.workspaceRoot);
  const lookup = makeAgentLookup(contracts);
  return { contracts, lookup };
}

export function makeSections() {
  return function section(_kind, label) {
    return `[${label}]`;
  };
}

export async function createSessionState({ agentLookup, agentContracts }) {
  const kernel = createSessionKernel({
    createTrainingStore,
    bridge: { callBridge, callBridgeResult },
    agentContracts,
    agentLookup,
    section: makeSections(),
    colorEnabled: false,
    logDir: null,
  });
  return {
    id: crypto.randomUUID(),
    phase: "idle",
    status: "active",
    pendingInput: null,
    transcript: [],
    awaiting: null,
    record: null,
    ...kernel,
    evidenceHolds: kernel.ctx.evidenceHolds,
    options: {
      color: "never",
      logRawLlm: false,
      loopUi: true,
      loopUiPacing: "one_beat",
    },
  };
}

export { paths };
