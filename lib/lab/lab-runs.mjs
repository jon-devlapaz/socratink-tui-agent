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
const TERMINAL_STATUSES = new Set(["done", "error", "cancelled"]);

const runs = new Map();

function personaReportPath(outDir) {
  return path.join(outDir, "persona-run.json");
}

function outDirForRunId(runId) {
  return path.join(REPO_ROOT, ".qa-runs/loop-persona", runId);
}

function snapshotFromProgress(runId, outDir, progress, runMeta = {}) {
  const status = progress.status || runMeta.status || "running";
  return {
    runId,
    status,
    busy: progress.busy ?? false,
    busyLabel: progress.busyLabel ?? null,
    error: progress.error || null,
    outDir,
    reportPath: progress.reportPath || personaReportPath(outDir),
    brains: progress.brains || progress.log?.brains || null,
    cartridgeId: runMeta.cartridgeId ?? progress.log?.cartridge_id ?? null,
    student: runMeta.student ?? null,
    allowFake: runMeta.allowFake ?? false,
    log: progress.log || null,
    updatedAt: progress.updatedAt || runMeta.updatedAt || Date.now(),
  };
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
  if (progress && TERMINAL_STATUSES.has(progress.status)) {
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
  return snapshotFromProgress(run.runId, run.outDir, progress, {
    status: run.status,
    cartridgeId: run.cartridgeId,
    student: run.student,
    allowFake: run.allowFake,
    updatedAt: run.updatedAt,
  });
}

function snapshotFromDisk(runId) {
  const outDir = outDirForRunId(runId);
  if (!fs.existsSync(labProgressPath(outDir))) return null;
  const progress = readLabProgress(outDir);
  if (!progress) return null;
  return snapshotFromProgress(runId, outDir, progress);
}

export function getLabRunSnapshot(runId) {
  const run = runs.get(runId);
  if (!run) return snapshotFromDisk(runId);

  const snapshot = snapshotRun(run);
  if (TERMINAL_STATUSES.has(snapshot.status)) {
    runs.delete(runId);
  }
  return snapshot;
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
    if (progress && TERMINAL_STATUSES.has(progress.status)) {
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
  const outDir = outDirForRunId(runId);
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
