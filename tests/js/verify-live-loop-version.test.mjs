import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/verify-live-loop-version.mjs");

function listen(body) {
  const server = http.createServer((req, res) => {
    assert.equal(req.url, "/health");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/health` });
    });
  });
}

function runVerifier(url, expected) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      cwd: ROOT,
      env: {
        ...process.env,
        APP_LOOP_HEALTH_URL: url,
        LOOP_EXPECTED_VERSION: expected,
        LOOP_VERSION_VERIFY_ATTEMPTS: "1",
        LOOP_VERSION_VERIFY_DELAY_MS: "1",
        RAILWAY_LOOP_HEALTH_URL: "",
      },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output }));
  });
}

test("verify-live-loop-version accepts matching app_version", async () => {
  const { server, url } = await listen({ app_version: "v0.40" });
  try {
    const result = await runVerifier(url, "v0.40");
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /app ok: v0\.40/);
  } finally {
    server.close();
  }
});

test("verify-live-loop-version rejects mismatched app_version", async () => {
  const { server, url } = await listen({ app_version: "v0.39" });
  try {
    const result = await runVerifier(url, "v0.40");
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /expected v0\.40 but got v0\.39/);
  } finally {
    server.close();
  }
});

test("verify-live-loop-version rejects missing app_version", async () => {
  const { server, url } = await listen({ ok: true });
  try {
    const result = await runVerifier(url, "v0.40");
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /missing app_version/);
  } finally {
    server.close();
  }
});
