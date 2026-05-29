#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const WORKSPACE_ROOT = process.cwd();
const REGISTRY_PATH = path.join(WORKSPACE_ROOT, "lib/bridge/registry.json");

function usage() {
  return [
    "Usage: node scripts/refresh-route-runtime-pin.mjs [--dry-run]",
    "",
    "Recompute prompt_sha256 for generate-route route_runtime in registry.json.",
  ].join("\n");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const registry = JSON.parse(await fs.readFile(REGISTRY_PATH, "utf8"));
  const routeRuntime = registry.actions["generate-route"].route_runtime;
  if (!routeRuntime?.prompt_path) {
    throw new Error("generate-route.route_runtime.prompt_path missing");
  }

  const promptPath = path.join(WORKSPACE_ROOT, routeRuntime.prompt_path);
  const bytes = await fs.readFile(promptPath);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");

  if (routeRuntime.prompt_sha256 === digest) {
    console.log("route_runtime.prompt_sha256 already up to date.");
    return;
  }

  if (dryRun) {
    console.log(`Dry run — would set prompt_sha256 to ${digest}`);
    return;
  }

  routeRuntime.prompt_sha256 = digest;
  await fs.writeFile(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`Updated route_runtime.prompt_sha256 → ${digest}`);
  console.log("Run: node scripts/refresh-bridge-registry-doc.mjs");
}

await main();
