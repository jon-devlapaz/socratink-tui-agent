import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchJsonWithRetry,
  isTransientFetchError,
} from "../../lib/lab/persona-runner.mjs";

test("isTransientFetchError matches loop-server blocking blips", () => {
  assert.equal(isTransientFetchError(new TypeError("fetch failed")), true);
  assert.equal(
    isTransientFetchError(
      Object.assign(new TypeError("fetch failed"), {
        cause: { code: "ECONNREFUSED" },
      }),
    ),
    true,
  );
  assert.equal(isTransientFetchError(new Error("HTTP 500")), false);
  assert.equal(
    isTransientFetchError(new Error("request timed out after 300000ms: /turn")),
    false,
  );
});

test("fetchJsonWithRetry retries transient errors then succeeds", async () => {
  const originalFetch = globalThis.fetch;
  const attempts = [];
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) throw new TypeError("fetch failed");
    return {
      ok: true,
      json: async () => ({ ok: true, calls }),
    };
  };

  try {
    const result = await fetchJsonWithRetry(
      "http://127.0.0.1:8787/api/session/x/turn",
      { method: "POST" },
      {
        maxAttempts: 4,
        retryDelayMs: 0,
        sleep: async () => {},
        onRetry: ({ attempt }) => attempts.push(attempt),
      },
    );
    assert.equal(calls, 3);
    assert.deepEqual(attempts, [1, 2]);
    assert.equal(result.ok, true);
    assert.equal(result.calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchJsonWithRetry does not retry non-transient HTTP errors", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: async () => ({ error: "bad turn" }),
    };
  };

  try {
    await assert.rejects(
      () =>
        fetchJsonWithRetry("http://127.0.0.1:8787/health", {}, {
          maxAttempts: 5,
          retryDelayMs: 0,
          sleep: async () => {},
        }),
      /bad turn/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
