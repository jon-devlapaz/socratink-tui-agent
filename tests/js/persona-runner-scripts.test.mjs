import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("persona runners treat continue as a transport-only turn", () => {
  for (const path of [
    "scripts/loop-persona-live.mjs",
    "scripts/run-substrate-persona-matrix.mjs",
  ]) {
    const text = readFileSync(path, "utf8");
    assert.match(text, /isContinueAwaiting/);
    assert.match(text, /transport_continue/);
    assert.match(text, /JSON\.stringify\(body\)/);
    assert.match(text, /key === "run_gap_drill"\) return "y"/);
  }
});
