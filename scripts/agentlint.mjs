#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const gate = args.has("--gate");
const minScore = Number(process.env.AGENTLINT_MIN_SCORE || 75);

const calibration = `

Socratink AgentLint calibration
-------------------------------
Treat AgentLint as an advisory agent-workability audit, not a release gate.

Good fixes to keep:
- canonical local test entrypoint: npm test
- secret scanning and SECURITY.md
- pytest cost markers
- small navigation/docs improvements when they reduce real agent confusion

Do not chase by default:
- git-history rewrites for personal email findings
- generic HANDOFF.md or CHANGELOG.md churn
- test-required commit-pair workflows that duplicate the release ladder
- broad AGENTS.md rewrites unless repeated agent failures justify them

Canonical gates still live in HARNESS-TRACEABILITY.md.
`;

function run(command, args = []) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
}

let result = run("agentlint-plan");
if (result.error?.code === "ENOENT") {
  console.error("[agentlint] agentlint-plan not found; falling back to npx agentlinter");
  result = run("npx", ["--yes", "agentlinter"]);
}

if (result.error) {
  console.error(`[agentlint] failed to run: ${result.error.message}`);
  process.exit(1);
}

const output = `${result.stdout || ""}${result.stderr || ""}`;
process.stdout.write(output);
process.stdout.write(calibration);

if (gate) {
  const plainOutput = output.replace(/\u001b\[[0-9;]*m/g, "");
  const match = plainOutput.match(/(?:Overall\s+)?Score\D+(\d+)\/100/i);
  if (!match) {
    console.error("[agentlint] could not parse AgentLint score for gate mode");
    process.exit(1);
  }
  const score = Number(match[1]);
  console.log(`[agentlint] gate score=${score}/100 min=${minScore}/100`);
  if (score < minScore) {
    console.error(`[agentlint] score below calibrated threshold (${score} < ${minScore})`);
    process.exit(1);
  }
  process.exit(0);
}

process.exit(result.status ?? 1);
