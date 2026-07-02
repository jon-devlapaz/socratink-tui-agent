import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

test("loop server wrapper delegates stale listener cleanup before exec", () => {
  const wrapper = readFileSync(new URL("../../socratink-loop-server", import.meta.url), "utf8");
  const helper = readFileSync(
    new URL("../../scripts/loop-server-control.sh", import.meta.url),
    "utf8",
  );
  const syntax = spawnSync("bash", ["-n", "socratink-loop-server"], {
    cwd: new URL("../..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr);
  const helperSyntax = spawnSync("bash", ["-n", "scripts/loop-server-control.sh"], {
    cwd: new URL("../..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(helperSyntax.status, 0, helperSyntax.stderr);
  assert.match(wrapper, /export PORT="\$\{PORT:-8787\}"/);
  assert.match(wrapper, /source "\$REPO_ROOT\/scripts\/loop-server-control\.sh"/);
  assert.match(wrapper, /socratink_stop_loop_server_port "\$PORT" "socratink-loop-server"/);
  assert.match(wrapper, /exec node --no-warnings loop-server\.mjs/);
  assert.match(helper, /socratink_stop_loop_server_port\(\)/);
  assert.match(helper, /socratink_wait_loop_server_health\(\)/);
});

test(".env.example lists operator-facing advanced knobs", () => {
  const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
  for (const key of [
    "LLM_REQUEST_TIMEOUT_SECONDS",
    "SOCRATINK_LOOP_SESSION_STORE_DIR",
    "SOCRATINK_BRIDGE_TIMEOUT_MS",
    "SOCRATINK_TUI_META_COMMAND",
    "SOCRATINK_PERSONA_PYTHON",
    "PERSONA_LLM_TARGET",
    "PERSONA_GEMINI_MODEL",
    "SOCRATINK_LOOP_QA_OUT",
  ]) {
    assert.match(envExample, new RegExp(`(^|\\n)#? ?${key}=`), `${key} missing`);
  }
});
