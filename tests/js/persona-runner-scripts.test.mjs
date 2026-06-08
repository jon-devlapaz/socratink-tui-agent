import test from "node:test";
import assert from "node:assert/strict";
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
