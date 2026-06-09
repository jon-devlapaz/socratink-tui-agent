import test from "node:test";
import assert from "node:assert/strict";

import { createTrainingStore } from "../../lib/canon/training-store.js";
import {
  buildEvidenceHold,
  spacedRedrillClosureLine,
} from "../../lib/seda/evidence-hold.mjs";
import { handleSpacedRedrill } from "../../lib/seda/handlers/spaced-redrill.mjs";
import { nextPhase } from "../../lib/seda/next-phase.mjs";
import { initTrainingDerive } from "../../lib/seda/training-summary.mjs";

function createMemoryStorage() {
  const writes = new Map();
  return {
    getItem(key) {
      return writes.has(key) ? writes.get(key) : null;
    },
    setItem(key, value) {
      writes.set(key, value);
    },
    removeItem(key) {
      writes.delete(key);
    },
  };
}

function agent(id) {
  return {
    id,
    name: id,
    job: "test",
    required_outputs: [],
    may_propose_events: [],
    truth_permission: "none",
    failure_mode_to_guard: "test",
  };
}

test("spacedRedrillClosureLine explains primed pause without sounding like another prompt", () => {
  const line = spacedRedrillClosureLine({
    finalState: "primed",
    evidenceHold: null,
  });
  assert.match(line, /not another question/);
  assert.match(line, /primed/);
});

test("spacedRedrillClosureLine prefers solidified copy over stale evidenceHold", () => {
  const line = spacedRedrillClosureLine({
    finalState: "solidified",
    evidenceHold: { event: "spaced_redrill", state: "primed", reason: "stale" },
  });
  assert.match(line, /on your map/);
  assert.doesNotMatch(line, /Case paused/);
});

test("spacedRedrillClosureLine shortens when evidence hold already explains derivation", () => {
  const hold = buildEvidenceHold({
    finalState: "primed",
    spacedEvaluation: { classification: "solid" },
    training: {
      node_records: {
        "node-1": {
          attempts: [{ classification: "partial" }],
        },
      },
    },
    nodeId: "node-1",
  });
  const line = spacedRedrillClosureLine({
    finalState: "primed",
    evidenceHold: hold,
  });
  assert.match(line, /Case paused here/);
  assert.doesNotMatch(line, /not another question/);
});

test("spaced redrill records graph-neutral evidence hold event when derivation holds solid answer", async () => {
  await initTrainingDerive();
  const store = createTrainingStore({ storage: createMemoryStorage() });
  await store.appendAttempt("concept-1", "node-1", {
    id: "cold-1",
    at: "2026-01-01T00:00:00.000Z",
    user_text: "A first partial reconstruction.",
    classification: "partial",
    gaps: [],
    grader_version: "test",
  });

  const events = [];
  const derived = [];
  const ctx = {
    conceptId: "concept-1",
    firstNode: {
      id: "node-1",
      kc_id: "kc-1",
      label: "Node",
      mechanism: "Mechanism",
    },
    nodeIds: ["node-1"],
    route: { provisional_map: { thesis: "Test map" } },
    evidenceHolds: [],
    agentLookup: new Map([
      ["redrill", agent("redrill")],
      ["evidence_judge", agent("evidence_judge")],
    ]),
    section(_kind, label) {
      return `[${label}]`;
    },
  };

  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(" "));

  let result;
  try {
    result = await handleSpacedRedrill({
      events,
      derived,
      store,
      bridge: {
        callBridgeResult() {
          return {
            ok: true,
            payload: {
              evaluation: {
                classification: "solid",
                score_eligible: true,
                agent_response: "Solid reconstruction.",
              },
              llm_call: {
                provider: "fake",
                model: "test",
                latency_ms: 0,
              },
            },
          };
        },
      },
      prompt: {
        async ask() {
          return "A spaced solid reconstruction.";
        },
      },
      options: { logRawLlm: false },
      ctx,
    });
  } finally {
    console.log = log;
  }

  assert.deepEqual(
    events.map((event) => event.type),
    ["spaced_redrill", "evidence_hold_recorded"],
  );
  assert.equal(events[1].graph_neutral, true);
  assert.equal(events[1].score_eligible, false);
  assert.equal(events[1].kc_id, "kc-1");
  assert.equal(events[1].state, "primed");
  assert.equal(ctx.evidenceHolds.length, 1);

  assert.equal(nextPhase(events), "idle");
  assert.equal(result.llm_calls.length, 2);
  assert.ok(
    lines.some((line) => line.includes("Case paused here")),
    "expected evidence-hold closure before idle",
  );
});

test("spaced redrill prints primed closure when spaced answer is not solid", async () => {
  await initTrainingDerive();
  const store = createTrainingStore({ storage: createMemoryStorage() });
  await store.appendAttempt("concept-1", "node-1", {
    id: "cold-1",
    at: "2026-01-01T00:00:00.000Z",
    user_text: "A first partial reconstruction.",
    classification: "partial",
    gaps: [],
    grader_version: "test",
  });

  const events = [];
  const derived = [];
  const ctx = {
    conceptId: "concept-1",
    firstNode: {
      id: "node-1",
      kc_id: "kc-1",
      label: "Node",
      mechanism: "Mechanism",
    },
    nodeIds: ["node-1"],
    route: { provisional_map: { thesis: "Test map" } },
    evidenceHolds: [],
    agentLookup: new Map([
      ["redrill", agent("redrill")],
      ["evidence_judge", agent("evidence_judge")],
    ]),
    section(_kind, label) {
      return `[${label}]`;
    },
  };

  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(" "));

  try {
    await handleSpacedRedrill({
      events,
      derived,
      store,
      bridge: {
        callBridgeResult() {
          return {
            ok: true,
            payload: {
              evaluation: {
                classification: "shallow",
                score_eligible: true,
                agent_response: "You named chlorophyll but not what changes inside it.",
              },
              llm_call: {
                provider: "fake",
                model: "test",
                latency_ms: 0,
              },
            },
          };
        },
      },
      prompt: {
        async ask() {
          return "A spaced shallow reconstruction.";
        },
      },
      options: { logRawLlm: false },
      ctx,
    });
  } finally {
    console.log = log;
  }

  assert.deepEqual(events.map((event) => event.type), ["spaced_redrill"]);
  assert.ok(
    lines.some((line) => line.includes("not another question")),
    "expected primed closure before idle",
  );
});
