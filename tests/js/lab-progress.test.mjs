import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  cancelFlagPath,
  isLabCancelRequested,
  labProgressPath,
  readLabProgress,
  requestLabCancel,
  writeLabProgress,
} from "../../lib/lab/lab-progress.mjs";

test("lab progress write/read round-trip", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "lab-progress-"));
  writeLabProgress(outDir, {
    status: "running",
    busy: true,
    busyLabel: "turn 1",
    log: { turns: [{ n: 1, display: "AI" }] },
  });
  const progress = readLabProgress(outDir);
  assert.equal(progress.status, "running");
  assert.equal(progress.log.turns.length, 1);
  assert.ok(fs.existsSync(labProgressPath(outDir)));
});

test("lab progress merges partial updates", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "lab-progress-"));
  writeLabProgress(outDir, { status: "running", busy: true });
  writeLabProgress(outDir, { busyLabel: "turn 2: tutor working" });
  const progress = readLabProgress(outDir);
  assert.equal(progress.status, "running");
  assert.equal(progress.busyLabel, "turn 2: tutor working");
});

test("lab cancel flag", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "lab-cancel-"));
  assert.equal(isLabCancelRequested(outDir), false);
  requestLabCancel(outDir);
  assert.equal(isLabCancelRequested(outDir), true);
  assert.ok(fs.existsSync(cancelFlagPath(outDir)));
});
