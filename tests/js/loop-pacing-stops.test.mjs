import test from "node:test";
import assert from "node:assert/strict";

import {
  getHostedLoopPacingStop,
  isHostedLoopPacingEnabled,
  shouldStopHostedLoop,
} from "../../lib/loop-server/pacing-stops.mjs";

function ev(type, extra = {}) {
  return { type, ...extra };
}

test("hosted loop pacing is explicit but keeps loopUi compatibility", () => {
  assert.equal(
    isHostedLoopPacingEnabled({ loopUiPacing: "one_beat" }),
    true,
  );
  assert.equal(isHostedLoopPacingEnabled({ loopUi: true }), true);
  assert.equal(
    isHostedLoopPacingEnabled({ loopUi: true, loopUiPacing: "off" }),
    false,
  );
  assert.equal(isHostedLoopPacingEnabled({ loopUi: false }), false);
});

test("hosted loop pacing stops at required post-handler boundaries", () => {
  const cases = [
    {
      name: "route waits for cold attempt",
      events: [ev("route_generated")],
      phaseBefore: "route",
      phaseAfter: "cold_attempt",
      key: "cold_attempt",
    },
    {
      name: "scored cold waits before delta",
      events: [ev("cold_attempt", { evaluation: { classification: "shallow" } })],
      phaseBefore: "cold_attempt",
      phaseAfter: "delta",
      key: "continue",
    },
    {
      name: "cold support exhaustion waits before zero-schema delta",
      events: [ev("cold_support_exhausted")],
      phaseBefore: "cold_attempt",
      phaseAfter: "delta",
      key: "continue",
    },
    {
      name: "delta waits before repair dialogue",
      events: [ev("gap_identified")],
      phaseBefore: "delta",
      phaseAfter: "repair_dialogue",
      key: "repair",
    },
    {
      name: "repair commit waits before model bridge",
      events: [ev("repair")],
      phaseBefore: "repair",
      phaseAfter: "model_bridge",
      key: "continue",
    },
    {
      name: "model bridge waits before transfer decision",
      events: [ev("model_bridge")],
      phaseBefore: "model_bridge",
      phaseAfter: "post_bridge_transfer",
      key: "run_gap_drill",
    },
  ];

  for (const row of cases) {
    const stop = getHostedLoopPacingStop(row);
    assert.ok(stop, row.name);
    assert.equal(stop.promptMeta.key, row.key, row.name);
    assert.equal(shouldStopHostedLoop(row), true, row.name);
  }
});

test("hosted loop pacing does not stop for prompt-bound or system-only events", () => {
  const cases = [
    {
      name: "substrate seed is already prompt-bound by handler",
      events: [ev("substrate_seed_offered")],
      phaseBefore: "substrate_gate",
      phaseAfter: "substrate_gate",
    },
    {
      name: "cold help retry is prompt-bound",
      events: [ev("cold_help_turn")],
      phaseBefore: "cold_attempt",
      phaseAfter: "cold_attempt",
    },
    {
      name: "strong cold path can continue to spacing",
      events: [ev("strong_cold_path")],
      phaseBefore: "strong_cold_path",
      phaseAfter: "spacing",
    },
    {
      name: "spacing system transition is not a hosted beat stop",
      events: [ev("spacing_advanced")],
      phaseBefore: "spacing",
      phaseAfter: "spaced_redrill",
    },
  ];

  for (const row of cases) {
    assert.equal(getHostedLoopPacingStop(row), null, row.name);
    assert.equal(shouldStopHostedLoop(row), false, row.name);
  }
});
