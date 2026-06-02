import test from "node:test";
import assert from "node:assert/strict";

import { handleSubstrateGate } from "../../lib/seda/handlers/substrate-gate.mjs";
import { HANDLERS } from "../../lib/seda/handlers/index.mjs";

const ev = (type, extra = {}) => ({ type, ...extra });

function makeCtx(overrides = {}) {
  return {
    concept: "Immune memory",
    learnerGoal: "Explain vaccines",
    launchAttempt: "I don't know.",
    composerCta: null,
    section: (_key, label) => `[${label}]`,
    agentLookup: new Map([
      [
        "substrate_gate",
        {
          id: "substrate_gate",
          name: "Substrate Gate Agent",
          job: "Classify substrate.",
          required_outputs: ["substrate_adequate"],
          may_propose_events: ["substrate_confirmed"],
          truth_permission: "none",
          failure_mode_to_guard: "Treating substrate as evidence.",
        },
      ],
    ]),
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

function makeDecision({
  classification,
  adequate,
  seedText = null,
  refinementPrompt = null,
}) {
  return {
    contract_version: "substrate-gate-v1",
    classification,
    substrate_adequate: adequate,
    seed_text: seedText,
    refinement_prompt: refinementPrompt,
    judge_reason: `${classification} fixture`,
    graph_neutral: true,
    score_eligible: false,
  };
}

function makeBridge(decisions) {
  const calls = [];
  return {
    calls,
    callBridge: (action, payload) => {
      calls.push({ action, payload });
      const decision = decisions.shift();
      assert.ok(decision, "unexpected bridge call");
      return {
        substrate_gate: decision,
        llm_call: {
          provider: "fake",
          model: "fake-substrate-gate",
          latency_ms: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      };
    },
  };
}

test("HANDLERS registers substrate_gate phase", () => {
  assert.equal(HANDLERS.substrate_gate, handleSubstrateGate);
});

test("fast path confirms adequate substrate through the bridge without prompting or scoring", async () => {
  const events = [
    ev("launch_attempt", {
      text: "A vaccine gives a safe preview so immune memory responds faster later.",
    }),
  ];
  const prompt = makePrompt();
  const ctx = makeCtx();
  const bridge = makeBridge([
    makeDecision({ classification: "fast", adequate: true }),
  ]);

  const result = await handleSubstrateGate({
    events,
    bridge,
    prompt,
    ctx,
    options: {},
  });

  assert.equal(prompt.calls.length, 0);
  assert.equal(bridge.calls.length, 1);
  assert.equal(bridge.calls[0].action, "substrate-gate");
  assert.deepEqual(events.at(-1), {
    type: "substrate_confirmed",
    adequacy: "adequate",
    substrate_classification: "fast",
    judge_reason: "fast fixture",
    graph_neutral: true,
    score_eligible: false,
  });
  assert.equal(result.llm_calls.length, 1);
  assert.equal(result.llm_calls[0].agent_id, "substrate_gate");
  assert.equal(result.llm_calls[0].substrate_adequate, true);
});

test("slow path offers a seed, asks for refinement, and confirms adequate when bridge accepts refinement", async () => {
  const events = [ev("launch_attempt", { text: "I don't know." })];
  const prompt = makePrompt({
    substrate_refinement: "Vaccines give the body a safe preview.",
  });
  const ctx = makeCtx({ launchAttempt: "I don't know." });
  const bridge = makeBridge([
    makeDecision({
      classification: "slow",
      adequate: false,
      seedText: "A safe preview gives the body a pattern to notice.",
      refinementPrompt: "Add one starting link after the preview.",
    }),
    makeDecision({ classification: "fast", adequate: true }),
  ]);

  const result = await handleSubstrateGate({
    events,
    bridge,
    prompt,
    ctx,
    options: {},
  });

  assert.equal(bridge.calls.length, 2);
  assert.equal(bridge.calls[1].payload.substrate_refinement, "Vaccines give the body a safe preview.");
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
  assert.equal(events[1].seed, "A safe preview gives the body a pattern to notice.");
  assert.equal(events[2].text, "Vaccines give the body a safe preview.");
  assert.equal(events[2].graph_neutral, true);
  assert.equal(events[2].score_eligible, false);
  assert.equal(events[3].adequacy, "adequate");
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
    text:
      "A safe preview gives the body a pattern to notice.\n\n" +
      "Add one starting link after the preview.",
  });
  assert.equal(result.llm_calls.length, 2);
});

test("slow path records support exhaustion before confirming minimal adequacy after weak refinement", async () => {
  const events = [ev("launch_attempt", { text: "" })];
  const prompt = makePrompt({ substrate_refinement: "unsure" });
  const ctx = makeCtx({ launchAttempt: "" });
  const bridge = makeBridge([
    makeDecision({
      classification: "slow",
      adequate: false,
      seedText: "A safe preview gives the body a pattern to notice.",
      refinementPrompt: "Add one starting link after the preview.",
    }),
    makeDecision({ classification: "minimal", adequate: false }),
  ]);

  await handleSubstrateGate({
    events,
    bridge,
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
  assert.equal(events[4].graph_neutral, true);
  assert.equal(events[4].score_eligible, false);
});

test("resume after a previously offered seed records only refinement and confirmation", async () => {
  const events = [
    ev("launch_attempt", { text: "I don't know." }),
    ev("substrate_seed_offered", {
      seed: "Try one small starting link in your own words.",
      refinement_prompt: "Add one starting link in your own words.",
      graph_neutral: true,
      score_eligible: false,
    }),
  ];
  const prompt = makePrompt({
    substrate_refinement: "Vaccines give the body a safe preview.",
  });
  const ctx = makeCtx({ launchAttempt: "I don't know." });
  const bridge = makeBridge([
    makeDecision({ classification: "fast", adequate: true }),
  ]);

  await handleSubstrateGate({
    events,
    bridge,
    prompt,
    ctx,
    options: {},
  });

  assert.equal(bridge.calls.length, 1);
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
