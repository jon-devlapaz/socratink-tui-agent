import test from "node:test";
import assert from "node:assert/strict";

import { runSedaLoop } from "../../lib/seda/run-loop.mjs";

function baseArgs(overrides = {}) {
  return {
    events: [],
    derived: {},
    store: {},
    bridge: {},
    prompt: {},
    options: {},
    ctx: {},
    ...overrides,
  };
}

test("runSedaLoop afterHandler receives phase transition facts", async () => {
  const events = [];
  const calls = [];

  await runSedaLoop(
    baseArgs({
      events,
      initialPhase: "idle",
      handlers: {
        idle: async ({ events: handlerEvents }) => {
          handlerEvents.push({ type: "idle_exit" });
        },
      },
      afterHandler: (facts) => {
        calls.push(facts);
        return "continue";
      },
    }),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].phaseBefore, "idle");
  assert.equal(calls[0].phaseAfter, null);
  assert.equal(calls[0].lastEventType, "idle_exit");
  assert.equal(calls[0].events, events);
});

test("runSedaLoop afterHandler can stop before dispatching next phase", async () => {
  const visited = [];

  await runSedaLoop(
    baseArgs({
      initialPhase: "idle",
      handlers: {
        idle: async ({ events }) => {
          visited.push("idle");
          events.push({ type: "idle_new_concept" });
        },
        ignition: async () => {
          visited.push("ignition");
          throw new Error("should not dispatch after stop");
        },
      },
      afterHandler: () => "stop",
    }),
  );

  assert.deepEqual(visited, ["idle"]);
});
