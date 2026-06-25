import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";

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

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function runVerifier(baseUrl) {
  const child = spawn(process.execPath, ["scripts/verify-loop-gemini.mjs"], {
    env: { ...process.env, SOCRATINK_LOOP_BASE_URL: baseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const timeout = setTimeout(() => child.kill("SIGTERM"), 5000);
  const code = await new Promise((resolve) => {
    child.on("exit", resolve);
  });
  clearTimeout(timeout);
  return { code, stdout, stderr };
}

test("verify-loop-gemini passes when health and turn metadata prove a live provider", async () => {
  let turnCount = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      json(response, 200, { fake_llm: false, gemini_configured: true });
      return;
    }
    if (request.url === "/api/session" && request.method === "POST") {
      json(response, 200, { sessionId: "session-1" });
      return;
    }
    if (request.url === "/api/session/session-1/turn" && request.method === "POST") {
      turnCount += 1;
      json(response, 200, {
        llm: turnCount >= 3 ? { provider: "gemini", latency_ms: 80 } : null,
        transcript: [{ text: "[Route LLM] provider=gemini" }],
      });
      return;
    }
    json(response, 404, { error: "not_found" });
  });
  const baseUrl = await listen(server);

  try {
    const result = await runVerifier(baseUrl);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /OK: live Gemini path confirmed/);
    assert.equal(turnCount, 4);
  } finally {
    await close(server);
  }
});

test("verify-loop-gemini fails when the loop server is in fake mode", async () => {
  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      json(response, 200, { fake_llm: true, gemini_configured: true });
      return;
    }
    json(response, 404, { error: "unexpected" });
  });
  const baseUrl = await listen(server);

  try {
    const result = await runVerifier(baseUrl);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /server is in fake mode/);
  } finally {
    await close(server);
  }
});
