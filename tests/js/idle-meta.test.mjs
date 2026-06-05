import test from "node:test";
import assert from "node:assert/strict";

import { handleIdle } from "../../lib/seda/handlers/idle.mjs";

function idleCtx() {
  return {
    scripted: null,
    section: (_kind, title) => title,
  };
}

function promptReturning(...values) {
  let index = 0;
  return {
    ask: async () => values[index++] ?? "",
    close: () => {},
  };
}

test("handleIdle respects disabled meta flag from options.env", async () => {
  const events = [];
  await handleIdle({
    events,
    prompt: promptReturning("/meta", "Caching"),
    ctx: idleCtx(),
    options: { env: {} },
  });

  assert.equal(events.some((event) => event.type === "meta_turn"), false);
  assert.equal(events.at(-1)?.type, "idle_new_concept");
});

test("handleIdle appends meta turn when options.env enables feature", async () => {
  const events = [];
  await handleIdle({
    events,
    prompt: promptReturning("/meta", "Caching"),
    ctx: idleCtx(),
    options: { env: { SOCRATINK_TUI_META_COMMAND: "1" } },
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].type, "meta_turn");
  assert.equal(events[0].graph_neutral, true);
  assert.equal(events[1].type, "idle_new_concept");
});
