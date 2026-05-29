#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { registry } from "../lib/bridge/registry.mjs";
import {
  renderRegistrySummary,
  spliceGeneratedSummary,
} from "../lib/bridge/render-registry-doc.mjs";

const WORKSPACE_ROOT = process.cwd();
const DOC_PATH = path.join(WORKSPACE_ROOT, "HARNESS-BRIDGE-REGISTRY.md");

function usage() {
  return [
    "Usage: node scripts/refresh-bridge-registry-doc.mjs [--dry-run]",
    "",
    "Regenerate the summary table in HARNESS-BRIDGE-REGISTRY.md from registry.json.",
  ].join("\n");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const markdown = await fs.readFile(DOC_PATH, "utf8");
  const summary = renderRegistrySummary(registry);
  const next = spliceGeneratedSummary(markdown, summary);

  if (next === markdown) {
    console.log("HARNESS-BRIDGE-REGISTRY.md summary already up to date.");
    return;
  }

  if (dryRun) {
    console.log("Dry run — summary would change.");
    return;
  }

  await fs.writeFile(DOC_PATH, next);
  console.log("Refreshed HARNESS-BRIDGE-REGISTRY.md summary from registry.json.");
}

await main();
