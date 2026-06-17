import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "./persona-runner.mjs";
import {
  labProgressPath,
  readLabProgress,
  requestLabCancel,
  writeLabProgress,
} from "./lab-progress.mjs";
import {
  dialogueFromReport,
  dialogueFromRunLog,
  emptyLabDialogue,
} from "./lab-dialogue.mjs";

const CLI_SCRIPT = path.join(REPO_ROOT, "scripts/loop-persona-live.mjs");
const TERMINAL_STATUSES = new Set(["done", "error", "cancelled"]);
const QA_RUNS_DIR = path.join(REPO_ROOT, ".qa-runs");

const runs = new Map();

function personaReportPath(outDir) {
  return path.join(outDir, "persona-run.json");
}

function outDirForRunId(runId) {
  return path.join(REPO_ROOT, ".qa-runs/loop-persona", runId);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function fileMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function dirs(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

function compactPath(filePath) {
  const rel = path.relative(REPO_ROOT, filePath);
  if (!rel.startsWith("..")) return rel;
  const homeRel = path.relative(os.homedir(), filePath);
  return homeRel.startsWith("..") ? filePath : `~/${homeRel}`;
}

function dialogueIdFor(root, outDir) {
  return Buffer.from(path.relative(root, outDir)).toString("base64url");
}

function resolveDialogueDir(root, dialogueId) {
  try {
    const rel = Buffer.from(String(dialogueId || ""), "base64url").toString("utf8");
    const outDir = path.resolve(root, rel);
    const rootDir = path.resolve(root);
    if (outDir !== rootDir && !outDir.startsWith(`${rootDir}${path.sep}`)) return null;
    return outDir;
  } catch {
    return null;
  }
}

function personaSummaryFromDir(outDir, source = "persona", root = QA_RUNS_DIR) {
  const reportPath = path.join(outDir, "persona-run.json");
  const progressPath = labProgressPath(outDir);
  const report = readJson(reportPath);
  const progress = readJson(progressPath);
  if (!report && !progress) return null;
  const lastTurn = report?.turns?.at?.(-1);
  const final = report?.final || progress?.log?.final || lastTurn || {};
  const status = progress?.status || (final.case_complete ? "done" : final.status || "unknown");
  const updatedAt = Math.max(fileMtime(reportPath), fileMtime(progressPath));
  return {
    id: path.basename(outDir),
    source,
    status,
    updatedAt,
    updatedAtIso: updatedAt ? new Date(updatedAt).toISOString() : null,
    label: report?.label || report?.cartridge_id || progress?.cartridge_id || path.basename(outDir),
    cartridgeId: report?.cartridge_id || progress?.cartridge_id || null,
    concept: report?.concept || null,
    learnerGoal: report?.learner_goal || null,
    runs: 1,
    evidence: final.graph_badge || final.evidence_status || null,
    reportPath: fs.existsSync(reportPath) ? compactPath(reportPath) : null,
    outDir: compactPath(outDir),
    dialogueId: dialogueIdFor(root, outDir),
  };
}

function founderBatchSummary(batchDir, rootDir, root = QA_RUNS_DIR) {
  const reportPath = path.join(batchDir, "founder-report.json");
  const report = readJson(reportPath);
  if (!report) return null;
  const firstRunDir = report.runs?.[0]?.out_dir || report.signatures?.[0]?.out_dir || null;
  const persona = firstRunDir ? readJson(path.join(firstRunDir, "persona-run.json")) : null;
  const updatedAt = fileMtime(reportPath);
  const id =
    path.resolve(rootDir) === path.resolve(batchDir)
      ? path.basename(batchDir)
      : `${path.basename(rootDir)}/${path.basename(batchDir)}`;
  return {
    id,
    source: "founder-batch",
    status: "done",
    updatedAt,
    updatedAtIso: updatedAt ? new Date(updatedAt).toISOString() : null,
    label: persona?.label || persona?.cartridge_id || "Founder batch",
    cartridgeId: persona?.cartridge_id || null,
    concept: persona?.concept || null,
    learnerGoal: persona?.learner_goal || null,
    runs: report.run_count || report.runs?.length || 0,
    evidence: report.evidence_status || null,
    recommendation: report.recommendation || null,
    reportPath: compactPath(reportPath),
    outDir: compactPath(batchDir),
    dialogueId: dialogueIdFor(root, batchDir),
  };
}

function tuiSummaryFromDir(outDir, root = QA_RUNS_DIR) {
  const sessionPath = path.join(outDir, "session.json");
  const session = readJson(sessionPath);
  if (!session) return null;
  const events = Array.isArray(session.events) ? session.events : [];
  const latest = events.at(-1);
  const updatedAt = fileMtime(sessionPath);
  return {
    id: path.basename(outDir),
    source: "tui",
    status: latest?.type === "idle_exit" ? "done" : "captured",
    updatedAt,
    updatedAtIso: updatedAt ? new Date(updatedAt).toISOString() : null,
    label: session.concept || session.ctx?.concept || path.basename(outDir),
    cartridgeId: null,
    concept: session.concept || session.ctx?.concept || null,
    learnerGoal: session.learner_goal || session.ctx?.learner_goal || null,
    runs: 1,
    evidence: latest?.type || null,
    reportPath: compactPath(sessionPath),
    outDir: compactPath(outDir),
    dialogueId: dialogueIdFor(root, outDir),
  };
}

export function listLabRuns({ root = QA_RUNS_DIR, limit = 50 } = {}) {
  const rows = [];
  const founderRoots = dirs(root).filter((dir) =>
    path.basename(dir).startsWith("founder-console"),
  );
  for (const rootDir of founderRoots) {
    const direct = founderBatchSummary(rootDir, rootDir, root);
    if (direct) rows.push(direct);
    for (const batchDir of dirs(rootDir)) {
      const summary = founderBatchSummary(batchDir, rootDir, root);
      if (summary) rows.push(summary);
      for (const nestedBatchDir of dirs(batchDir)) {
        const nestedSummary = founderBatchSummary(nestedBatchDir, batchDir, root);
        if (nestedSummary) rows.push(nestedSummary);
      }
    }
  }

  const personaRoot = path.join(root, "loop-persona");
  for (const outDir of dirs(personaRoot)) {
    const summary = personaSummaryFromDir(outDir, "persona", root);
    if (summary) rows.push(summary);
  }

  const tuiRoot = path.join(root, "socratink-tui");
  for (const outDir of dirs(tuiRoot)) {
    const summary = tuiSummaryFromDir(outDir, root);
    if (summary) rows.push(summary);
  }

  return rows
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limit);
}

export function getLabRunDialogue(dialogueId, { root = QA_RUNS_DIR } = {}) {
  const outDir = resolveDialogueDir(root, dialogueId);
  if (!outDir) return null;

  const founderReport = readJson(path.join(outDir, "founder-report.json"));
  if (founderReport) {
    return {
      id: dialogueId,
      source: "founder-batch",
      outDir: compactPath(outDir),
      dialogue: dialogueFromReport(founderReport),
    };
  }

  const persona = readJson(path.join(outDir, "persona-run.json"));
  if (persona) {
    return {
      id: dialogueId,
      source: "persona",
      outDir: compactPath(outDir),
      dialogue: {
        ...emptyLabDialogue(),
        runs: [dialogueFromRunLog({ index: 1, outDir: compactPath(outDir), log: persona })],
      },
    };
  }

  const progress = readJson(labProgressPath(outDir));
  if (progress?.log) {
    return {
      id: dialogueId,
      source: "persona-progress",
      outDir: compactPath(outDir),
      dialogue: {
        ...emptyLabDialogue(),
        runs: [dialogueFromRunLog({ index: 1, outDir: compactPath(outDir), log: progress.log })],
      },
    };
  }

  const session = readJson(path.join(outDir, "session.json"));
  if (session) {
    return {
      id: dialogueId,
      source: "tui",
      outDir: compactPath(outDir),
      dialogue: emptyLabDialogue(),
    };
  }

  return null;
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
