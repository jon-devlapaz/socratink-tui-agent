#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { buildDashboardPayload } from "../lib/seda/dashboard-metrics.mjs";

const WORKSPACE_ROOT = process.cwd();
const CASES_PATH = path.join(WORKSPACE_ROOT, "learning_cases/cases.jsonl");

function usage() {
  return [
    "Usage: ./socratink-dashboard [--json]",
    "",
    "Read-only founder summaries over promoted learning_cases/ traces.",
  ].join("\n");
}

async function loadCases() {
  const raw = await fs.readFile(CASES_PATH, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

async function loadSession(caseRecord) {
  if (!caseRecord.session_log) {
    throw new Error(`${caseRecord.case_id}: session_log-required`);
  }
  const sessionPath = path.join(WORKSPACE_ROOT, caseRecord.session_log);
  return JSON.parse(await fs.readFile(sessionPath, "utf8"));
}

function printHuman(payload) {
  console.log(payload.title);
  console.log(`${payload.case_summary.total} promoted cases`);
  console.log("");
  console.log("Recovery telemetry");
  for (const [key, value] of Object.entries(payload.recovery_telemetry)) {
    console.log(`  ${key}: ${value}`);
  }
}

async function main() {
  const jsonMode = process.argv.includes("--json");
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const cases = await loadCases();
  const sessions = [];
  for (const caseRecord of cases) {
    sessions.push(await loadSession(caseRecord));
  }

  const payload = buildDashboardPayload({ cases, sessions });
  if (jsonMode) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  printHuman(payload);
}

await main();
