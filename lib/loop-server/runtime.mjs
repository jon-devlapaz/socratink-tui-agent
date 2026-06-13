import { pathToFileURL } from "node:url";
import { createBridgeClient } from "../bridge/client.mjs";
import { llmEnvOverrides } from "./llm-options.mjs";
import { resolveTuiPaths, preflightTuiPaths } from "../config/paths.mjs";
import {
  createSessionKernel,
  loadAgentContracts,
  makeAgentLookup,
} from "../seda/session-kernel.mjs";
import { createRehydratedSessionKernel } from "../seda/session-rehydration.mjs";
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

function sessionBridgeWithDiagnostics({ llm, diagnosticsDir = null } = {}) {
  const envOverrides = llmEnvOverrides(llm);
  if (!envOverrides && !diagnosticsDir) return { callBridge, callBridgeResult };
  const client = createBridgeClient({ ...paths, envOverrides, diagnosticsDir });
  return {
    callBridge: client.callBridge,
    callBridgeResult: client.callBridgeResult,
  };
}

export async function createSessionState({
  agentLookup,
  agentContracts,
  id = null,
  events = null,
  llm = null,
  bridgeDiagnosticsDir = null,
}) {
  const bridge = sessionBridgeWithDiagnostics({ llm, diagnosticsDir: bridgeDiagnosticsDir });
  const kernel = events
    ? await createRehydratedSessionKernel({
        createTrainingStore,
        bridge,
        agentContracts,
        agentLookup,
        section: makeSections(),
        colorEnabled: false,
        logDir: null,
        events,
      })
    : createSessionKernel({
        createTrainingStore,
        bridge,
        agentContracts,
        agentLookup,
        section: makeSections(),
        colorEnabled: false,
        logDir: null,
      });
  return {
    id: id || crypto.randomUUID(),
    phase: kernel.phase || "idle",
    status: "active",
    pendingInput: null,
    transcript: [],
    awaiting: null,
    record: null,
    llm: llm || null,
    bridgeDiagnosticsDir,
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
