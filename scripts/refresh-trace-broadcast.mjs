#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { buildProductLoop } from "../lib/seda/session-record.mjs";

const WORKSPACE_ROOT = process.cwd();
const CASES_PATH = path.join(WORKSPACE_ROOT, "learning_cases/cases.jsonl");

function usage() {
  return [
    "Usage: node scripts/refresh-trace-broadcast.mjs [--dry-run]",
    "",
    "Re-derive product_loop on promoted learning_cases traces from events[]",
    "(session-record.mjs). Does not mutate the event log.",
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

async function refreshSession(sessionPath, dryRun) {
  const session = JSON.parse(await fs.readFile(sessionPath, "utf8"));
  const before = JSON.stringify(session.product_loop ?? null);
  const next = buildProductLoop(session.events || []);
  const after = JSON.stringify(next);
  if (before === after) {
    return { sessionPath, changed: false };
  }
  if (!dryRun) {
    session.product_loop = next;
    await fs.writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
  }
  return { sessionPath, changed: true, before: JSON.parse(before), after: next };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const cases = await loadCases();
  const sessionPaths = new Set(
    cases.map((caseRecord) => path.join(WORKSPACE_ROOT, caseRecord.trace || caseRecord.session_log)),
  );

  const results = [];
  for (const sessionPath of sessionPaths) {
    results.push(await refreshSession(sessionPath, dryRun));
  }

  const changed = results.filter((result) => result.changed);
  console.log(
    dryRun ? "Dry run — product_loop changes:" : "Refreshed product_loop on promoted traces:",
  );
  if (!changed.length) {
    console.log("  (no changes needed)");
    return;
  }
  for (const result of changed) {
    const rel = path.relative(WORKSPACE_ROOT, result.sessionPath);
    console.log(`  ${rel}`);
    if (dryRun && result.before && result.after) {
      console.log(`    before: ${JSON.stringify(result.before)}`);
      console.log(`    after:  ${JSON.stringify(result.after)}`);
    }
  }
}

await main();
