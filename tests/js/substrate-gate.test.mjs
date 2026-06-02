import test from "node:test";
import assert from "node:assert/strict";

import {
  handleSubstrateGate,
  classifySubstrateLaunch,
} from "../../lib/seda/handlers/substrate-gate.mjs";
import { HANDLERS } from "../../lib/seda/handlers/index.mjs";

const ev = (type, extra = {}) => ({ type, ...extra });

function makeCtx(overrides = {}) {
  return {
    launchAttempt: "I don't know.",
    composerCta: null,
    section: (_key, label) => `[${label}]`,
    ...overrides,
  };
}

function makePrompt(script = {}) {
  const calls = [];
  return {
    calls,
    ask: async (key, label, fallback = "") => {
      calls.push({ key, label, fallback });
      return script[key] ?? fallback;
    },
  };
}

test("classifySubstrateLaunch treats blank, unknown, and very short launch text as slow path", () => {
  assert.equal(classifySubstrateLaunch(""), "slow");
  assert.equal(classifySubstrateLaunch("I don't know"), "slow");
  assert.equal(classifySubstrateLaunch("cells learn"), "slow");
});

test("classifySubstrateLaunch treats multi-clause process launch text as fast path", () => {
  const text =
    "A vaccine presents antigen in a controlled context, so matching immune cells expand and later memory cells accelerate the response.";
  assert.equal(classifySubstrateLaunch(text), "fast");
});

test("HANDLERS registers substrate_gate phase", () => {
  assert.equal(HANDLERS.substrate_gate, handleSubstrateGate);
});

test("fast path confirms adequate substrate without prompting or scoring", async () => {
  const events = [
    ev("launch_attempt", {
      text: "A vaccine presents antigen in a controlled context, so matching immune cells expand and later memory cells accelerate the response.",
    }),
  ];
  const prompt = makePrompt();
  const ctx = makeCtx();

  const result = await handleSubstrateGate({
    events,
    prompt,
    ctx,
    options: {},
  });

  assert.equal(prompt.calls.length, 0);
  assert.deepEqual(result, { llm_calls: [] });
  assert.deepEqual(events.at(-1), {
    type: "substrate_confirmed",
    adequacy: "adequate",
    graph_neutral: true,
    score_eligible: false,
  });
});

test("slow path offers a seed, asks for refinement, and confirms minimal substrate", async () => {
  const events = [ev("launch_attempt", { text: "I don't know." })];
  const prompt = makePrompt({
    substrate_refinement: "Vaccines give the body a safe preview.",
  });
  const ctx = makeCtx({ launchAttempt: "I don't know." });

  const result = await handleSubstrateGate({
    events,
    prompt,
    ctx,
    options: {},
  });

  assert.deepEqual(result, { llm_calls: [] });
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "launch_attempt",
      "substrate_seed_offered",
      "substrate_refinement",
      "substrate_confirmed",
    ],
  );
  assert.equal(events[1].graph_neutral, true);
  assert.equal(events[1].score_eligible, false);
  assert.equal(events[2].text, "Vaccines give the body a safe preview.");
  assert.equal(events[2].graph_neutral, true);
  assert.equal(events[2].score_eligible, false);
  assert.equal(events[3].adequacy, "minimal");
  assert.equal(events[3].graph_neutral, true);
  assert.equal(events[3].score_eligible, false);
  assert.deepEqual(prompt.calls, [
    {
      key: "substrate_refinement",
      label: "Substrate refinement: ",
      fallback: "",
    },
  ]);
  assert.deepEqual(ctx.composerCta, {
    label: "Add a starting link",
    text: "Try one small starting link in your own words.",
  });
});

test("slow path records support exhaustion before confirming still-weak refinement", async () => {
  const events = [ev("launch_attempt", { text: "" })];
  const prompt = makePrompt({ substrate_refinement: "unsure" });
  const ctx = makeCtx({ launchAttempt: "" });

  await handleSubstrateGate({
    events,
    prompt,
    ctx,
    options: {},
  });

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "launch_attempt",
      "substrate_seed_offered",
      "substrate_refinement",
      "substrate_support_exhausted",
      "substrate_confirmed",
    ],
  );
  assert.equal(events[3].graph_neutral, true);
  assert.equal(events[3].score_eligible, false);
  assert.equal(events[4].adequacy, "minimal");
});

test("resume after a previously offered seed records only the refinement and confirmation", async () => {
  const events = [
    ev("launch_attempt", { text: "I don't know." }),
    ev("substrate_seed_offered", {
      seed: "Try one small starting link in your own words.",
      graph_neutral: true,
      score_eligible: false,
    }),
  ];
  const prompt = makePrompt({
    substrate_refinement: "Vaccines give the body a safe preview.",
  });
  const ctx = makeCtx({ launchAttempt: "I don't know." });

  await handleSubstrateGate({
    events,
    prompt,
    ctx,
    options: {},
  });

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "launch_attempt",
      "substrate_seed_offered",
      "substrate_refinement",
      "substrate_confirmed",
    ],
  );
});
