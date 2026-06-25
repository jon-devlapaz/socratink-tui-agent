import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(WORKSPACE_ROOT, "scripts", "agentlint.mjs");

async function fakeAgentlintPlan(output) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "socratink-agentlint-"));
  const bin = path.join(dir, "agentlint-plan");
  await writeFile(bin, `#!/bin/sh\nprintf '%s\\n' '${output}'\n`, "utf8");
  await chmod(bin, 0o755);
  return dir;
}

function runAgentlint(binDir, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, "--gate"], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
    },
  });
}

test("agentlint gate accepts score at calibrated threshold", async () => {
  const binDir = await fakeAgentlintPlan("Overall Score: 75/100");
  const result = runAgentlint(binDir);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Socratink AgentLint calibration/);
  assert.match(result.stdout, /\[agentlint\] gate score=75\/100 min=75\/100/);
});

test("agentlint gate fails below calibrated threshold", async () => {
  const binDir = await fakeAgentlintPlan("Overall Score: 74/100");
  const result = runAgentlint(binDir);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[agentlint\] gate score=74\/100 min=75\/100/);
  assert.match(result.stderr, /score below calibrated threshold \(74 < 75\)/);
});

test("agentlint gate honors AGENTLINT_MIN_SCORE override", async () => {
  const binDir = await fakeAgentlintPlan("Overall Score: 74/100");
  const result = runAgentlint(binDir, { AGENTLINT_MIN_SCORE: "70" });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[agentlint\] gate score=74\/100 min=70\/100/);
});

test("agentlint gate fails when score cannot be parsed", async () => {
  const binDir = await fakeAgentlintPlan("No numeric score in this advisory output");
  const result = runAgentlint(binDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not parse AgentLint score for gate mode/);
});
