import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createFileSessionStore } from "../../lib/loop-server/session-store.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("loop API key protects JSON APIs without blocking health or static loop", async () => {
  process.env.SOCRATINK_LOOP_API_KEY = "test-secret";
  process.env.SOCRATINK_LAB_ENABLED = "1";
  process.env.SOCRATINK_TUI_FAKE_LLM = "1";
  process.env.SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION = "shallow";

  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "socratink-auth-test-"));
  const { createLoopServerWithStore } = await import(
    "../../lib/loop-server/http-server.mjs"
  );
  const server = createLoopServerWithStore({
    sessionStore: createFileSessionStore({ rootDir }),
  });
  const baseUrl = await listen(server);
  const bearer = { Authorization: "Bearer test-secret" };

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.status, "ok");
    assert.equal(healthBody.fake_llm, true);
    assert.equal(healthBody.llm_mode, "fake");
    assert.equal(healthBody.llm_override_allowed, false);
    assert.equal(Object.hasOwn(healthBody, "llm_options"), false);

    const loop = await fetch(`${baseUrl}/loop/`);
    assert.equal(loop.status, 200);
    assert.match(await loop.text(), /socratink/);

    const dashboard = await fetch(`${baseUrl}/dashboard/`);
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /socratink/i);

    const lab = await fetch(`${baseUrl}/lab/`);
    assert.equal(lab.status, 200);
    assert.match(await lab.text(), /founder console/);

    const dashboardDenied = await fetch(`${baseUrl}/api/dashboard`);
    assert.equal(dashboardDenied.status, 401);
    assert.deepEqual(await dashboardDenied.json(), { error: "unauthorized" });

    const sessionWrongToken = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });
    assert.equal(sessionWrongToken.status, 401);

    const dashboardAllowed = await fetch(`${baseUrl}/api/dashboard`, {
      headers: bearer,
    });
    assert.equal(dashboardAllowed.status, 200);

    const labDenied = await fetch(`${baseUrl}/api/lab/cartridges`);
    assert.equal(labDenied.status, 401);

    const labAllowed = await fetch(`${baseUrl}/api/lab/cartridges`, {
      headers: bearer,
    });
    assert.equal(labAllowed.status, 200);

    const sessionAllowed = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: bearer,
    });
    assert.equal(sessionAllowed.status, 201);
  } finally {
    await close(server);
    delete process.env.SOCRATINK_LOOP_API_KEY;
    delete process.env.SOCRATINK_LAB_ENABLED;
    delete process.env.SOCRATINK_TUI_FAKE_LLM;
    delete process.env.SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION;
  }
});
