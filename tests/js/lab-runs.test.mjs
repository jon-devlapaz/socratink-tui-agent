import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";

import {
  cancelLabRun,
  getLabRun,
  getLabRunDialogue,
  getLabRunSnapshot,
  listLabRuns,
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

test("getLabRunSnapshot evicts terminal run from Map but still polls from disk", async () => {
  resetLabRuns();
  const spawnChild = mockSpawnChild();
  const runId = startLabRun(
    { cartridgeId: "jordan-ai", student: "cloud", allowFake: true },
    { spawnChild },
  );

  await new Promise((r) => setTimeout(r, 10));
  const outDir = getLabRunSnapshot(runId).outDir;
  writeLabProgress(outDir, {
    status: "done",
    busy: false,
    busyLabel: null,
    brains: "tutor=sandbox student=cloud allow_fake=true",
    log: {
      brains: "tutor=sandbox student=cloud allow_fake=true",
      turns: [{ n: 1, display: "AI" }],
      final: { case_complete: true, hit_max_turns: false },
    },
  });

  const done = getLabRunSnapshot(runId);
  assert.equal(done.status, "done");
  assert.equal(getLabRun(runId), null);

  const fromDisk = getLabRunSnapshot(runId);
  assert.equal(fromDisk.status, "done");
  assert.equal(fromDisk.log.final.case_complete, true);

  resetLabRuns();
});

test("listLabRuns summarizes recent disk artifacts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "socratink-runs-"));
  try {
    const founderBatch = path.join(root, "founder-console", "batch-root", "batch-run");
    const founderRun = path.join(founderBatch, "run-001");
    fs.mkdirSync(founderRun, { recursive: true });
    fs.writeFileSync(path.join(founderRun, "persona-run.json"), JSON.stringify({
      cartridge_id: "novice-immune-memory",
      label: "Novice",
      concept: "Immune memory",
      learner_goal: "Explain vaccines.",
      turns: [
        {
          n: 1,
          phase: "cold_attempt",
          input: "Memory cells respond faster.",
          transcript_delta: [{ text: "Teacher prompt" }],
        },
      ],
    }));
    const founderReport = path.join(founderBatch, "founder-report.json");
    fs.writeFileSync(founderReport, JSON.stringify({
      run_count: 1,
      evidence_status: "caveated",
      runs: [{ out_dir: founderRun }],
    }));

    const personaDir = path.join(root, "loop-persona", "persona-run");
    fs.mkdirSync(personaDir, { recursive: true });
    fs.writeFileSync(path.join(personaDir, "persona-run.json"), JSON.stringify({
      cartridge_id: "jordan-ai",
      label: "Jordan",
      concept: "Hallucination",
      final: { case_complete: true, graph_badge: "primed" },
      turns: [],
    }));

    const tuiDir = path.join(root, "socratink-tui", "scripted-run");
    fs.mkdirSync(tuiDir, { recursive: true });
    fs.writeFileSync(path.join(tuiDir, "session.json"), JSON.stringify({
      concept: "Photosynthesis",
      events: [{ type: "cold_attempt" }, { type: "idle_exit" }],
    }));

    const base = new Date("2026-06-16T12:00:00Z");
    fs.utimesSync(founderReport, base, new Date("2026-06-16T12:03:00Z"));
    fs.utimesSync(path.join(personaDir, "persona-run.json"), base, new Date("2026-06-16T12:02:00Z"));
    fs.utimesSync(path.join(tuiDir, "session.json"), base, new Date("2026-06-16T12:01:00Z"));

    const rows = listLabRuns({ root, limit: 10 });
    assert.deepEqual(rows.map((row) => row.source), ["founder-batch", "persona", "tui"]);
    assert.equal(rows[0].runs, 1);
    assert.equal(rows[0].evidence, "caveated");
    assert.equal(rows[0].concept, "Immune memory");
    assert.equal(rows[1].status, "done");
    assert.equal(rows[2].evidence, "idle_exit");

    const dialogue = getLabRunDialogue(rows[0].dialogueId, { root });
    assert.equal(dialogue.source, "founder-batch");
    assert.equal(dialogue.dialogue.runs[0].turns[0].student, "Memory cells respond faster.");
    assert.deepEqual(dialogue.dialogue.runs[0].turns[0].lines, ["Teacher prompt"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("listLabRuns supports direct founder run folders", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "socratink-runs-"));
  try {
    const runDir = path.join(root, "founder-console-live-test", "direct-run");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, "persona-run.json"), JSON.stringify({
      cartridge_id: "jordan-ai",
      label: "Jordan",
      concept: "AI",
      learner_goal: "Explain model confidence.",
      turns: [
        {
          n: 1,
          phase: "repair_dialogue",
          input: "It follows likely patterns.",
          transcript_delta: [{ text: "[Repair Dialogue]" }],
        },
      ],
    }));
    fs.writeFileSync(path.join(runDir, "founder-report.json"), JSON.stringify({
      run_count: 1,
      evidence_status: "rejected",
      runs: [{ out_dir: runDir }],
    }));

    const rows = listLabRuns({ root, limit: 10 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "founder-console-live-test/direct-run");
    assert.equal(rows[0].source, "founder-batch");
    assert.equal(rows[0].runs, 1);
    assert.equal(rows[0].evidence, "rejected");

    const dialogue = getLabRunDialogue(rows[0].dialogueId, { root });
    assert.equal(dialogue.source, "founder-batch");
    assert.equal(dialogue.dialogue.runs[0].turns[0].student, "It follows likely patterns.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
