import test from "node:test";
import assert from "node:assert/strict";

import { handlePostBridgeTransfer } from "../../lib/seda/handlers/post-bridge-transfer.mjs";
import { initTrainingDerive } from "../../lib/seda/training-summary.mjs";

await initTrainingDerive();

function agentLookup() {
  return new Map([
    [
      "evidence_judge",
      {
        id: "evidence_judge",
        name: "Evidence judge",
        job: "Evaluate learner evidence.",
        required_outputs: [],
        may_propose_events: [],
        truth_permission: "input_signal_only",
        failure_mode_to_guard: "overclaiming mastery",
      },
    ],
  ]);
}

test("post-bridge transfer persists opted-in HTTP turn and records check", async () => {
  const events = [];
  const derived = [];
  const asked = [];
  const ctx = {
    postBridgeTransfer: { runGap: true },
    composerCta: { label: "Fill the missing link", text: "stale repair prompt" },
    firstNode: {
      id: "c1_s1",
      kc_id: "c1_s1",
      label: "Attention score calculation",
      mechanism: "query key dot product",
    },
    nodeIds: ["c1_s1"],
    route: { provisional_map: { nodes: [] } },
    repairScaffold: { missing_operation: "vectors combine to calculate scores" },
    agentLookup: agentLookup(),
    section: (_kind, label) => `[${label}]`,
  };

  const result = await handlePostBridgeTransfer({
    events,
    derived,
    store: {
      loadTraining: async () => ({ node_records: { c1_s1: { attempts: [] } } }),
    },
    bridge: {
      callBridge: (action, payload) => {
        assert.equal(action, "evaluate-attempt");
        assert.equal(payload.learner_text, "Dot product then softmax.");
        return {
          evaluation: {
            classification: "solid",
            agent_response: "That transfers the mechanism.",
            score_eligible: true,
          },
          llm_call: {
            provider: "fake",
            model: "test",
            latency_ms: 0,
          },
        };
      },
    },
    prompt: {
      ask: async (key) => {
        asked.push(key);
        assert.equal(key, "gap_attempt");
        return "Dot product then softmax.";
      },
    },
    options: { logRawLlm: false },
    ctx,
  });

  assert.deepEqual(asked, ["gap_attempt"]);
  assert.equal(events[0].type, "post_bridge_transfer_check");
  assert.equal(events[0].text, "Dot product then softmax.");
  assert.equal(ctx.postBridgeTransfer, null);
  assert.equal(ctx.composerCta, null);
  assert.equal(result.llm_calls.length, 1);
});
