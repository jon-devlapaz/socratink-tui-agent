#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { createBridgeClient } from "./lib/bridge/client.mjs";
import { resolveTuiPaths, preflightTuiPaths } from "./lib/config/paths.mjs";
import {
  feedbackMetaFromCtx,
  handleFeedbackCommand,
} from "./lib/feedback/handle.mjs";
import { printPromptHelp } from "./lib/loop-server/prompt-help.mjs";
import { appendMetaTurn } from "./lib/seda/meta-command.mjs";
import {
  isExitCommand,
  isFeedbackCommand,
  isHelpCommand,
  isMetaCommand,
} from "./lib/seda/prompt-commands.mjs";
import { runSedaLoop } from "./lib/seda/run-loop.mjs";
import { buildSessionRecord } from "./lib/seda/session-record.mjs";
import {
  createSessionKernel,
  loadAgentContracts,
  makeAgentLookup,
} from "./lib/seda/session-kernel.mjs";
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

async function loadScripted(scriptPath) {
  if (!scriptPath) return null;
  return JSON.parse(await fs.readFile(scriptPath, "utf8"));
}

async function makePrompt(scripted, ctx) {
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
          if (isMetaCommand(value)) {
            appendMetaTurn(ctx.events, key);
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
        if (isMetaCommand(trimmed)) {
          appendMetaTurn(ctx.events, key);
          continue;
        }
        if (isFeedbackCommand(trimmed)) {
          await handleFeedbackCommand(trimmed, feedbackMetaFromCtx(ctx, { phase: key }));
          continue;
        }
        if (isExitCommand(trimmed)) {
          throw new Error("exit-requested");
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
  const agentContracts = await loadAgentContracts(workspaceRoot);
  const agentLookup = makeAgentLookup(agentContracts);
  const colorEnabled = useColor(options.color);
  const section = makeSections(colorEnabled);
  const logDir = await createSessionLogDir();

  const kernel = createSessionKernel({
    createTrainingStore,
    bridge: { callBridge, callBridgeResult },
    agentContracts,
    agentLookup,
    section,
    scripted,
    colorEnabled,
    logDir,
  });
  const {
    events,
    derived,
    llmCalls,
    evidenceHolds,
    store,
    bridge,
    handlers,
    ctx,
  } = kernel;

  console.log("Socratink Terminal");
  console.log("==================");
  console.log("Source-less dogfood loop. Local session only.");
  console.log("");

  const prompt = await makePrompt(scripted, ctx);

  try {
    await runSedaLoop({
      handlers,
      events,
      derived,
      store,
      bridge,
      prompt,
      options,
      ctx,
      onLlmCalls: (calls) => llmCalls.push(...calls),
    });
  } catch (error) {
    if (error?.message !== "exit-requested") throw error;
    if (!events.some((e) => e.type === "idle_exit")) {
      events.push({ type: "idle_exit" });
    }
    console.log("\nSession ended.");
  }

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
