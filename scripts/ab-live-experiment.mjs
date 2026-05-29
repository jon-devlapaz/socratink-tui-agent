#!/usr/bin/env node
/**
 * Live Gemini A/B: run the same scripted fixtures in two TUI checkouts and
 * compare session metrics (classifications, repair path, LLM cost).
 *
 * Usage:
 *   export GEMINI_API_KEY=...
 *   node scripts/ab-live-experiment.mjs
 *   node scripts/ab-live-experiment.mjs --dry-run
 *   node scripts/ab-live-experiment.mjs --fixtures fixtures/source_less_script.json
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_A = path.resolve(__dirname, "..");
const DEFAULT_B = path.resolve(__dirname, "../../socratink-tui-agent");
const DEFAULT_FIXTURES = [
  "fixtures/source_less_script.json",
  "fixtures/cold_help_then_substantive.json",
  "fixtures/blocked_repair_script.json",
];

function usage() {
  return `Live A/B experiment (real Gemini)

  node scripts/ab-live-experiment.mjs [options]

Options:
  --variant-a <dir>   Control checkout (default: this repo)
  --variant-b <dir>   Treatment checkout (default: ../socratink-tui-agent)
  --fixtures <csv>    Comma-separated fixture paths (repo-relative)
  --out <dir>         Output root (default: .qa-runs/ab-live/<timestamp>)
  --dry-run           Print plan only; no sessions
  --label-a <name>    Report label (default: variant-a)
  --label-b <name>    Report label (default: variant-b)
`;
}

function parseArgs(argv) {
  const options = {
    variantA: DEFAULT_A,
    variantB: DEFAULT_B,
    fixtures: [...DEFAULT_FIXTURES],
    out: null,
    dryRun: false,
    labelA: "variant-a",
    labelB: "variant-b",
  };
  const args = [...argv.slice(2)];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--variant-a") options.variantA = path.resolve(args.shift());
    else if (arg === "--variant-b") options.variantB = path.resolve(args.shift());
    else if (arg === "--fixtures") {
      options.fixtures = args
        .shift()
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
    } else if (arg === "--out") options.out = path.resolve(args.shift());
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--label-a") options.labelA = args.shift();
    else if (arg === "--label-b") options.labelB = args.shift();
    else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readPromptVersions(repoRoot) {
  const tmplPath = path.join(repoRoot, "prompt_templates.py");
  const text = await fs.readFile(tmplPath, "utf8");
  const versions = {};
  for (const key of [
    "evaluator",
    "delta",
    "socratic_repair_drill",
    "repair_dialogue",
  ]) {
    const re = new RegExp(`"${key}":\\s*\\{[^}]*"version":\\s*"([^"]+)"`, "s");
    const match = text.match(re);
    versions[key] = match?.[1] ?? "unknown";
  }
  return versions;
}

function runSession({ repoRoot, fixturePath, logRoot, dryRun }) {
  const appPath = path.join(repoRoot, "app.mjs");
  const relFixture = path.isAbsolute(fixturePath)
    ? fixturePath
    : path.join(repoRoot, fixturePath);
  const args = [appPath, "--scripted", relFixture, "--color=never"];
  if (dryRun) {
    return Promise.resolve({ code: 0, dryRun: true });
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-warnings", ...args], {
      cwd: repoRoot,
      env: (() => {
        const env = { ...process.env, SOCRATINK_TUI_LOG_ROOT: logRoot };
        delete env.SOCRATINK_TUI_FAKE_LLM;
        return env;
      })(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

async function latestSessionPath(logRoot) {
  const entries = await fs.readdir(logRoot, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (!dirs.length) return null;
  return path.join(logRoot, dirs.at(-1), "session.json");
}

function summarizeSession(session, meta) {
  const events = session.events || [];
  const cold = events.find((e) => e.type === "cold_attempt");
  const coldHelp = events.filter((e) => e.type === "cold_help_turn");
  const repairTurns = events.filter((e) => e.type === "repair_dialogue_turn");
  const repairReady = repairTurns.find((e) => e.bridge_ready);
  const gap = events.find((e) => e.type === "post_bridge_transfer_check");
  const spaced = events.find((e) => e.type === "spaced_redrill");
  const llmCalls = session.llm_calls || [];

  const nodeId = session.route?.first_node?.id;
  const finalState =
    nodeId && session.training?.nodes?.[nodeId]?.state
      ? session.training.nodes[nodeId].state
      : null;

  return {
    ...meta,
    exit_ok: true,
    cold_classification: cold?.evaluation?.classification ?? null,
    cold_answer_mode: cold?.evaluation?.answer_mode ?? null,
    cold_agent_response: cold?.evaluation?.agent_response ?? null,
    cold_help_turns: coldHelp.length,
    strong_cold_path: events.some((e) => e.type === "strong_cold_path"),
    repair_abandoned: events.some((e) => e.type === "repair_abandoned"),
    repair_dialogue_turns: repairTurns.length,
    bridge_ready_turn: repairReady?.turn_index ?? null,
    gap_classification: gap?.evaluation?.classification ?? null,
    spaced_classification: spaced?.evaluation?.classification ?? null,
    final_node_state: finalState,
    llm_call_count: llmCalls.length,
    llm_latency_ms: llmCalls.reduce(
      (sum, c) => sum + (Number(c.latency_ms) || 0),
      0,
    ),
    prompt_versions: llmCalls
      .map((c) => c.prompt_version)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i),
  };
}

function compareRow(label, a, b) {
  const same = JSON.stringify(a) === JSON.stringify(b);
  const flag = same ? "" : " *";
  return `| ${label} | ${formatCell(a)} | ${formatCell(b)} |${flag}`;
}

function formatCell(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.join(", ") || "—";
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.dryRun && !process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is required for live A/B (not fake LLM).");
    process.exit(1);
  }

  for (const [label, dir] of [
    [options.labelA, options.variantA],
    [options.labelB, options.variantB],
  ]) {
    if (!(await pathExists(dir))) {
      console.error(`${label} not found: ${dir}`);
      process.exit(1);
    }
    if (!(await pathExists(path.join(dir, "app.mjs")))) {
      console.error(`${label} is not a TUI root (missing app.mjs): ${dir}`);
      process.exit(1);
    }
  }

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const experimentDir =
    options.out || path.join(DEFAULT_A, ".qa-runs", "ab-live", stamp);
  await fs.mkdir(experimentDir, { recursive: true });

  const manifest = {
    created_at: new Date().toISOString(),
    dry_run: options.dryRun,
    variant_a: { label: options.labelA, path: options.variantA },
    variant_b: { label: options.labelB, path: options.variantB },
    fixtures: options.fixtures,
    runs: [],
  };

  const versionA = await readPromptVersions(options.variantA);
  const versionB = await readPromptVersions(options.variantB);
  manifest.prompt_versions = { a: versionA, b: versionB };

  console.log(`Experiment: ${experimentDir}`);
  console.log(`A (${options.labelA}): ${options.variantA}`);
  console.log(`B (${options.labelB}): ${options.variantB}`);
  console.log(`Fixtures: ${options.fixtures.join(", ")}`);
  if (options.dryRun) console.log("(dry run)\n");

  const summaries = [];

  for (const fixture of options.fixtures) {
    const fixtureBase = path.basename(fixture, ".json");
    console.log(`\n=== ${fixtureBase} ===`);

    for (const [variantLabel, repoRoot] of [
      [options.labelA, options.variantA],
      [options.labelB, options.variantB],
    ]) {
      const logRoot = path.join(experimentDir, variantLabel, fixtureBase);
      await fs.mkdir(logRoot, { recursive: true });
      const absFixture = path.isAbsolute(fixture)
        ? fixture
        : path.join(repoRoot, fixture);

      console.log(`  → ${variantLabel} …`);
      if (!(await pathExists(absFixture))) {
        console.warn(`    skip: fixture missing at ${absFixture}`);
        manifest.runs.push({
          variant: variantLabel,
          fixture,
          skipped: "fixture_missing",
        });
        continue;
      }

      const runMeta = {
        variant: variantLabel,
        fixture,
        repo: repoRoot,
        log_root: logRoot,
      };
      manifest.runs.push(runMeta);

      const result = await runSession({
        repoRoot,
        fixturePath: absFixture,
        logRoot,
        dryRun: options.dryRun,
      });

      if (options.dryRun) continue;

      if (result.code !== 0) {
        console.error(`    failed exit ${result.code}`);
        if (result.stderr) console.error(result.stderr.slice(0, 500));
        summaries.push({
          ...runMeta,
          exit_ok: false,
          exit_code: result.code,
        });
        continue;
      }

      const sessionPath = await latestSessionPath(logRoot);
      if (!sessionPath) {
        summaries.push({ ...runMeta, exit_ok: false, error: "no_session_log" });
        continue;
      }
      const session = JSON.parse(await fs.readFile(sessionPath, "utf8"));
      runMeta.session_path = sessionPath;
      summaries.push(summarizeSession(session, runMeta));
      console.log(`    log: ${sessionPath}`);
    }
  }

  const report = {
    experiment_dir: experimentDir,
    prompt_versions: manifest.prompt_versions,
    summaries,
  };
  await fs.writeFile(
    path.join(experimentDir, "report.json"),
    JSON.stringify(report, null, 2),
  );

  if (!options.dryRun && summaries.length) {
    const lines = [
      "# A/B live terminal experiment",
      "",
      `Output: \`${experimentDir}\``,
      "",
      "## Prompt versions",
      "",
      "| template | A | B |",
      "| --- | --- | --- |",
    ];
    for (const key of Object.keys(versionA)) {
      const same = versionA[key] === versionB[key];
      lines.push(
        `| ${key} | ${versionA[key]} | ${versionB[key]} |${same ? "" : " *"}`,
      );
    }
    lines.push("", "## Per fixture", "");

    for (const fixture of options.fixtures) {
      const base = path.basename(fixture, ".json");
      const a = summaries.find(
        (s) => s.fixture === fixture && s.variant === options.labelA,
      );
      const b = summaries.find(
        (s) => s.fixture === fixture && s.variant === options.labelB,
      );
      if (!a && !b) continue;
      lines.push(`### ${base}`, "");
      lines.push("| metric | A | B |");
      lines.push("| --- | --- | --- |");
      const keys = [
        "cold_classification",
        "cold_help_turns",
        "strong_cold_path",
        "repair_dialogue_turns",
        "bridge_ready_turn",
        "repair_abandoned",
        "gap_classification",
        "spaced_classification",
        "final_node_state",
        "llm_call_count",
        "llm_latency_ms",
      ];
      for (const key of keys) {
        lines.push(compareRow(key, a?.[key], b?.[key]));
      }
      lines.push("");
      if (a?.cold_agent_response || b?.cold_agent_response) {
        lines.push("**Cold agent_response**", "");
        lines.push(`- A: ${a?.cold_agent_response ?? "—"}`);
        lines.push(`- B: ${b?.cold_agent_response ?? "—"}`, "");
      }
    }
    lines.push("* = differs between variants");
    await fs.writeFile(
      path.join(experimentDir, "REPORT.md"),
      lines.join("\n"),
    );
    console.log(`\nWrote ${path.join(experimentDir, "REPORT.md")}`);
  }

  await fs.writeFile(
    path.join(experimentDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`Wrote ${path.join(experimentDir, "manifest.json")}`);
}

await main();
