import test from "node:test";
import assert from "node:assert/strict";

import { createHttpPrompt } from "../../lib/loop-server/http-prompt.mjs";
import { PROMPT_REQUIRED } from "../../lib/loop-server/errors.mjs";

test("HTTP prompt treats disabled /meta as reserved and requests input again", async () => {
  const session = { pendingInput: "/meta", events: [] };
  const prompt = createHttpPrompt({
    cache: new Map(),
    askCounts: new Map(),
    session,
    env: {},
  });

  await assert.rejects(
    () => prompt.ask("cold_attempt", "Cold attempt: "),
    (error) => {
      assert.equal(error.code, PROMPT_REQUIRED);
      assert.equal(error.promptMeta.metaDisabled, true);
      assert.equal(error.promptMeta.metaShown, undefined);
      return true;
    },
  );
  assert.deepEqual(session.events, []);
});

test("HTTP prompt appends graph-neutral meta turn only when flag is enabled", async () => {
  const session = { pendingInput: "/meta", events: [] };
  const prompt = createHttpPrompt({
    cache: new Map(),
    askCounts: new Map(),
    session,
    env: { SOCRATINK_TUI_META_COMMAND: "1" },
  });

  await assert.rejects(
    () => prompt.ask("cold_attempt", "Cold attempt: "),
    (error) => {
      assert.equal(error.code, PROMPT_REQUIRED);
      assert.equal(error.promptMeta.metaShown, true);
      return true;
    },
  );
  assert.equal(session.events.length, 1);
  assert.equal(session.events[0].type, "meta_turn");
  assert.equal(session.events[0].graph_neutral, true);
  assert.equal(session.events[0].score_eligible, false);
});
