import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  isFeedbackCommand,
  isMetaCommand,
  isMetaCommandToken,
  parseFeedbackMessage,
} from "../../lib/seda/prompt-commands.mjs";
import { formatFeedbackBody } from "../../lib/feedback/send.mjs";

test("feedback command detection and parsing", () => {
  assert.equal(isFeedbackCommand("/feedback"), true);
  assert.equal(isFeedbackCommand("/feedback/"), true);
  assert.equal(isFeedbackCommand("/feedback map was confusing"), true);
  assert.equal(isFeedbackCommand("/help"), false);

  assert.equal(parseFeedbackMessage("/feedback"), null);
  assert.equal(
    parseFeedbackMessage("/feedback map was confusing"),
    "map was confusing",
  );
});

test("meta command is distinct from feedback", () => {
  assert.equal(isMetaCommand("/meta", { env: {} }), false);
  assert.equal(
    isMetaCommand("/meta", { env: { SOCRATINK_TUI_META_COMMAND: "1" } }),
    true,
  );
  assert.equal(
    isMetaCommand("/meta/", { env: { SOCRATINK_TUI_META_COMMAND: "1" } }),
    true,
  );
  assert.equal(isMetaCommandToken("/meta"), true);
  assert.equal(isMetaCommand("/meta weak"), false);
  assert.equal(isFeedbackCommand("/meta"), false);
});

test("feedback body includes session meta", () => {
  const body = formatFeedbackBody("great UX", {
    phase: "cold_attempt",
    concept: "AI",
    sessionId: "abc",
    eventTypes: ["launch_attempt", "route_generated"],
  });
  assert.match(body, /great UX/);
  assert.match(body, /cold_attempt/);
  assert.match(body, /route_generated/);
});

test("feedback webhook posts payload with secret", async () => {
  let seenUrl = null;
  let seenPayload = null;
  const server = http.createServer((req, res) => {
    seenUrl = req.url;
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      seenPayload = JSON.parse(raw);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const baseUrl = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${addr.port}/feedback`);
    });
  });
  const previous = {
    url: process.env.SOCRATINK_FEEDBACK_WEBHOOK_URL,
    secret: process.env.SOCRATINK_FEEDBACK_SECRET,
  };
  try {
    process.env.SOCRATINK_FEEDBACK_WEBHOOK_URL = baseUrl;
    process.env.SOCRATINK_FEEDBACK_SECRET = "test-secret";
    const { sendFeedback } = await import(
      `../../lib/feedback/send.mjs?feedbackWebhook=${Date.now()}`
    );
    const result = await sendFeedback({
      message: "map was confusing",
      meta: { phase: "cold_attempt", concept: "AI", sessionId: "s1" },
    });
    assert.deepEqual(result, { ok: true });
    assert.match(seenUrl, /secret=test-secret/);
    assert.equal(seenPayload.message, "map was confusing");
    assert.equal(seenPayload.secret, "test-secret");
    assert.match(seenPayload.subject, /AI/);
    assert.match(seenPayload.body, /session: s1/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if (previous.url === undefined) delete process.env.SOCRATINK_FEEDBACK_WEBHOOK_URL;
    else process.env.SOCRATINK_FEEDBACK_WEBHOOK_URL = previous.url;
    if (previous.secret === undefined) delete process.env.SOCRATINK_FEEDBACK_SECRET;
    else process.env.SOCRATINK_FEEDBACK_SECRET = previous.secret;
  }
});
