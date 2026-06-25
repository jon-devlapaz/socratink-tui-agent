import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("ab live experiment dry-run writes manifest and report", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "ab-live-dry-run-"));
  const result = spawnSync(
    "node",
    [
      "scripts/ab-live-experiment.mjs",
      "--dry-run",
      "--variant-b",
      ".",
      "--fixtures",
      "fixtures/source_less_script.json",
      "--out",
      outDir,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\(dry run\)/);

  const manifest = JSON.parse(readFileSync(path.join(outDir, "manifest.json"), "utf8"));
  assert.equal(manifest.dry_run, true);
  assert.deepEqual(manifest.fixtures, ["fixtures/source_less_script.json"]);
  assert.equal(manifest.runs.length, 2);

  const report = JSON.parse(readFileSync(path.join(outDir, "report.json"), "utf8"));
  assert.deepEqual(report.summaries, []);
  assert.ok(report.prompt_versions.a.evaluator);
  assert.ok(report.prompt_versions.b.evaluator);
});
