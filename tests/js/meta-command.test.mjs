import test from "node:test";
import assert from "node:assert/strict";

import {
  appendMetaTurn,
  isMetaLearnerFeatureEnabled,
  metaResponseForPrompt,
} from "../../lib/seda/meta-command.mjs";

const FORBIDDEN = [
  "primed",
  "solidified",
  "graph-neutral",
  "kc_id",
  "node",
  "evidence candidate",
  "repair_dialogue_turn",
  "substrate_gate",
];

test("meta copy stays plain and deterministic", () => {
  for (const key of [
    "cmd",
    "launch_attempt",
    "substrate_refinement",
    "cold_attempt",
    "repair",
    "gap_attempt",
    "spaced_attempt",
  ]) {
    const copy = metaResponseForPrompt(key);
    assert.match(copy, /\w/);
    for (const term of FORBIDDEN) {
      assert.doesNotMatch(copy.toLowerCase(), new RegExp(term));
    }
  }
});

test("appendMetaTurn records graph-neutral non-evidence event", () => {
  const events = [];
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    const event = appendMetaTurn(events, "cold_attempt", {
      env: { SOCRATINK_TUI_META_COMMAND: "1" },
    });
    assert.equal(event.type, "meta_turn");
    assert.equal(event.phase, "cold_attempt");
    assert.equal(event.graph_neutral, true);
    assert.equal(event.score_eligible, false);
    assert.equal(event.intent, "explain_current_move");
  } finally {
    console.log = log;
  }
  assert.equal(events.length, 1);
  assert.match(lines.join("\n"), /^\[Meta\]/);
});

test("meta feature flag is deterministic and default-off", () => {
  assert.equal(isMetaLearnerFeatureEnabled({}), false);
  assert.equal(
    isMetaLearnerFeatureEnabled({ SOCRATINK_TUI_META_COMMAND: "1" }),
    true,
  );
  assert.equal(
    isMetaLearnerFeatureEnabled({ SOCRATINK_TUI_META_COMMAND: "true" }),
    true,
  );
});

test("appendMetaTurn is unavailable and does not append when flag is disabled", () => {
  const events = [];
  const event = appendMetaTurn(events, "cold_attempt", { env: {} });

  assert.equal(event, null);
  assert.deepEqual(events, []);
});
