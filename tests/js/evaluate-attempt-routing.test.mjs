import test from "node:test";
import assert from "node:assert/strict";

import { nextPhase } from "../../lib/seda/next-phase.mjs";

const ev = (type, extra = {}) => ({ type, ...extra });

test("cold_attempt solid routes to strong_cold_path", () => {
  assert.equal(
    nextPhase([ev("cold_attempt", { evaluation: { classification: "solid" } })]),
    "strong_cold_path",
  );
});

test("cold_attempt non-solid routes to delta", () => {
  for (const classification of ["shallow", "deep", "misconception"]) {
    assert.equal(
      nextPhase([ev("cold_attempt", { evaluation: { classification } })]),
      "delta",
      classification,
    );
  }
});

test("cold_help_turn stays in cold_attempt phase", () => {
  assert.equal(nextPhase([ev("cold_help_turn", { turn_index: 1 })]), "cold_attempt");
});

test("cold_support_exhausted routes to delta", () => {
  assert.equal(nextPhase([ev("cold_support_exhausted")]), "delta");
});

test("post_bridge_transfer_check routes to spacing without reading evaluation", () => {
  assert.equal(
    nextPhase([
      ev("post_bridge_transfer_check", {
        evaluation: { classification: "solid" },
      }),
    ]),
    "spacing",
  );
});

test("spaced_redrill routes to idle without reading evaluation", () => {
  assert.equal(
    nextPhase([
      ev("spaced_redrill", { evaluation: { classification: "solid" } }),
    ]),
    "idle",
  );
});
