import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
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

function runAgentlintWithPath(pathValue, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, "--gate"], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
      PATH: pathValue,
    },
  });
}

function runAgentlintInCwd(cwd, pathValue, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, "--gate"], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
      PATH: pathValue,
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

test("agentlint gate falls back to repo-local agentlinter", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "socratink-agentlint-cwd-"));
  const localBinDir = path.join(cwd, "node_modules", ".bin");
  await mkdir(localBinDir, { recursive: true });
  const localAgentlinter = path.join(localBinDir, "agentlinter");
  await writeFile(localAgentlinter, "#!/bin/sh\nprintf '%s\\n' 'Overall Score: 75/100'\n", "utf8");
  await chmod(localAgentlinter, 0o755);

  const nodeBinDir = path.dirname(process.execPath);
  const result = runAgentlintInCwd(cwd, `${nodeBinDir}${path.delimiter}/usr/bin${path.delimiter}/bin`);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[agentlint\] gate score=75\/100 min=75\/100/);
});

test("agentlint gate fails fast when configured binary is missing", () => {
  const result = runAgentlintWithPath("/usr/bin:/bin", {
    AGENTLINT_PLAN_BIN: path.join(os.tmpdir(), "missing-agentlint-plan"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /failed to run .*missing-agentlint-plan/);
  assert.match(result.stderr, /Install agentlint-plan or npm install/);
});
