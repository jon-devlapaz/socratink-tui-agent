import test from "node:test";
import assert from "node:assert/strict";
import {
  isFeedbackCommand,
  isMetaCommand,
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
  assert.equal(isMetaCommand("/meta"), true);
  assert.equal(isMetaCommand("/meta/"), true);
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
