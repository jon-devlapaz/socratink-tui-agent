import fs from "node:fs/promises";
import path from "node:path";
import { HANDLERS } from "./handlers/index.mjs";

export function createMemoryStorage() {
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

export async function loadAgentContracts(workspaceRoot) {
  const contractsPath = path.join(
    workspaceRoot,
    "pedagogical_agents/contracts.json",
  );
  return JSON.parse(await fs.readFile(contractsPath, "utf8"));
}

export function makeAgentLookup(contracts) {
  const lookup = new Map();
  (contracts?.agents || []).forEach((agent) => {
    lookup.set(agent.id, agent);
  });
  return lookup;
}

export function createDefaultSedaCtx({
  events,
  evidenceHolds,
  scripted = null,
  agentLookup,
  agentContracts,
  section,
  colorEnabled = false,
  logDir = null,
}) {
  return {
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
    evidenceHolds,
    events,
    scripted,
    agentLookup,
    agentContracts,
    section,
    colorEnabled,
    logDir,
  };
}

export function createSessionKernel({
  createTrainingStore,
  bridge,
  agentContracts,
  agentLookup = makeAgentLookup(agentContracts),
  section,
  scripted = null,
  colorEnabled = false,
  logDir = null,
}) {
  const storage = createMemoryStorage();
  const store = createTrainingStore({ storage });
  const events = [];
  const derived = [];
  const llmCalls = [];
  const evidenceHolds = [];
  const ctx = createDefaultSedaCtx({
    events,
    evidenceHolds,
    scripted,
    agentLookup,
    agentContracts,
    section,
    colorEnabled,
    logDir,
  });

  return {
    events,
    derived,
    llmCalls,
    evidenceHolds,
    store,
    bridge,
    handlers: HANDLERS,
    agentContracts,
    agentLookup,
    scripted,
    ctx,
  };
}
