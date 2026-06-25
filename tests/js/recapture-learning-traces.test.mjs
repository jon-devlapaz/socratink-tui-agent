import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

const CASES_PATH = "learning_cases/cases.jsonl";
const CAPTURE_TMP = path.join("learning_cases", "traces", ".capture-tmp");

test("recapture learning traces dry-run reports all captures without rewriting cases", () => {
  const before = readFileSync(CASES_PATH, "utf8");
  const result = spawnSync("node", ["scripts/recapture-learning-traces.mjs", "--dry-run"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 120_000,
  });

  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(CASES_PATH, "utf8"), before);
    assert.equal((result.stdout.match(/^=== /gm) || []).length, 8);
    assert.match(result.stdout, /evidence-hold-solid-spaced-primed-2026-05-26/);
    assert.match(result.stdout, /correlation-edge-substantive-cold-2026-05-28/);
  } finally {
    rmSync(CAPTURE_TMP, { recursive: true, force: true });
  }
});
