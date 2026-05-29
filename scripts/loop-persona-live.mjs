#!/usr/bin/env node
/**
 * Live loop persona walkthrough — Jordan plays the learner against /loop API.
 *
 * Prerequisites:
 *   unset SOCRATINK_TUI_FAKE_LLM
 *   GEMINI_API_KEY in .env
 *   ./socratink-loop-server  (another terminal)
 *
 * Usage:
 *   node scripts/loop-persona-live.mjs
 *   node scripts/loop-persona-live.mjs --concept "AI" --goal "Explain overconfidence in models"
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PYTHON = path.join(ROOT, ".venv/bin/python");
const PERSONA_SCRIPT = path.join(ROOT, "scripts/loop_persona_turn.py");

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.SOCRATINK_LOOP_BASE_URL || "http://127.0.0.1:8787",
    concept: "AI",
    learnerGoal:
      "Explain how a model can sound confident but still be wrong about something.",
    launchAttempt:
      "AI predicts the next token from patterns in text, so it can sound right even when it does not truly understand.",
    maxTurns: 24,
    out: null,
  };
  const args = [...argv.slice(2)];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--base-url") options.baseUrl = args.shift().replace(/\/$/, "");
    else if (arg === "--concept") options.concept = args.shift();
    else if (arg === "--goal") options.learnerGoal = args.shift();
    else if (arg === "--launch") options.launchAttempt = args.shift();
    else if (arg === "--max-turns") options.maxTurns = Number(args.shift());
    else if (arg === "--out") options.out = path.resolve(args.shift());
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/loop-persona-live.mjs [--concept AI] [--goal "..."]`);
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || res.statusText || `HTTP ${res.status}`);
  }
  return body;
}

function transcriptText(lines) {
  return (lines || []).map((line) => line.text || "").join("\n");
}

function ignitionScriptedInput(session, options) {
  const key = session.awaiting?.key;
  if (key === "concept") return options.concept;
  if (key === "learner_goal") return options.learnerGoal;
  if (key === "launch_attempt") return options.launchAttempt;
  return null;
}

function personaTurn(payload) {
  const result = spawnSync(PYTHON, [PERSONA_SCRIPT], {
    cwd: ROOT,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "persona turn failed");
  }
  return result.stdout.trim();
}

async function main() {
  const options = parseArgs(process.argv);
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outDir =
    options.out || path.join(ROOT, ".qa-runs/loop-persona", stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const health = await fetchJson(`${options.baseUrl}/health`);
  if (health.fake_llm) {
    console.error(
      "Loop server is in FAKE_LLM mode. Restart with: unset SOCRATINK_TUI_FAKE_LLM && ./socratink-loop-server",
    );
    process.exit(1);
  }

  console.log(`[loop-persona] Jordan · concept="${options.concept}"`);
  console.log(`[loop-persona] server=${options.baseUrl} fake_llm=${health.fake_llm}`);

  let session = await fetchJson(`${options.baseUrl}/api/session`, {
    method: "POST",
  });
  const log = {
    persona: "curious-sophomore-loop (Jordan)",
    concept: options.concept,
    learner_goal: options.learnerGoal,
    turns: [],
  };

  let turns = 0;
  while (!session.complete && turns < options.maxTurns) {
    const label = session.awaiting?.label || session.awaiting?.key || ">";
    let text = ignitionScriptedInput(session, options);
    if (!text) {
      text = personaTurn({
        concept: options.concept,
        learner_goal: options.learnerGoal,
        phase: session.phase,
        awaiting_label: label,
        transcript_text: transcriptText(session.transcript),
      });
    }

    console.log(`\n[turn ${turns + 1}] phase=${session.phase} » ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`);

    session = await fetchJson(
      `${options.baseUrl}/api/session/${session.sessionId}/turn`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
    );

    log.turns.push({
      input: text,
      phase: session.phase,
      status: session.status,
      awaiting: session.awaiting,
      transcript_delta: session.transcript,
    });
    turns += 1;
  }

  log.final = {
    status: session.status,
    phase: session.phase,
    complete: session.complete,
    event_types: (session.events || []).map((e) => e.type),
  };

  const reportPath = path.join(outDir, "persona-run.json");
  fs.writeFileSync(reportPath, JSON.stringify(log, null, 2));

  const mdPath = path.join(outDir, "REPORT.md");
  fs.writeFileSync(
    mdPath,
    [
      "# Loop persona run (live Gemini)",
      "",
      `- Concept: ${options.concept}`,
      `- Goal: ${options.learnerGoal}`,
      `- Turns: ${log.turns.length}`,
      `- Complete: ${log.final.complete}`,
      `- Final phase: ${log.final.phase}`,
      "",
      "## Event types",
      "",
      log.final.event_types.map((t) => `- ${t}`).join("\n"),
      "",
      "## Friction prompts (for founder)",
      "",
      "1. Where did Jordan hesitate or need `/help`?",
      "2. Did the hypothesis map match the concept?",
      "3. Did repair dialogue feel like guessing keywords?",
      "4. Any copy that broke graph honesty?",
      "",
    ].join("\n"),
  );

  console.log(`\n[loop-persona] done complete=${log.final.complete} events=${log.final.event_types.length}`);
  console.log(`[loop-persona] wrote ${reportPath}`);
  console.log(`[loop-persona] wrote ${mdPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
