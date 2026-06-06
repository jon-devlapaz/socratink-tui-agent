import test from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_FACT_DEFINITIONS,
  EVENT_FACT_TYPES,
  assertEventInvariants,
  buildEvent,
  eventBuilders,
  eventDefinition,
} from "../../lib/seda/event-facts.mjs";

const EXPECTED_EVENT_TYPES = [
  "bridge_error",
  "cold_attempt",
  "cold_help_turn",
  "cold_support_exhausted",
  "evidence_hold_recorded",
  "gap_identified",
  "idle_exit",
  "idle_new_concept",
  "idle_redrill",
  "launch_attempt",
  "learner_goal_set",
  "meta_turn",
  "model_bridge",
  "post_bridge_transfer_check",
  "post_bridge_transfer_decision",
  "post_bridge_transfer_skipped",
  "repair",
  "repair_abandoned",
  "repair_cap_selected",
  "repair_dialogue_turn",
  "repair_hint_requested",
  "repair_recovery_closed",
  "repair_recovery_started",
  "repair_recovery_turn",
  "repair_state_bucketed",
  "route_generated",
  "route_retry",
  "spaced_redrill",
  "spacing_advanced",
  "strong_cold_path",
  "substrate_confirmed",
  "substrate_refinement",
  "substrate_seed_offered",
  "substrate_support_exhausted",
];

const firstNode = {
  id: "c1_s1",
  kc_id: "c1_s1",
  label: "Immune memory",
  mechanism: "Memory cells remain ready.",
  learner_prompt: "Why is the later response faster?",
};

const evaluation = {
  classification: "shallow",
  score_eligible: true,
  generative_commitment: true,
  agent_response: "Name the mechanism.",
};

test("exports definitions for every current runtime SEDA event type", () => {
  assert.deepEqual(EVENT_FACT_TYPES, EXPECTED_EVENT_TYPES);
  assert.deepEqual(Object.keys(EVENT_FACT_DEFINITIONS), EXPECTED_EVENT_TYPES);

  for (const type of EXPECTED_EVENT_TYPES) {
    const definition = eventDefinition(type);
    assert.equal(definition.type, type);
    for (const key of [
      "graph_neutral",
      "score_eligible",
      "learner_text",
      "routing_fact",
      "requires_kc_id",
      "replay_relevant",
    ]) {
      assert.equal(typeof definition[key], "boolean", `${type}.${key}`);
    }
    assert.equal(Array.isArray(definition.persisted_fields), true);
    assert.equal(Array.isArray(definition.required_fields), true);
  }
});

test("definitions preserve graph honesty distinctions", () => {
  assert.equal(eventDefinition("cold_attempt").score_eligible, true);
  assert.equal(eventDefinition("spaced_redrill").score_eligible, true);
  assert.equal(eventDefinition("cold_attempt").graph_neutral, false);
  assert.equal(eventDefinition("spaced_redrill").graph_neutral, false);

  assert.equal(eventDefinition("strong_cold_path").graph_neutral, true);
  assert.equal(eventDefinition("strong_cold_path").score_eligible, false);
  assert.equal(eventDefinition("strong_cold_path").routing_fact, true);
  assert.equal(eventDefinition("strong_cold_path").learner_text, false);
});

test("builders preserve exact legacy shapes for representative evidence events", () => {
  assert.deepEqual(
    eventBuilders.coldAttempt({
      text: "A vaccine leaves memory cells ready.",
      evaluation,
      kc_id: "c1_s1",
    }),
    {
      type: "cold_attempt",
      text: "A vaccine leaves memory cells ready.",
      evaluation,
      kc_id: "c1_s1",
    },
  );

  assert.deepEqual(
    eventBuilders.spacedRedrill({
      text: "Memory cells respond faster after the safe preview.",
      evaluation: { ...evaluation, classification: "solid" },
      kc_id: "c1_s1",
    }),
    {
      type: "spaced_redrill",
      text: "Memory cells respond faster after the safe preview.",
      evaluation: { ...evaluation, classification: "solid" },
      kc_id: "c1_s1",
    },
  );
});

test("builders preserve current shapes for route, hold, and graph-neutral samples", () => {
  const route = {
    first_node: firstNode,
    node_ids: ["c1_s1"],
    provisional_map: { nodes: [firstNode], edges: [] },
    map_displayed: { nodes: [{ id: "c1_s1", active: true }], edges: [] },
    substrate_adequacy: "adequate",
    retry_count: 0,
    retry_reasons: [],
  };
  assert.deepEqual(eventBuilders.routeGenerated(route), {
    type: "route_generated",
    ...route,
  });

  assert.deepEqual(
    eventBuilders.evidenceHoldRecorded({
      kc_id: "c1_s1",
      hold_event: "spaced_redrill",
      state: "primed",
      reason: "needs second spaced reconstruction",
    }),
    {
      type: "evidence_hold_recorded",
      phase: "spaced_redrill",
      graph_neutral: true,
      score_eligible: false,
      kc_id: "c1_s1",
      hold_event: "spaced_redrill",
      state: "primed",
      reason: "needs second spaced reconstruction",
    },
  );

  assert.deepEqual(
    eventBuilders.strongColdPath({
      reason: "cold_reconstruction_solid",
      next_step: "spaced_redrill",
      kc_id: "c1_s1",
    }),
    {
      type: "strong_cold_path",
      graph_neutral: true,
      reason: "cold_reconstruction_solid",
      next_step: "spaced_redrill",
      kc_id: "c1_s1",
    },
  );
});

test("invariants reject unknown types, missing kc_id, and graph-neutral score eligibility", () => {
  assert.throws(
    () => buildEvent("unknown_event", {}),
    /unknown SEDA event type: unknown_event/,
  );
  assert.throws(
    () => eventBuilders.coldAttempt({ text: "x", evaluation }),
    /cold_attempt requires kc_id/,
  );
  assert.throws(
    () =>
      assertEventInvariants({
        type: "repair_dialogue_turn",
        graph_neutral: true,
        score_eligible: true,
        kc_id: "c1_s1",
      }),
    /repair_dialogue_turn cannot be both graph-neutral and score-eligible/,
  );
});

test("required persisted fields fail clearly for replay-critical builders", () => {
  assert.throws(
    () =>
      eventBuilders.routeGenerated({
        first_node: firstNode,
        node_ids: ["c1_s1"],
        provisional_map: { nodes: [], edges: [] },
      }),
    /route_generated missing required field: map_displayed/,
  );
  assert.throws(
    () =>
      eventBuilders.evidenceHoldRecorded({
        kc_id: "c1_s1",
        hold_event: "spaced_redrill",
        state: "primed",
      }),
    /evidence_hold_recorded missing required field: reason/,
  );
});
