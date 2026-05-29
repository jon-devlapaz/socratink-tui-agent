#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startLoopServer } from "./lib/loop-server/http-server.mjs";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.SOCRATINK_TUI_ENV_FILE || path.join(repoRoot, ".env");
if (fs.existsSync(envFile)) {
  const text = fs.readFileSync(envFile, "utf8");
  const fakeInEnvFile = /^\s*SOCRATINK_TUI_FAKE_LLM=1\s*$/m.test(text);
  if (!fakeInEnvFile) {
    delete process.env.SOCRATINK_TUI_FAKE_LLM;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

startLoopServer();
