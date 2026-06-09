import test from "node:test";
import assert from "node:assert/strict";

import {
  LOOP_APP_VERSION_DEFAULT,
} from "../../lib/loop-server/version.mjs";
import {
  applyLoopVersion,
  assertVersionsSynced,
  bumpLoopVersion,
  loopVersionToSemver,
  nextLoopVersion,
  parseLoopVersion,
  validateLoopVersion,
} from "../../scripts/bump-loop-version.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VERSION_MJS = path.join(ROOT, "lib/loop-server/version.mjs");

test("loop release files stay synced with version.mjs", () => {
  assert.equal(assertVersionsSynced(), LOOP_APP_VERSION_DEFAULT);
});

test("bump-loop-version helpers advance v0.NN labels", () => {
  const src = readFileSync(VERSION_MJS, "utf8");
  const current = parseLoopVersion(src);
  assert.equal(nextLoopVersion("v0.16"), "v0.17");
  assert.equal(loopVersionToSemver(current), `0.${current.slice(3)}.0`);
});

test("applyLoopVersion rejects invalid labels before writing", () => {
  const before = assertVersionsSynced();
  assert.throws(() => validateLoopVersion("v0.999"), /Invalid loop version label/);
  assert.throws(() => applyLoopVersion("not-a-version"), /Invalid loop version label/);
  assert.equal(assertVersionsSynced(), before);
});

test("--set applies explicit release target", (t) => {
  const before = assertVersionsSynced();
  t.after(() => {
    applyLoopVersion(before);
  });
  applyLoopVersion(nextLoopVersion(before));
  assert.equal(assertVersionsSynced(), nextLoopVersion(before));
});

test("bumpLoopVersion is idempotent when restored", (t) => {
  const before = assertVersionsSynced();
  t.after(() => {
    applyLoopVersion(before);
  });
  const { previous, next } = bumpLoopVersion();
  assert.equal(previous, before);
  assert.equal(next, nextLoopVersion(before));
  assert.equal(assertVersionsSynced(), next);
});
