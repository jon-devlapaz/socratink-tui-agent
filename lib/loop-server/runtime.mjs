import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBridgeClient } from "../bridge/client.mjs";
import { resolveTuiPaths, preflightTuiPaths } from "../config/paths.mjs";
import { HANDLERS } from "../seda/handlers/index.mjs";
import { initTrainingDerive } from "../seda/training-summary.mjs";

const paths = resolveTuiPaths();
preflightTuiPaths(paths);
const { callBridge, callBridgeResult } = createBridgeClient(paths);
await initTrainingDerive(paths);
const trainingStore = await import(
  pathToFileURL(paths.trainingStorePath).href
);
const { createTrainingStore } = trainingStore;

const AGENT_CONTRACTS_PATH = path.join(
  paths.workspaceRoot,
  "pedagogical_agents/contracts.json",
);

export async function loadAgentLookup() {
  const contracts = JSON.parse(await fs.readFile(AGENT_CONTRACTS_PATH, "utf8"));
  const lookup = new Map();
  (contracts?.agents || []).forEach((agent) => lookup.set(agent.id, agent));
  return { contracts, lookup };
}

function createMemoryStorage() {
  const writes = new Map();
  return {
    getItem(key) {
      return writes.has(key) ? writes.get(key) : null;
    },
    setItem(key, value) {
      writes.set(key, value);
    },
    removeItem(key) {
      writes.delete(key);
    },
  };
}

export function makeSections() {
  return function section(_kind, label) {
    return `[${label}]`;
  };
}

export async function createSessionState({ agentLookup, agentContracts }) {
  const storage = createMemoryStorage();
  const store = createTrainingStore({ storage });
  return {
    id: crypto.randomUUID(),
    phase: "idle",
    events: [],
    derived: [],
    evidenceHolds: [],
    llmCalls: [],
    transcript: [],
    status: "active",
    pendingInput: null,
    ctx: {
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
      gapId: "",
      repairState: null,
      evidenceHolds: [],
      scripted: null,
      agentLookup,
      agentContracts,
      section: makeSections(),
      colorEnabled: false,
      logDir: null,
    },
    store,
    bridge: { callBridge, callBridgeResult },
    handlers: HANDLERS,
    options: { color: "never", logRawLlm: false, loopUi: true },
  };
}

export { paths };
