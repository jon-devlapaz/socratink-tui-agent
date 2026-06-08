import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { isLabEnabled, isLoopbackRequest, labAccessAllowed } from "../../lib/lab/lab-access.mjs";
import { handleLabApi } from "../../lib/lab/lab-api.mjs";

function mockReq({ remoteAddress = "127.0.0.1", method = "GET", body = null } = {}) {
  const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
  return {
    method,
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function mockRes() {
  return {
    status: null,
    body: "",
    writeHead(status) {
      this.status = status;
    },
    end(payload) {
      this.body = payload || "";
    },
  };
}

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

test("lab access helpers", () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";
  assert.equal(isLabEnabled(), true);
  assert.equal(isLoopbackRequest({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(isLoopbackRequest({ socket: { remoteAddress: "10.0.0.1" } }), false);
  assert.equal(labAccessAllowed({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(labAccessAllowed({ socket: { remoteAddress: "10.0.0.1" } }), false);
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api gate returns 404 when disabled", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  delete process.env.SOCRATINK_LAB_ENABLED;
  const req = mockReq();
  const res = mockRes();
  await handleLabApi(req, res, "/api/lab/cartridges");
  assert.equal(res.status, 404);
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api gate returns 403 for non-loopback", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";
  const req = mockReq({ remoteAddress: "10.0.0.5" });
  const res = mockRes();
  await handleLabApi(req, res, "/api/lab/cartridges");
  assert.equal(res.status, 403);
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api lists cartridges when enabled", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";
  const req = mockReq();
  const res = mockRes();
  await handleLabApi(req, res, "/api/lab/cartridges");
  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.ok(Array.isArray(payload.cartridges));
  assert.ok(payload.cartridges.some((c) => c.id === "jordan-ai"));
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api run lifecycle with mocked runner", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";

  const runs = new Map();
  const runStore = {
    startLabRun({ cartridgeId, student, allowFake }) {
      const runId = "test-run-1";
      runs.set(runId, {
        runId,
        status: "running",
        busy: true,
        busyLabel: "turn 1: tutor working (route)…",
        cartridgeId,
        student,
        allowFake,
        log: {
          brains: "tutor=sandbox student=local allow_fake=true",
          turns: [
            {
              n: 1,
              display: "Immune memory",
              transcript_delta: [{ text: "[Route]" }],
            },
          ],
        },
        updatedAt: Date.now(),
      });
      setTimeout(() => {
        const run = runs.get(runId);
        run.status = "done";
        run.busy = false;
        run.log.final = { case_complete: true, hit_max_turns: false };
        run.outDir = "/tmp/fake-run";
      }, 50);
      return runId;
    },
    getLabRunSnapshot(runId) {
      const run = runs.get(runId);
      if (!run) return null;
      return {
        runId: run.runId,
        status: run.status,
        busy: run.busy,
        busyLabel: run.busyLabel,
        error: null,
        outDir: run.outDir || null,
        reportPath: null,
        brains: run.log?.brains || null,
        cartridgeId: run.cartridgeId,
        student: run.student,
        allowFake: run.allowFake,
        log: run.log,
        updatedAt: run.updatedAt,
      };
    },
    cancelLabRun(runId) {
      const run = runs.get(runId);
      if (!run || run.status === "done") return false;
      run.status = "cancelled";
      return true;
    },
  };

  const createReq = mockReq({
    method: "POST",
    body: { cartridgeId: "jordan-ai", student: "local", allowFake: true },
  });
  const createRes = mockRes();
  await handleLabApi(createReq, createRes, "/api/lab/runs", { runStore, skipGate: true });
  assert.equal(createRes.status, 201);
  const { runId } = JSON.parse(createRes.body);
  assert.equal(runId, "test-run-1");

  const pollRes = mockRes();
  await handleLabApi(mockReq(), pollRes, `/api/lab/runs/${runId}`, {
    runStore,
    skipGate: true,
  });
  assert.equal(pollRes.status, 200);
  const snapshot = JSON.parse(pollRes.body);
  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.log.turns.length, 1);

  await new Promise((r) => setTimeout(r, 80));
  const doneRes = mockRes();
  await handleLabApi(mockReq(), doneRes, `/api/lab/runs/${runId}`, {
    runStore,
    skipGate: true,
  });
  const done = JSON.parse(doneRes.body);
  assert.equal(done.status, "done");
  assert.equal(done.log.final.case_complete, true);

  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api reveal opens run folder via injected helper", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";

  let revealed = null;
  const runStore = {
    getLabRunSnapshot(runId) {
      return {
        runId,
        outDir: "/tmp/fake-persona-run",
        status: "done",
      };
    },
  };

  const res = mockRes();
  await handleLabApi(mockReq({ method: "POST" }), res, "/api/lab/runs/test-run/reveal", {
    runStore,
    skipGate: true,
    revealPathInOs: async (path) => {
      revealed = path;
    },
  });
  assert.equal(res.status, 200);
  assert.equal(revealed, "/tmp/fake-persona-run");

  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("HTTP /lab static is 404 when lab disabled", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  delete process.env.SOCRATINK_LAB_ENABLED;
  const { createLoopServerWithStore } = await import("../../lib/loop-server/http-server.mjs");
  const { createFileSessionStore } = await import("../../lib/loop-server/session-store.mjs");
  const server = createLoopServerWithStore({
    sessionStore: createFileSessionStore({ rootDir: "/tmp/unused" }),
  });
  const baseUrl = await listen(server);
  try {
    const res = await fetch(`${baseUrl}/lab`);
    assert.equal(res.status, 404);
  } finally {
    await close(server);
  }
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("HTTP /lab static loads when lab enabled on loopback", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";
  const { createLoopServerWithStore } = await import("../../lib/loop-server/http-server.mjs");
  const { createFileSessionStore } = await import("../../lib/loop-server/session-store.mjs");
  const server = createLoopServerWithStore({
    sessionStore: createFileSessionStore({ rootDir: "/tmp/unused-lab" }),
  });
  const baseUrl = await listen(server);
  try {
    const res = await fetch(`${baseUrl}/lab`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /founder lab/i);
  } finally {
    await close(server);
  }
  process.env.SOCRATINK_LAB_ENABLED = prev;
});
