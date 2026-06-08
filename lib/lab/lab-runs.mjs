import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./persona-runner.mjs";
import {
  labProgressPath,
  readLabProgress,
  requestLabCancel,
  writeLabProgress,
} from "./lab-progress.mjs";

const CLI_SCRIPT = path.join(REPO_ROOT, "scripts/loop-persona-live.mjs");

const runs = new Map();

function personaReportPath(outDir) {
  return path.join(outDir, "persona-run.json");
}

function readPersonaReport(outDir) {
  const filePath = personaReportPath(outDir);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function mergeProgressLog(progress, outDir) {
  if (progress?.status !== "done") return progress?.log || null;
  const report = readPersonaReport(outDir);
  if (report) return report;
  return progress?.log || null;
}

export function resetLabRuns() {
  for (const run of runs.values()) {
    if (run.child && !run.child.killed) {
      run.child.kill("SIGTERM");
    }
  }
  runs.clear();
}

export function getLabRun(runId) {
  return runs.get(runId) || null;
}

export function cancelLabRun(runId) {
  const run = runs.get(runId);
  if (!run) return false;
  const progress = readLabProgress(run.outDir);
  if (progress && ["done", "error", "cancelled"].includes(progress.status)) {
    return false;
  }
  run.cancelRequested = true;
  run.updatedAt = Date.now();
  requestLabCancel(run.outDir);
  run.child?.kill?.("SIGTERM");
  return true;
}

function snapshotRun(run) {
  const progress = readLabProgress(run.outDir) || {};
  const terminal = ["done", "error", "cancelled"].includes(progress.status);
  const status = terminal ? progress.status : progress.status || run.status;
  const log = mergeProgressLog(progress, run.outDir);

  return {
    runId: run.runId,
    status,
    busy: progress.busy ?? false,
    busyLabel: progress.busyLabel ?? null,
    error: progress.error || null,
    outDir: run.outDir,
    reportPath: progress.reportPath || personaReportPath(run.outDir),
    brains: progress.brains || log?.brains || null,
    cartridgeId: run.cartridgeId,
    student: run.student,
    allowFake: run.allowFake,
    log,
    updatedAt: progress.updatedAt || run.updatedAt,
  };
}

export function getLabRunSnapshot(runId) {
  const run = runs.get(runId);
  return run ? snapshotRun(run) : null;
}

function buildCliArgs(run) {
  const args = [
    CLI_SCRIPT,
    "--cartridge",
    run.cartridgeId,
    "--student",
    run.student,
    "--max-turns",
    String(run.maxTurns),
    "--base-url",
    run.baseUrl,
    "--out",
    run.outDir,
    "--progress-file",
    labProgressPath(run.outDir),
  ];
  if (run.allowFake) args.push("--allow-fake");
  return args;
}

function spawnLabCli(run, { spawnChild = spawn } = {}) {
  const child = spawnChild(process.execPath, buildCliArgs(run), {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: ["ignore", "ignore", "ignore"],
    detached: false,
  });
  run.child = child;

  child.on("exit", (code, signal) => {
    run.child = null;
    const progress = readLabProgress(run.outDir);
    if (progress && ["done", "error", "cancelled"].includes(progress.status)) {
      run.updatedAt = Date.now();
      return;
    }
    if (run.cancelRequested || progress?.status === "cancelled") {
      writeLabProgress(run.outDir, {
        status: "cancelled",
        busy: false,
        busyLabel: null,
      });
      run.updatedAt = Date.now();
      return;
    }
    writeLabProgress(run.outDir, {
      status: "error",
      busy: false,
      busyLabel: null,
      error:
        progress?.error ||
        (signal ? `CLI stopped (${signal})` : `CLI exited with code ${code ?? "unknown"}`),
    });
    run.updatedAt = Date.now();
  });
}

export function startLabRun(
  {
    cartridgeId,
    student = "cloud",
    maxTurns = 24,
    allowFake = false,
    baseUrl = `http://127.0.0.1:${process.env.PORT || 8787}`,
  },
  options = {},
) {
  const runId = new Date().toISOString().replaceAll(":", "-");
  const outDir = path.join(REPO_ROOT, ".qa-runs/loop-persona", runId);
  const run = {
    runId,
    cartridgeId,
    student,
    maxTurns,
    allowFake,
    baseUrl: baseUrl.replace(/\/$/, ""),
    outDir,
    status: "preflight",
    cancelRequested: false,
    child: null,
    updatedAt: Date.now(),
  };
  runs.set(runId, run);

  writeLabProgress(outDir, {
    status: "preflight",
    busy: true,
    busyLabel: "preflight",
    error: null,
    log: null,
  });

  spawnLabCli(run, options);
  return runId;
}
