import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";

import { resolveTuiPaths, preflightTuiPaths } from "../../lib/config/paths.mjs";

test("preflight passes for the vendored standalone layout", () => {
  // Vendored canon + bridge must exist in-repo. Override `python` with the
  // running node binary so this unit test does not require .venv; CI and
  // ./scripts/run-js-unit-tests.sh bootstrap .venv before loop-server tests.
  const paths = { ...resolveTuiPaths(), python: process.execPath };
  assert.doesNotThrow(() => preflightTuiPaths(paths));
});

test("preflight throws an actionable error when the vendor seam is missing", () => {
  const paths = {
    vendorPythonRoot: "/nonexistent/vendor/python",
    python: "/nonexistent/.venv/bin/python",
    bridgePath: "/nonexistent/bridge.py",
    trainingStorePath: "/nonexistent/lib/canon/training-store.js",
    trainingDerivePath: "/nonexistent/lib/canon/training-derive.js",
  };
  assert.throws(
    () => preflightTuiPaths(paths),
    (err) => {
      assert.match(err.message, /preflight failed/);
      assert.match(err.message, /vendored Python seam not found/);
      assert.match(err.message, /sync-canon-from-app/);
      return true;
    },
  );
});

test("preflight reports every missing dependency at once", () => {
  const paths = {
    vendorPythonRoot: "/nonexistent/v",
    python: "/nonexistent/p",
    bridgePath: "/nonexistent/b.py",
    trainingStorePath: "/nonexistent/t.js",
    trainingDerivePath: "/nonexistent/d.js",
  };
  try {
    preflightTuiPaths(paths);
    assert.fail("expected preflight to throw");
  } catch (err) {
    const bullets = err.message.split("\n").filter((l) => l.includes("- "));
    assert.equal(bullets.length, 5);
  }
});
