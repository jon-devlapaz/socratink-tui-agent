import test from "node:test";
import assert from "node:assert/strict";

import { prepareRepairScaffold } from "../../lib/seda/repair-scaffold.mjs";

const firstNode = {
  id: "kc-immune-memory",
  label: "immune memory",
  evidence_goal: "the response is faster on second exposure",
  blank_hint: "You have part of how memory cells differ.",
};

// The exact Generation-Before-Recognition leak the persona dogfood surfaced:
// the LLM put a full mechanism paraphrase (plus internal "The learner explains
// that" phrasing) into the after-state, which the drill renders verbatim.
const leakedScaffold = {
  repair_target: "Name what changes between the two states.",
  before: "Consider what memory cells do differently",
  missing_operation: "the missing causal link",
  after:
    "The learner explains that memory lymphocytes are more numerous, have " +
    "lower activation thresholds, and differentiate more quickly into effector " +
    "cells upon secondary exposure.",
  socratic_question: 'What must happen between "before" and "after"?',
};

test("answer-shaped after-state is rejected and falls back to neutral", () => {
  const { scaffold, rejections } = prepareRepairScaffold(
    leakedScaffold,
    {},
    firstNode,
  );
  assert.equal(rejections.length, 1);
  assert.equal(rejections[0].reason, "answer_shaped_scaffold");
  // The mechanism paraphrase must not survive into what the learner sees.
  assert.doesNotMatch(scaffold.after, /memory lymphocytes/i);
  assert.doesNotMatch(scaffold.after, /the learner explains/i);
  assert.doesNotMatch(scaffold.socratic_question, /memory lymphocytes/i);
});

test("meta phrasing in socratic_question is rejected", () => {
  const { rejections } = prepareRepairScaffold(
    {
      ...leakedScaffold,
      after: "the response is faster",
      socratic_question:
        "The learner explains that what must happen between the states?",
    },
    {},
    firstNode,
  );
  assert.equal(rejections.length, 1);
});

test("fallback neutralizes an answer-shaped evidence_goal after-state", () => {
  // evidence_goal often encodes the mechanism + internal phrasing; with no LLM
  // scaffold the fallback must not quote it verbatim in the displayed drill.
  const leakyNode = {
    id: "kc-immune-memory",
    label: "immune memory",
    evidence_goal:
      "The learner reconstructs how immune memory links safe exposure to faster response.",
    blank_hint: "Name what remains after the preview.",
  };
  const { scaffold, rejections } = prepareRepairScaffold(null, {}, leakyNode);
  assert.equal(rejections.length, 0);
  // No mechanism / internal phrasing leaks into the goal-state...
  assert.doesNotMatch(scaffold.after, /the learner/i);
  assert.doesNotMatch(scaffold.socratic_question, /immune memory links/i);
  // ...but the goal-state stays concrete (anchored to the visible topic), not a
  // contentless phrase, so the learner has a target to reconstruct toward.
  assert.match(scaffold.after, /immune memory/i);
});

test("short observable outcome after-state passes the gate", () => {
  const good = {
    repair_target: "Name the link between exposure and speed.",
    before: "You know the second response is faster.",
    missing_operation: "memory cell priming",
    after: "the response is faster on second exposure",
    socratic_question:
      'What must happen between "first exposure" and "a faster second response"?',
  };
  const { scaffold, rejections } = prepareRepairScaffold(good, {}, firstNode);
  assert.equal(rejections.length, 0);
  assert.equal(scaffold.after, "the response is faster on second exposure");
});

test("instructor-facing before is sanitized to learner before-state", () => {
  const photosynthesisNode = {
    id: "kc-photosynthesis",
    label: "Overall Photosynthesis Reaction",
    evidence_goal: "glucose and oxygen are produced",
    blank_hint: "You know plants use sunlight.",
  };
  const instructorScaffold = {
    repair_target: "Consider what plants need from their environment.",
    before:
      'Consider what plants need from their environment and what they produce as a result of using sunlight.',
    missing_operation: "light-dependent reactions",
    after: "the observable result of Overall Photosynthesis Reaction",
    socratic_question: "placeholder",
  };
  const coldAttempt =
    "Plants take in CO2 and water and use sunlight to make sugar and release oxygen.";
  const { scaffold, rejections } = prepareRepairScaffold(
    instructorScaffold,
    {},
    photosynthesisNode,
    coldAttempt,
  );
  assert.equal(rejections.length, 1);
  assert.doesNotMatch(scaffold.before, /consider what plants/i);
  assert.match(scaffold.before, /you described it as/i);
  assert.doesNotMatch(scaffold.after, /observable result of/i);
  assert.match(scaffold.after, /glucose and oxygen/i);
  assert.doesNotMatch(scaffold.socratic_question, /consider what plants/i);
  assert.match(scaffold.socratic_question, /what must happen/i);
});
