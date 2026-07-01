import test from "node:test";
import assert from "node:assert/strict";

import { buildSessionRecord } from "../../lib/seda/session-record.mjs";
import {
  CannotRehydrateSession,
  createRehydratedSessionKernel,
} from "../../lib/seda/session-rehydration.mjs";
import { makeAgentLookup } from "../../lib/seda/session-kernel.mjs";

function createMemoryTrainingStoreFactory() {
  const trainings = new Map();
  return {
    async current(conceptId) {
      return trainings.get(conceptId) || null;
    },
    createTrainingStore: () => ({
      async loadTraining(conceptId) {
        return trainings.get(conceptId) || null;
      },
      async saveTraining(training) {
        trainings.set(training.concept_id, training);
      },
    }),
  };
}

const agentContracts = {
  architecture: {
    orchestrator: "orchestrator",
    truth_contract: "truth",
    state_owner: "state",
  },
  agents: [],
};

const firstNode = {
  id: "c1_s1",
  kc_id: "c1_s1",
  label: "Immune memory",
  mechanism: "Safe antigen exposure leaves memory cells for a faster response.",
  learner_prompt: "Why does a safe preview make the later response faster?",
  blank_hint: "Name what remains.",
  evidence_goal: "Learner reconstructs the memory-cell bridge.",
};

const routeEvent = {
  type: "route_generated",
  first_node: firstNode,
  node_ids: ["c1_s1"],
  provisional_map: {
    thesis: "Immune memory leaves specialized cells for a faster later response.",
    subnodes: [firstNode],
  },
  map_displayed: { nodes: [{ id: "c1_s1", active: true }], edges: [] },
  substrate_adequacy: "adequate",
  retry_count: 0,
  retry_reasons: [],
};

const launchEvent = {
  type: "launch_attempt",
  concept: "Immune memory",
  concept_id: "immune-memory",
  learner_goal: "Explain why vaccines work",
  text: "Vaccines give a safe preview.",
};

const coldEvent = {
  type: "cold_attempt",
  text: "A vaccine shows antigen and memory cells remain.",
  evaluation: {
    classification: "shallow",
    score_eligible: true,
    generative_commitment: true,
    gap_description: "Explain how memory cells speed the later response.",
    agent_response: "You named pieces but missed the process.",
  },
  kc_id: "c1_s1",
};

const scaffold = {
  repair_target: "memory-cell bridge",
  hinge_focus: "memory cells preserve the faster response",
  contrast_prompt: "Compare first exposure with later exposure.",
  before: "safe antigen preview",
  missing_operation: "memory cells remain ready",
  after: "faster later response",
  internal_bloom_lens: "mechanism",
  question_style: "causal_link",
  socratic_question: "What remains after the safe preview?",
};

const gapEvent = {
  type: "gap_identified",
  surface: "delta",
  gap_id: "gap-c1_s1-1",
  cue: "memory-cell bridge",
  gap_log: { kc_id: "c1_s1", missing_operation: scaffold.missing_operation },
  repair_scaffold: scaffold,
  prompt: scaffold.socratic_question,
  graph_neutral: true,
};

function baseEvents() {
  return [launchEvent, routeEvent];
}

async function rehydrate(events) {
  const training = createMemoryTrainingStoreFactory();
  const kernel = await createRehydratedSessionKernel({
    createTrainingStore: training.createTrainingStore,
    bridge: {
      callBridge: async () => ({}),
      callBridgeResult: async () => ({}),
    },
    agentContracts,
    agentLookup: makeAgentLookup(agentContracts),
    section: (_kind, label) => `[${label}]`,
    events,
  });
  return { kernel, training };
}

test("resume after terminal route_retry derives route phase without throwing", async () => {
  const { kernel } = await rehydrate([
    launchEvent,
    { type: "substrate_confirmed", adequacy: "adequate", graph_neutral: true },
    {
      type: "route_retry",
      attempt: 1,
      error: "SmallestRouteCapExceeded",
      message: "copies hidden mechanism",
      graph_neutral: true,
    },
  ]);

  assert.equal(kernel.phase, "route");
  assert.equal(kernel.ctx.concept, "Immune memory");
  assert.equal(kernel.ctx.launchAttempt, "Vaccines give a safe preview.");
  assert.equal(kernel.ctx.route, null);
});

test("resume after route generation reconstructs launch and route ctx", async () => {
  const { kernel, training } = await rehydrate(baseEvents());

  assert.equal(kernel.phase, "cold_attempt");
  assert.equal(kernel.ctx.concept, "Immune memory");
  assert.equal(kernel.ctx.conceptId, "immune-memory");
  assert.equal(kernel.ctx.learnerGoal, "Explain why vaccines work");
  assert.equal(kernel.ctx.launchAttempt, "Vaccines give a safe preview.");
  assert.equal(kernel.ctx.firstNode.id, "c1_s1");
  assert.deepEqual(kernel.ctx.nodeIds, ["c1_s1"]);
  assert.equal(kernel.ctx.route.provisional_map, routeEvent.provisional_map);
  assert.deepEqual(kernel.ctx.composerCta, {
    label: "First question",
    text: firstNode.learner_prompt,
  });
  assert.equal((await training.current("immune-memory")).sketch.text, launchEvent.text);
});

test("resume after gap identification rebuilds scaffold, gap, and study reveal", async () => {
  const { kernel, training } = await rehydrate([
    ...baseEvents(),
    coldEvent,
    gapEvent,
  ]);

  assert.equal(kernel.phase, "repair_dialogue");
  assert.equal(kernel.ctx.coldAttemptText, coldEvent.text);
  assert.equal(kernel.ctx.coldEval, coldEvent.evaluation);
  assert.equal(kernel.ctx.zeroSchemaCold, false);
  assert.equal(kernel.ctx.isMisconception, false);
  assert.equal(kernel.ctx.repairScaffold, scaffold);
  assert.equal(kernel.ctx.gapId, "gap-c1_s1-1");
  assert.equal(kernel.ctx.repairState.turnIndex, 0);

  const rebuilt = await training.current("immune-memory");
  assert.equal(rebuilt.node_records.c1_s1.attempts[0].kind, "cold");
  assert.equal(rebuilt.node_records.c1_s1.study_revealed_at, "2026-05-15T10:12:00.000Z");
});

test("resume mid repair dialogue uses repair-state snapshot", async () => {
  const turn = {
    type: "repair_dialogue_turn",
    gap_id: "gap-c1_s1-1",
    turn_index: 1,
    text: "Not sure",
    bridge_ready: false,
    next_dialogue_action: "escalate",
    next_prompt: "Compare first exposure and later exposure.",
    graph_neutral: true,
    score_eligible: false,
    kc_id: "c1_s1",
    repair_state: {
      turn_index: 1,
      escalation_level: 0,
      uncertainty_recovery_count: 0,
      hint_count: 0,
      last_hint_level: 0,
      ladder_policy_version: "uncertainty-ladder-v1",
    },
  };

  const { kernel } = await rehydrate([
    ...baseEvents(),
    coldEvent,
    gapEvent,
    turn,
  ]);

  assert.equal(kernel.phase, "repair_dialogue");
  assert.equal(kernel.ctx.repairState.turnIndex, 1);
  assert.equal(kernel.ctx.repairState.escalationLevel, 1);
  assert.equal(kernel.ctx.repairState.isFirstTurn, false);
  assert.equal(kernel.ctx.repairState.queuedPrompt, turn.next_prompt);
});

test("resume after model bridge derives post-bridge phase from events", async () => {
  const { kernel } = await rehydrate([
    ...baseEvents(),
    coldEvent,
    gapEvent,
    {
      type: "repair_dialogue_turn",
      gap_id: "gap-c1_s1-1",
      turn_index: 1,
      text: "Memory cells stay ready for later.",
      bridge_ready: true,
      graph_neutral: true,
      score_eligible: false,
      kc_id: "c1_s1",
    },
    { type: "repair", text: "Memory cells stay ready for later.", kc_id: "c1_s1", graph_neutral: true },
    { type: "model_bridge", text: firstNode.mechanism, graph_neutral: true },
  ]);

  assert.equal(kernel.phase, "post_bridge_transfer");
  assert.equal(kernel.ctx.repairState, null);
  assert.equal(kernel.ctx.postBridgeTransfer, null);
});

test("complete record can be built after rehydrating training and evidence holds", async () => {
  const completeEvents = [
    ...baseEvents(),
    coldEvent,
    gapEvent,
    {
      type: "repair_dialogue_turn",
      gap_id: "gap-c1_s1-1",
      turn_index: 1,
      text: "Memory cells remain ready.",
      bridge_ready: true,
      graph_neutral: true,
      score_eligible: false,
      kc_id: "c1_s1",
    },
    { type: "repair", text: "Memory cells remain ready.", kc_id: "c1_s1", graph_neutral: true },
    { type: "model_bridge", text: firstNode.mechanism, graph_neutral: true },
    {
      type: "post_bridge_transfer_decision",
      run_gap: false,
      graph_neutral: true,
      score_eligible: false,
      kc_id: "c1_s1",
    },
    {
      type: "post_bridge_transfer_skipped",
      graph_neutral: true,
      score_eligible: false,
      kc_id: "c1_s1",
    },
    { type: "spacing_advanced" },
    {
      type: "spaced_redrill",
      text: "Memory cells stay ready and respond faster later.",
      evaluation: {
        classification: "solid",
        score_eligible: true,
        generative_commitment: true,
        agent_response: "Solid.",
      },
      kc_id: "c1_s1",
    },
    {
      type: "evidence_hold_recorded",
      graph_neutral: true,
      score_eligible: false,
      kc_id: "c1_s1",
      hold_event: "spaced_redrill",
      state: "primed",
      reason: "Needs another spaced reconstruction.",
    },
  ];
  const { kernel, training } = await rehydrate(completeEvents);
  const record = buildSessionRecord({
    events: kernel.events,
    ctx: kernel.ctx,
    derived: kernel.derived,
    evidenceHolds: kernel.ctx.evidenceHolds,
    llmCalls: kernel.llmCalls,
    training: await training.current("immune-memory"),
    agentContracts,
  });

  assert.equal(kernel.phase, "idle");
  assert.equal(record.concept_id, "immune-memory");
  assert.equal(record.route.first_node.id, "c1_s1");
  assert.equal(record.training.node_records.c1_s1.attempts.length, 2);
  assert.equal(record.training.node_records.c1_s1.repairs.length, 1);
  assert.equal(record.evidence_holds[0].state, "primed");
  assert.equal(record.evidence_claim_trace.claim, "same_session_primed");
  assert.equal(
    record.evidence_claim_trace.learner_facing,
    "Useful practice. Not stable yet.",
  );
  assert.deepEqual(record.evidence_claim_trace.disqualifiers, [
    "not_two_strong_attempts",
  ]);
  assert.equal(record.evidence_claim_trace.evidence[0].state, null);
  assert.equal(
    record.evidence_claim_trace.evidence[0].attempts[0].event_type,
    "cold_attempt",
  );
  assert.equal(
    record.evidence_claim_trace.evidence[0].attempts[0].evaluator_label,
    "shallow",
  );
  assert.equal(
    record.evidence_claim_trace.evidence[0].attempts[0].store_class,
    "partial",
  );
  assert.equal(
    record.evidence_claim_trace.evidence[0].attempts[1].event_type,
    "spaced_redrill",
  );
  assert.equal(
    record.evidence_claim_trace.evidence[0].attempts[1].evaluator_label,
    "solid",
  );
  assert.equal(
    record.evidence_claim_trace.evidence[0].attempts[1].store_class,
    "strong",
  );
  assert.equal(
    record.evidence_claim_trace.evidence[0].attempts[1].contamination,
    "recent_bridge_visible",
  );
});

test("two strong no-help reconstructions derive durable evidence trace", async () => {
  const strongColdEvent = {
    ...coldEvent,
    text: "Memory cells remain after first exposure and expand quickly later.",
    evaluation: {
      ...coldEvent.evaluation,
      classification: "solid",
      agent_response: "Solid.",
    },
  };
  const completeEvents = [
    ...baseEvents(),
    strongColdEvent,
    { type: "strong_cold_path", kc_id: "c1_s1" },
    { type: "spacing_advanced" },
    {
      type: "spaced_redrill",
      text: "Memory cells recognize the antigen later, multiply quickly, and drive a faster response.",
      evaluation: {
        classification: "solid",
        score_eligible: true,
        generative_commitment: true,
        agent_response: "Solid.",
      },
      kc_id: "c1_s1",
    },
  ];
  const { kernel, training } = await rehydrate(completeEvents);
  const record = buildSessionRecord({
    events: kernel.events,
    ctx: kernel.ctx,
    derived: kernel.derived,
    evidenceHolds: kernel.ctx.evidenceHolds,
    llmCalls: kernel.llmCalls,
    training: await training.current("immune-memory"),
    agentContracts,
  });

  assert.equal(record.evidence_claim_trace.claim, "durable_solidified");
  assert.equal(
    record.evidence_claim_trace.learner_facing,
    "Solidified by spaced reconstruction.",
  );
  assert.deepEqual(record.evidence_claim_trace.disqualifiers, []);
  assert.equal(
    record.evidence_claim_trace.evidence[0].attempts[1].contamination,
    "uncued",
  );
});

test("legacy incomplete route events fail clearly instead of partial ctx resume", async () => {
  await assert.rejects(
    () =>
      rehydrate([
        launchEvent,
        { type: "route_generated", substrate_adequacy: "adequate" },
      ]),
    (error) => {
      assert.ok(error instanceof CannotRehydrateSession);
      assert.match(error.message, /route_generated missing required persisted field/);
      assert.deepEqual(error.details.missing, [
        "first_node",
        "node_ids",
        "provisional_map",
        "map_displayed",
        "retry_count",
        "retry_reasons",
      ]);
      return true;
    },
  );
});
