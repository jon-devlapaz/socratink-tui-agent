import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { EventEmitter } from "node:events";

import {
  cancelLabRun,
  getLabRunSnapshot,
  resetLabRuns,
  startLabRun,
} from "../../lib/lab/lab-runs.mjs";
import { writeLabProgress } from "../../lib/lab/lab-progress.mjs";

function mockSpawnChild() {
  return (execPath, args, _options) => {
    const outIdx = args.indexOf("--out");
    const outDir = args[outIdx + 1];
    const child = new EventEmitter();
    child.killed = false;
    child.kill = (signal) => {
      child.killed = true;
      child.emit("exit", signal === "SIGTERM" ? null : 1, signal);
    };
    queueMicrotask(() => {
      writeLabProgress(outDir, {
        status: "running",
        busy: true,
        busyLabel: "turn 1: scripted input (idle)",
        brains: "tutor=sandbox student=cloud allow_fake=true",
        log: {
          brains: "tutor=sandbox student=cloud allow_fake=true",
          turns: [{ n: 1, display: "AI", transcript_delta: [{ text: "[Route]" }] }],
        },
      });
    });
    child.spawnArgs = { execPath, args, outDir };
    return child;
  };
}

test("startLabRun spawns CLI and reads progress from disk", async () => {
  resetLabRuns();
  const spawnChild = mockSpawnChild();
  const runId = startLabRun(
    {
      cartridgeId: "jordan-ai",
      student: "cloud",
      allowFake: true,
      baseUrl: "http://127.0.0.1:8787",
    },
    { spawnChild },
  );

  assert.ok(runId);
  await new Promise((r) => setTimeout(r, 10));
  const snap = getLabRunSnapshot(runId);
  assert.equal(snap.status, "running");
  assert.equal(snap.log.turns.length, 1);
  assert.equal(snap.outDir.endsWith(runId), true);
  resetLabRuns();
});

test("cancelLabRun writes cancel flag and kills CLI child", async () => {
  resetLabRuns();
  const spawnChild = mockSpawnChild();
  const runId = startLabRun(
    { cartridgeId: "jordan-ai", student: "cloud", allowFake: true },
    { spawnChild },
  );

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cancelLabRun(runId), true);

  const snap = getLabRunSnapshot(runId);
  assert.ok(fs.existsSync(`${snap.outDir}/.cancel`));
  resetLabRuns();
});
