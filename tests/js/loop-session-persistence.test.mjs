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

async function postTurn(baseUrl, sessionId, text) {
  const response = await fetch(`${baseUrl}/api/session/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(text === undefined ? {} : { text }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function makeServer(root) {
  process.env.SOCRATINK_TUI_FAKE_LLM = "1";
  process.env.SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION = "shallow";
  const { createLoopServerWithStore } = await import(
    "../../lib/loop-server/http-server.mjs"
  );
  const server = createLoopServerWithStore({
    sessionStore: createFileSessionStore({ rootDir: root }),
  });
  return { server, baseUrl: await listen(server) };
}

test("hosted session resumes after fresh server boundary from event journal", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "socratink-restart-"));

  const first = await makeServer(root);
  let sessionId;
  let preRestart;
  try {
    const create = await fetch(`${first.baseUrl}/api/session`, { method: "POST" });
    assert.equal(create.status, 201);
    sessionId = (await create.json()).sessionId;
    await postTurn(first.baseUrl, sessionId, "Caching");
    await postTurn(
      first.baseUrl,
      sessionId,
      "Explain why caching makes repeat requests faster",
    );
    preRestart = await postTurn(
      first.baseUrl,
      sessionId,
      "Caching stores earlier work so a matching request can reuse it.",
    );
    assert.equal(preRestart.phase, "cold_attempt");
    assert.equal(preRestart.awaiting?.key, "cold_attempt");
    assert.ok(preRestart.events.some((event) => event.type === "route_generated"));
    t.diagnostic(
      `restart-proof pre phase=${preRestart.phase} events=${preRestart.events.length}`,
    );
  } finally {
    await close(first.server);
  }

  const metadataPath = path.join(root, sessionId, "metadata.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  metadata.transcript_tail = [];
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  const second = await makeServer(root);
  try {
    const get = await fetch(`${second.baseUrl}/api/session/${sessionId}`);
    assert.equal(get.status, 200);
    const loaded = await get.json();
    assert.equal(loaded.phase, "cold_attempt");
    assert.equal(loaded.awaiting?.key, "cold_attempt");
    assert.equal(loaded.transcript.length, 0);
    assert.equal(loaded.events.length, preRestart.events.length);

    const continued = await postTurn(
      second.baseUrl,
      sessionId,
      "Caching improves performance by storing earlier work for faster retrieval.",
    );
    assert.equal(continued.awaiting?.key, "continue");
    assert.ok(continued.events.some((event) => event.type === "cold_attempt"));
    assert.equal(
      continued.events.filter((event) => event.type === "route_generated").length,
      1,
    );
    t.diagnostic(
      `restart-proof post phase=${continued.phase} events=${continued.events.length}`,
    );
  } finally {
    await close(second.server);
  }
});
