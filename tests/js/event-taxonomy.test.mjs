import test from "node:test";
import assert from "node:assert/strict";

import { nextPhase } from "../../lib/seda/next-phase.mjs";
import {
  CANONICAL_EVENT_TAXONOMY_VERSION,
  CANONICAL_LEARNER_LOOP_EVENTS,
  assertPublicVocabularySafe,
  canonicalEventsForSession,
  canonicalizeEvent,
} from "../../lib/seda/event-taxonomy.mjs";

const REQUIRED_EVENTS = [
  "loop_started",
  "source_submitted",
  "goal_submitted",
  "substrate_seed_requested",
  "substrate_seed_shown",
  "substrate_refinement_submitted",
  "substrate_confirmed",
  "cold_attempt_prompted",
  "cold_attempt_submitted",
  "cold_attempt_evaluated",
  "repair_prompted",
  "repair_submitted",
  "bridge_prompted",
  "bridge_submitted",
  "case_completed",
  "spaced_redrill_scheduled",
  "spaced_redrill_submitted",
  "meta_requested",
  "meta_returned",
];

test("canonical taxonomy names every learner-loop event with versions and current aliases", () => {
  assert.match(CANONICAL_EVENT_TAXONOMY_VERSION, /^learner-loop-event-taxonomy-v\d+$/);

  for (const eventType of REQUIRED_EVENTS) {
    const definition = CANONICAL_LEARNER_LOOP_EVENTS[eventType];
    assert.ok(definition, `missing canonical definition for ${eventType}`);
    assert.equal(definition.event_type, eventType);
    assert.match(definition.event_version, /^v\d+$/);
    assert.equal(typeof definition.graph_neutral, "boolean");
    assert.equal(typeof definition.score_eligible, "boolean");
    assert.ok(
      Array.isArray(definition.source_event_types),
      `${eventType} must declare source_event_types`,
    );
  }
});

test("canonicalizeEvent returns an envelope without mutating legacy event.type", () => {
  const legacy = {
    type: "substrate_seed_offered",
    phase: "substrate_gate",
    seed: "Try one link.",
    graph_neutral: true,
    score_eligible: false,
  };
  const envelopes = canonicalizeEvent(legacy, {
    sessionId: "session-1",
    caseId: "case-1",
  });

  assert.equal(legacy.type, "substrate_seed_offered");
  assert.equal(envelopes.length, 1);
  assert.deepEqual(envelopes[0], {
    event_type: "substrate_seed_shown",
    event_version: "v1",
    session_id: "session-1",
    case_id: "case-1",
    kc_id: null,
    phase: "substrate_gate",
    timestamp: null,
    graph_neutral: true,
    score_eligible: false,
    payload: {
      legacy_event_type: "substrate_seed_offered",
      seed: "Try one link.",
      refinement_prompt: null,
      substrate_classification: null,
      judge_reason: null,
    },
  });
});

test("canonical projection marks substrate/meta graph-neutral and cold as first score-eligible surface", () => {
  const canonical = canonicalEventsForSession({
    session_id: "session-2",
    case_id: "case-2",
    events: [
      { type: "launch_attempt", text: "rough start" },
      { type: "substrate_seed_offered", graph_neutral: true, score_eligible: false },
      { type: "substrate_refinement", text: "one start", graph_neutral: true, score_eligible: false },
      { type: "substrate_confirmed", graph_neutral: true, score_eligible: false },
      { type: "route_generated" },
      {
        type: "meta_turn",
        phase: "cold_attempt",
        graph_neutral: true,
        score_eligible: false,
      },
      {
        type: "cold_attempt",
        phase: "cold_attempt",
        text: "my answer",
        kc_id: "kc-1",
        evaluation: { classification: "shallow", score_eligible: true },
      },
    ],
  });

  const byType = new Map(canonical.map((event) => [event.event_type, event]));
  assert.equal(byType.get("substrate_seed_requested").graph_neutral, true);
  assert.equal(byType.get("substrate_seed_requested").score_eligible, false);
  assert.equal(byType.get("substrate_seed_shown").graph_neutral, true);
  assert.equal(byType.get("substrate_refinement_submitted").score_eligible, false);
  assert.equal(byType.get("substrate_confirmed").graph_neutral, true);
  assert.equal(byType.get("meta_requested").graph_neutral, true);
  assert.equal(byType.get("meta_returned").score_eligible, false);

  const scoreEligible = canonical.filter((event) => event.score_eligible);
  assert.deepEqual(
    scoreEligible.map((event) => event.event_type),
    ["cold_attempt_submitted", "cold_attempt_evaluated"],
  );
  assert.equal(scoreEligible[0].kc_id, "kc-1");
});

test("canonical prompt-only projection does not enter authoritative events or alter nextPhase", () => {
  const events = [{ type: "route_generated" }];
  const canonical = canonicalEventsForSession({ events });

  assert.equal(events.length, 1);
  assert.deepEqual(
    canonical.map((event) => event.event_type),
    ["cold_attempt_prompted"],
  );
  assert.equal(nextPhase(events), "cold_attempt");
});

test("public taxonomy vocabulary guard rejects Repair Reps unless recanonized", () => {
  assert.throws(
    () => assertPublicVocabularySafe("Show Repair Reps in the dashboard"),
    /public-vocabulary-forbidden:Repair Reps/,
  );
  assert.doesNotThrow(() =>
    assertPublicVocabularySafe("Repair remains a learning move."),
  );
});
