import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createFileSessionStore,
  SessionStoreError,
} from "../../lib/loop-server/session-store.mjs";

function uuid(suffix = "0001") {
  return `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
}

async function tempStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "socratink-store-test-"));
  return { root, store: createFileSessionStore({ rootDir: root }) };
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

test("file session store creates metadata and append-only event journal", async () => {
  const { root, store } = await tempStore();
  const sessionId = uuid("1");

  await store.create(sessionId, { status: "awaiting_input", phase: "ignition" });
  await store.appendEvents(
    sessionId,
    [{ type: "launch_attempt", text: "rough" }],
    { status: "awaiting_input", phase: "substrate_gate" },
  );
  await store.appendEvents(sessionId, [], {
    status: "awaiting_input",
    phase: "substrate_gate",
  });

  const loaded = await store.load(sessionId);
  assert.equal(loaded.metadata.session_id, sessionId);
  assert.equal(loaded.metadata.event_count, 1);
  assert.deepEqual(loaded.events, [{ type: "launch_attempt", text: "rough" }]);

  const files = await fs.readdir(path.join(root, sessionId));
  assert.deepEqual(files.sort(), ["events.jsonl", "metadata.json"]);
});

test("file session store rejects malformed ids and missing sessions", async () => {
  const { store } = await tempStore();

  await assert.rejects(() => store.load("../escape"), (error) => {
    assert.ok(error instanceof SessionStoreError);
    assert.equal(error.code, "InvalidSessionId");
    return true;
  });

  await assert.rejects(() => store.load(uuid("404")), (error) => {
    assert.ok(error instanceof SessionStoreError);
    assert.equal(error.code, "SessionNotFound");
    return true;
  });
});

test("HTTP session API persists create, load, and turn through store", async () => {
  process.env.SOCRATINK_TUI_FAKE_LLM = "1";
  process.env.SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION = "shallow";
  const { store } = await tempStore();
  const { createLoopServerWithStore } = await import(
    "../../lib/loop-server/http-server.mjs"
  );
  const server = createLoopServerWithStore({ sessionStore: store });
  const baseUrl = await listen(server);
  try {
    const create = await fetch(`${baseUrl}/api/session`, { method: "POST" });
    assert.equal(create.status, 201);
    const created = await create.json();
    assertSessionResponseShape(created);
    assert.equal(created.awaiting.key, "cmd");

    let stored = await store.load(created.sessionId);
    assert.equal(stored.events.length, 0);

    const conceptTurn = await postTurn(baseUrl, created.sessionId, "Immune memory");
    assert.equal(conceptTurn.awaiting.key, "learner_goal");
    const goalTurn = await postTurn(baseUrl, created.sessionId, "Explain why vaccines work");
    assert.ok(
      goalTurn.events.some((event) => event.type === "learner_goal_set"),
    );
    const launchTurn = await postTurn(
      baseUrl,
      created.sessionId,
      "Vaccines give a safe preview so memory cells respond faster later.",
    );
    assertSessionResponseShape(launchTurn);
    assert.equal(launchTurn.phase, "cold_attempt");
    assert.ok(launchTurn.events.some((event) => event.type === "launch_attempt"));
    assert.ok(launchTurn.events.some((event) => event.type === "route_generated"));

    stored = await store.load(created.sessionId);
    const storedCount = stored.events.length;
    assert.equal(storedCount, launchTurn.events.length);

    const get = await fetch(`${baseUrl}/api/session/${created.sessionId}`);
    assert.equal(get.status, 200);
    const loaded = await get.json();
    assertSessionResponseShape(loaded);
    assert.equal(loaded.events.length, storedCount);
    assert.equal(loaded.phase, "cold_attempt");

    const getAgain = await fetch(`${baseUrl}/api/session/${created.sessionId}`);
    assert.equal(getAgain.status, 200);
    assert.equal((await store.load(created.sessionId)).events.length, storedCount);

    const invalid = await fetch(`${baseUrl}/api/session/not-a-session`);
    assert.equal(invalid.status, 400);
    const missing = await fetch(`${baseUrl}/api/session/${uuid("404")}`);
    assert.equal(missing.status, 404);
  } finally {
    await close(server);
  }
});

test("HTTP session API maps incomplete journals to explicit resume failure", async () => {
  const { store } = await tempStore();
  const sessionId = uuid("500");
  await store.create(sessionId, {
    status: "awaiting_input",
    phase: "cold_attempt",
  });
  await store.appendEvents(
    sessionId,
    [
      {
        type: "launch_attempt",
        concept: "Caching",
        concept_id: "caching",
        learner_goal: "Explain cache hits",
        text: "Caching keeps prior work.",
      },
      {
        type: "route_generated",
        substrate_adequacy: "adequate",
      },
    ],
    {
      status: "awaiting_input",
      phase: "cold_attempt",
      awaiting: { key: "cold_attempt" },
    },
  );

  const { createLoopServerWithStore } = await import(
    "../../lib/loop-server/http-server.mjs"
  );
  const server = createLoopServerWithStore({ sessionStore: store });
  const baseUrl = await listen(server);
  try {
    const get = await fetch(`${baseUrl}/api/session/${sessionId}`);
    assert.equal(get.status, 409);
    assert.deepEqual(await get.json(), {
      error: "session_resume_failed",
      code: "CannotRehydrateSession",
      message:
        "Persisted session cannot be resumed because required persisted facts are missing.",
      reason:
        "route_generated missing required persisted field(s): first_node, node_ids, provisional_map, map_displayed, retry_count, retry_reasons",
      details: {
        event_type: "route_generated",
        missing: [
          "first_node",
          "node_ids",
          "provisional_map",
          "map_displayed",
          "retry_count",
          "retry_reasons",
        ],
      },
    });

    const turn = await fetch(`${baseUrl}/api/session/${sessionId}/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "A cache hit reuses stored work." }),
    });
    assert.equal(turn.status, 409);
    const body = await turn.json();
    assert.equal(body.error, "session_resume_failed");
    assert.equal(body.code, "CannotRehydrateSession");
    assert.match(body.reason, /route_generated missing required persisted field/);
    assert.equal((await store.load(sessionId)).events.length, 2);
  } finally {
    await close(server);
  }
});

async function postTurn(baseUrl, sessionId, text) {
  const response = await fetch(`${baseUrl}/api/session/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

function assertSessionResponseShape(body) {
  for (const key of [
    "sessionId",
    "status",
    "phase",
    "awaiting",
    "transcript",
    "events",
    "llm",
    "complete",
    "caseComplete",
  ]) {
    assert.ok(Object.hasOwn(body, key), `missing ${key}`);
  }
}
