import test from "node:test";
import assert from "node:assert/strict";

import {
  nextPhase,
  DIRECT_PHASE,
  MAX_REPAIR_TURNS,
} from "../../lib/seda/next-phase.mjs";
import { eventDefinition } from "../../lib/seda/event-facts.mjs";

const ev = (type, extra = {}) => ({ type, ...extra });

test("empty event log routes to ignition", () => {
  assert.equal(nextPhase([]), "ignition");
});

test("DIRECT_PHASE table is honored for direct event types", () => {
  const cases = {
    launch_attempt: "substrate_gate",
    substrate_seed_offered: "substrate_gate",
    substrate_refinement: "substrate_gate",
    substrate_support_exhausted: "substrate_gate",
    substrate_confirmed: "route",
    route_retry: "route",
    route_generated: "cold_attempt",
    strong_cold_path: "spacing",
    gap_identified: "repair_dialogue",
    repair: "model_bridge",
    model_bridge: "post_bridge_transfer",
    post_bridge_transfer_decision: "post_bridge_transfer",
    post_bridge_transfer_check: "spacing",
    post_bridge_transfer_skipped: "spacing",
    spacing_advanced: "spaced_redrill",
    spaced_redrill: "idle",
    evidence_hold_recorded: "idle",
    idle_new_concept: "ignition",
    learner_goal_set: "ignition",
    idle_redrill: "spaced_redrill",
  };
  for (const [type, expected] of Object.entries(cases)) {
    assert.equal(nextPhase([ev(type)]), expected, `${type} -> ${expected}`);
  }
});

test("terminal route_retry resumes to route phase", () => {
  assert.equal(eventDefinition("route_retry").routing_fact, true);
  assert.equal(nextPhase([ev("route_retry")]), "route");
  assert.equal(
    nextPhase([ev("substrate_confirmed"), ev("route_retry")]),
    "route",
  );
});

test("idle_exit terminates the loop (null)", () => {
  assert.equal(nextPhase([ev("idle_exit")]), null);
  assert.equal(DIRECT_PHASE.idle_exit, null);
});

test("cold_attempt classification gates strong vs delta", () => {
  assert.equal(
    nextPhase([ev("cold_attempt", { evaluation: { classification: "solid" } })]),
    "strong_cold_path",
  );
  assert.equal(
    nextPhase([
      ev("cold_attempt", { evaluation: { classification: "shallow" } }),
    ]),
    "delta",
  );
});

test("cold_attempt with missing evaluation falls back to delta", () => {
  assert.equal(nextPhase([ev("cold_attempt")]), "delta");
  assert.equal(nextPhase([ev("cold_attempt", { evaluation: {} })]), "delta");
});

test("cold help routing", () => {
  assert.equal(nextPhase([ev("cold_help_turn")]), "cold_attempt");
  assert.equal(nextPhase([ev("cold_support_exhausted")]), "delta");
});

test("repair_dialogue_turn: bridge_ready commits to repair", () => {
  assert.equal(
    nextPhase([ev("repair_dialogue_turn", { bridge_ready: true })]),
    "repair",
  );
});

test("repair_dialogue_turn: bridge_ready overrides cap and abandon", () => {
  assert.equal(
    nextPhase([
      ev("repair_dialogue_turn", {
        bridge_ready: true,
        turn_index: MAX_REPAIR_TURNS + 2,
        next_dialogue_action: "abandon",
      }),
    ]),
    "repair",
  );
});

test("repair_dialogue_turn: fadeback_pending is not a routing signal", () => {
  // fade-back was superseded by escalationLevel + the recovery ladder; the
  // field is ignored and such a turn just continues the dialogue by default.
  assert.equal(
    nextPhase([ev("repair_dialogue_turn", { fadeback_pending: true })]),
    "repair_dialogue",
  );
});

test("repair_dialogue_turn: escalate / recover stay in dialogue", () => {
  assert.equal(
    nextPhase([ev("repair_dialogue_turn", { next_dialogue_action: "escalate" })]),
    "repair_dialogue",
  );
  assert.equal(
    nextPhase([
      ev("repair_dialogue_turn", {
        next_dialogue_action: "recover_uncertainty",
      }),
    ]),
    "repair_dialogue",
  );
});

test("repair_dialogue_turn: cap or abandon ends in repair_abandoned", () => {
  assert.equal(
    nextPhase([ev("repair_dialogue_turn", { turn_index: MAX_REPAIR_TURNS })]),
    "repair_abandoned",
  );
  assert.equal(
    nextPhase([ev("repair_dialogue_turn", { next_dialogue_action: "abandon" })]),
    "repair_abandoned",
  );
});

test("repair_dialogue_turn: default continues dialogue", () => {
  assert.equal(
    nextPhase([ev("repair_dialogue_turn", { turn_index: 1 })]),
    "repair_dialogue",
  );
});

test("repair_abandoned routes on next_step", () => {
  assert.equal(
    nextPhase([ev("repair_abandoned", { next_step: "recovery_prompt" })]),
    "repair_recovery",
  );
  assert.equal(
    nextPhase([ev("repair_abandoned", { next_step: "micro_scaffold" })]),
    "idle",
  );
  assert.equal(nextPhase([ev("repair_abandoned")]), "idle");
});

test("repair_recovery_closed routes on next_phase", () => {
  assert.equal(
    nextPhase([ev("repair_recovery_closed", { next_phase: "repair" })]),
    "repair",
  );
  assert.equal(nextPhase([ev("repair_recovery_closed")]), "idle");
});

test("only the last event drives routing", () => {
  const events = [
    ev("launch_attempt"),
    ev("route_generated"),
    ev("cold_attempt", { evaluation: { classification: "solid" } }),
  ];
  assert.equal(nextPhase(events), "strong_cold_path");
});

test("repair_hint_requested stays in repair_dialogue", () => {
  assert.equal(
    nextPhase([
      ev("gap_identified"),
      ev("repair_hint_requested", { next_dialogue_action: "retry_after_hint" }),
    ]),
    "repair_dialogue",
  );
});

test("unknown event type throws", () => {
  assert.throws(() => nextPhase([ev("not_a_real_event")]), /unknown event type/);
});
