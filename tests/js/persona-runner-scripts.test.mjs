import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("persona runners delegate to shared persona-runner module", () => {
  for (const path of [
    "scripts/loop-persona-live.mjs",
    "scripts/run-substrate-persona-matrix.mjs",
  ]) {
    const text = readFileSync(path, "utf8");
    assert.match(text, /persona-runner\.mjs/);
    assert.match(text, /runPersonaSession/);
    assert.match(text, /preflightPersonaRun/);
  }
});

test("loop persona live CLI handles help and unknown arguments before preflight", () => {
  const help = spawnSync("node", ["scripts/loop-persona-live.mjs", "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: node scripts\/loop-persona-live\.mjs/);
  assert.match(help.stdout, /canonical single-run path/);
  assert.match(help.stdout, /Founder Lab batches/);

  const unknown = spawnSync("node", ["scripts/loop-persona-live.mjs", "--bogus"], {
    encoding: "utf8",
  });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown argument: --bogus/);
});

test("substrate persona matrix CLI handles help and unknown arguments before preflight", () => {
  const help = spawnSync("node", ["scripts/run-substrate-persona-matrix.mjs", "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: node scripts\/run-substrate-persona-matrix\.mjs/);
  assert.match(help.stdout, /compare substrate-gate behavior across learner profiles/);
  assert.match(help.stdout, /loop-persona-live\.mjs/);

  const unknown = spawnSync("node", ["scripts/run-substrate-persona-matrix.mjs", "--bogus"], {
    encoding: "utf8",
  });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown argument: --bogus/);
});
