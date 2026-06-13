import path from "node:path";
import { REPO_ROOT } from "./persona-runner.mjs";
import { runFounderBatch } from "./founder-console.mjs";
import {
  appendLabProgressToLedger,
  emptyLabEventLedger,
  projectLabBatchSnapshot,
} from "./lab-event-ledger.mjs";

const batches = new Map();

function newBatchId() {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${stamp}-${suffix}`;
}

export function resetLabBatches() {
  batches.clear();
}

export function startLabBatch({
  cartridgeId,
  runs = 1,
  tutor = "gemini",
  tutorModel = null,
  student = "cloud",
  studentModel = null,
  concept = null,
  learnerGoal = null,
  launchAttempt = null,
  maxTurns = 24,
  allowFake = false,
  baseUrl = `http://127.0.0.1:${process.env.PORT || 8787}`,
} = {}) {
  const batchId = newBatchId();
  const outRoot = path.join(REPO_ROOT, ".qa-runs/founder-console", batchId);
  const batch = {
    batchId,
    status: "running",
    busy: true,
    busyLabel: `running ${runs} loop${runs === 1 ? "" : "s"}`,
    error: null,
    cartridgeId,
    runs,
    tutor,
    tutorModel,
    student,
    studentModel,
    concept,
    learnerGoal,
    launchAttempt,
    maxTurns,
    allowFake,
    outRoot,
    batchDir: null,
    reportPath: null,
    reportJsonPath: null,
    report: null,
    eventLedger: emptyLabEventLedger(),
    latestMeaningfulEvent: null,
    monitor: {
      total: runs,
      completed: 0,
      activeRun: null,
      stage: "substrate",
      state: "queued",
      label: `queued ${runs} loop${runs === 1 ? "" : "s"}`,
    },
    updatedAt: Date.now(),
  };
  batches.set(batchId, batch);

  queueMicrotask(async () => {
    try {
      const result = await runFounderBatch({
        command: "run",
        port: Number(process.env.PORT || 8787),
        baseUrl,
        open: false,
        runs,
        cartridgeId,
        tutor,
        tutorModel,
        student,
        studentModel,
        concept,
        learnerGoal,
        launchAttempt,
        maxTurns,
        allowFake,
        outRoot,
        onProgress: (progress) => {
          const eventLedger = appendLabProgressToLedger(batch.eventLedger, progress);
          const latestMeaningfulEvent =
            eventLedger.timeline.at(-1)?.type || batch.latestMeaningfulEvent || null;
          Object.assign(batch, {
            eventLedger,
            latestMeaningfulEvent,
            monitor: { ...batch.monitor, ...progress },
            busyLabel: progress.label || batch.busyLabel,
            updatedAt: Date.now(),
          });
        },
      });
      Object.assign(batch, {
        status: "done",
        busy: false,
        busyLabel: null,
        batchDir: result.batchDir,
        reportPath: result.reportMdPath,
        reportJsonPath: result.reportJsonPath,
        report: result.report,
        monitor: {
          ...batch.monitor,
          total: runs,
          completed: runs,
          activeRun: null,
          stage: "report",
          state: "done",
          label: "report ready",
          turn: null,
          phase: null,
          latestEvent: batch.latestMeaningfulEvent,
        },
        updatedAt: Date.now(),
      });
      result.server.child?.kill?.("SIGTERM");
    } catch (err) {
      Object.assign(batch, {
        status: "error",
        busy: false,
        busyLabel: null,
        error: err instanceof Error ? err.message : String(err),
        monitor: {
          ...batch.monitor,
          activeRun: null,
          state: "error",
          label: "batch failed",
        },
        updatedAt: Date.now(),
      });
    }
  });

  return batchId;
}

export function getLabBatchSnapshot(batchId) {
  const batch = batches.get(batchId);
  if (!batch) return null;
  return projectLabBatchSnapshot({ ...batch });
}
