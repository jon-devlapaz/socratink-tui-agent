#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { createBridgeClient } from "./lib/bridge/client.mjs";
import { resolveTuiPaths, preflightTuiPaths } from "./lib/config/paths.mjs";
import { HANDLERS } from "./lib/seda/handlers/index.mjs";
import { isHelpCommand } from "./lib/seda/prompt-commands.mjs";
import { runSedaLoop } from "./lib/seda/run-loop.mjs";
import { buildSessionRecord } from "./lib/seda/session-record.mjs";
import { initTrainingDerive } from "./lib/seda/training-summary.mjs";
import { makeSections } from "./lib/ui/sections.mjs";

const paths = resolveTuiPaths();
try {
  preflightTuiPaths(paths);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const { workspaceRoot } = paths;
const { callBridge, callBridgeResult } = createBridgeClient(paths);
const AGENT_CONTRACTS_PATH = path.join(
  workspaceRoot,
  "pedagogical_agents/contracts.json",
);
await initTrainingDerive(paths);
const trainingStore = await import(
  pathToFileURL(paths.trainingStorePath).href
);
const { createTrainingStore } = trainingStore;
function parseArgs(argv) {
  const options = {
    scripted: null,
    logRawLlm: false,
    color: "auto",
  };
  const args = [...argv.slice(2)];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--scripted") {
      options.scripted = args.shift();
    } else if (arg === "--log-raw-llm") {
      options.logRawLlm = true;
    } else if (arg.startsWith("--color=")) {
      options.color = arg.slice("--color=".length);
      if (!["auto", "always", "never"].includes(options.color)) {
        throw new Error("--color must be auto, always, or never");
      }
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return [
    "Usage: ./socratink-tui [--log-raw-llm] [--color=auto|always|never] [--scripted path.json]",
    "",
    "Runs a source-less terminal Socratink session using the existing Python LLM seam.",
    "Local env file: .env",
  ].join("\n");
}

function useColor(mode) {
  if (mode === "always") return true;
  if (mode === "never") return false;
  if (process.env.NO_COLOR) return false;
  return Boolean(process.stdout.isTTY);
}

function formatPromptQuestion(label, fallback = "") {
  const suffix = fallback ? ` (${fallback})` : "";
  const base = `${label}${suffix}`;
  const trimmedEnd = base.trimEnd();
  if (trimmedEnd.endsWith(":")) {
    return `${base} `;
  }
  if (base.trim() === ">") {
    return base.endsWith(" ") ? base : `${base} `;
  }
  return `${base}: `;
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

async function loadScripted(scriptPath) {
  if (!scriptPath) return null;
  return JSON.parse(await fs.readFile(scriptPath, "utf8"));
}

async function loadAgentContracts() {
  return JSON.parse(await fs.readFile(AGENT_CONTRACTS_PATH, "utf8"));
}

function makeAgentLookup(contracts) {
  const lookup = new Map();
  (contracts?.agents || []).forEach((agent) => {
    lookup.set(agent.id, agent);
  });
  return lookup;
}

const PROMPT_HELP = {
  concept: {
    title: "Concept",
    body: "Name the idea you want Socratink to build a provisional route around.",
  },
  learner_goal: {
    title: "Learner goal",
    body: "Say what you want to explain or do with the concept. This shapes relevance, not graph evidence.",
  },
  launch_attempt: {
    title: "Launch attempt",
    body: "Write your current model before seeing any route. Rough, incomplete, and uncertain is useful.",
  },
  cold_attempt: {
    title: "Cold attempt",
    body: "Reconstruct the current node from memory. This exposes the gap before any answer material appears.",
  },
  repair: {
    title: "Repair dialogue",
    body: "Fill the missing causal link in your own words: before state -> missing operation -> after state. Type /hint anytime for a bounded nudge.",
  },
  repair_dialogue_turns: {
    title: "Repair dialogue",
    body: "Stay on the same bottleneck. Explain how the missing operation changes the before state into the after state. Type /hint for adaptive support.",
  },
  run_gap_drill: {
    title: "Post-bridge transfer check",
    body: "Choose whether to do a small graph-neutral transfer check after seeing the model bridge.",
  },
  gap_attempt: {
    title: "Post-bridge transfer check",
    body: "Apply the repaired link after comparison material. This keeps the link active but does not prove mastery.",
  },
  spaced_attempt: {
    title: "Spaced re-drill",
    body: "Reconstruct the mechanism again after spacing. Only spaced strong reconstruction can derive solidified.",
  },
};

function printPromptHelp(key) {
  const help = PROMPT_HELP[key] || {
    title: "This step",
    body: "Answer in your own words. Type /help at any prompt to see this guidance.",
  };
  console.log(`[Help] ${help.title}: ${help.body}`);
}

async function makePrompt(scripted) {
  if (scripted) {
    const indexes = new Map();
    return {
      ask: async (key, label, fallback = "") => {
        while (true) {
          const scriptedValue = scripted[key];
          let value = scriptedValue ?? fallback;
          if (Array.isArray(scriptedValue)) {
            const index = indexes.get(key) || 0;
            value = scriptedValue[index] ?? fallback;
            indexes.set(key, index + 1);
          }
          console.log(`${label}${value}`);
          if (isHelpCommand(value)) {
            printPromptHelp(key);
            continue;
          }
          return String(value);
        }
      },
      close: () => {},
    };
  }
  const rl = readline.createInterface({ input, output });
  return {
    ask: async (key, label, fallback = "") => {
      while (true) {
        const answer = await rl.question(formatPromptQuestion(label, fallback));
        const trimmed = answer.trim();
        if (isHelpCommand(trimmed)) {
          printPromptHelp(key);
          continue;
        }
        return trimmed || fallback;
      }
    },
    close: () => rl.close(),
  };
}

async function createSessionLogDir() {
  const root =
    process.env.SOCRATINK_TUI_LOG_ROOT ||
    path.join(workspaceRoot, ".qa-runs/socratink-tui");
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-");
  const dir = path.join(root, stamp);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}


async function run(options) {
  const scripted = await loadScripted(options.scripted);
  const agentContracts = await loadAgentContracts();
  const agentLookup = makeAgentLookup(agentContracts);
  const prompt = await makePrompt(scripted);
  const colorEnabled = useColor(options.color);
  const section = makeSections(colorEnabled);
  const logDir = await createSessionLogDir();
  const llmCalls = [];
  const events = [];
  const derived = [];
  const evidenceHolds = [];
  const storage = createMemoryStorage();
  const store = createTrainingStore({ storage });

  console.log("Socratink Terminal");
  console.log("==================");
  console.log("Source-less dogfood loop. Local session only.");
  console.log("");

  /** @type {import("./lib/seda/ctx.d.ts").SedaCtx} */
  const ctx = {
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
    evidenceHolds,
    scripted,
    agentLookup,
    agentContracts,
    section,
    colorEnabled,
    logDir,
  };

  await runSedaLoop({
    handlers: HANDLERS,
    events,
    derived,
    store,
    bridge: { callBridge, callBridgeResult },
    prompt,
    options,
    ctx,
    onLlmCalls: (calls) => llmCalls.push(...calls),
  });

  const finalTraining = await store.loadTraining(ctx.conceptId);

  console.log(`\nSaved log: ${path.join(logDir, "session.json")}`);

  const session = buildSessionRecord({
    events,
    ctx,
    derived,
    evidenceHolds,
    llmCalls,
    training: finalTraining,
    agentContracts,
  });
  await fs.writeFile(
    path.join(logDir, "session.json"),
    JSON.stringify(session, null, 2),
  );
  prompt.close();
}

async function main() {
  try {
    const options = parseArgs(process.argv);
    if (options.help) {
      console.log(usage());
      return;
    }
    await run(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
