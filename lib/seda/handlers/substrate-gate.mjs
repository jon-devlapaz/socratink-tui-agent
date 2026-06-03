import { agentCall } from "../agent-call.mjs";

const DEFAULT_SUBSTRATE_SEED =
  "Try one small starting link in your own words.";
const DEFAULT_REFINEMENT_PROMPT =
  "Add one starting link in your own words.";

function clean(text) {
  return String(text ?? "").trim();
}

function graphNeutral(extra = {}) {
  return {
    ...extra,
    graph_neutral: true,
    score_eligible: false,
  };
}

function substrateConfirmedEvent(adequacy, decision = {}) {
  return graphNeutral({
    type: "substrate_confirmed",
    adequacy,
    substrate_classification: decision.classification || null,
    judge_reason: decision.judge_reason || "",
  });
}

function lastLaunchAttempt(events, ctx) {
  return clean(
    events.findLast((event) => event.type === "launch_attempt")?.text ??
      ctx.launchAttempt ??
      "",
  );
}

function hasEvent(events, type) {
  return events.some((event) => event.type === type);
}

function latestEvent(events, type) {
  return events.findLast((event) => event.type === type);
}

function callSubstrateBridge({
  bridge,
  ctx,
  options,
  launchText,
  seedOffered,
  refinementText = "",
}) {
  const payload = bridge.callBridge("substrate-gate", {
    concept: ctx.concept,
    learner_goal: ctx.learnerGoal || null,
    launch_attempt: launchText,
    substrate_refinement: refinementText || null,
    seed_already_offered: seedOffered,
    log_raw_llm: options.logRawLlm,
  });
  const decision = payload.substrate_gate;
  if (!decision || typeof decision.substrate_adequate !== "boolean") {
    throw new Error("invalid-substrate-gate-response");
  }
  return { decision, llmCall: payload.llm_call || {} };
}

function substrateLlmCall(ctx, llmCall, decision, stage) {
  return agentCall(ctx.agentLookup, "substrate_gate", {
    stage,
    substrate_classification: decision.classification || null,
    substrate_adequate: Boolean(decision.substrate_adequate),
    graph_neutral: true,
    score_eligible: false,
    ...llmCall,
  });
}

function appendSeed(events, decision) {
  const seed = clean(decision.seed_text) || DEFAULT_SUBSTRATE_SEED;
  const refinementPrompt =
    clean(decision.refinement_prompt) || DEFAULT_REFINEMENT_PROMPT;
  events.push(
    graphNeutral({
      type: "substrate_seed_offered",
      seed,
      refinement_prompt: refinementPrompt,
      substrate_classification: decision.classification || "slow",
      judge_reason: decision.judge_reason || "",
    }),
  );
  return { seed, refinementPrompt };
}

function appendSupportExhausted(events, decision) {
  if (hasEvent(events, "substrate_support_exhausted")) return;
  events.push(
    graphNeutral({
      type: "substrate_support_exhausted",
      reason: "weak_substrate_refinement",
      substrate_classification: decision.classification || "minimal",
      judge_reason: decision.judge_reason || "",
    }),
  );
}

function substrateComposerText(seedText, refinementPrompt) {
  return `${seedText}\n\n${refinementPrompt}`;
}

/**
 * Bridge-backed substrate gate. The bridge judges adequacy; this handler owns
 * the hybrid policy cap: one seed, one refinement, then conservative routing.
 */
export async function handleSubstrateGate({
  events,
  bridge,
  prompt,
  ctx,
  options = {},
}) {
  console.log("");
  console.log(ctx.section("substrate", "Substrate Gate"));

  const llmCalls = [];
  const launchText = lastLaunchAttempt(events, ctx);
  const seedEvent = latestEvent(events, "substrate_seed_offered");
  let refinementEvent = latestEvent(events, "substrate_refinement");

  if (!seedEvent && !refinementEvent) {
    const { decision, llmCall } = callSubstrateBridge({
      bridge,
      ctx,
      options,
      launchText,
      seedOffered: false,
    });
    llmCalls.push(
      substrateLlmCall(ctx, llmCall, decision, "substrate_launch_gate"),
    );
    if (decision.substrate_adequate) {
      events.push(substrateConfirmedEvent("adequate", decision));
      return { llm_calls: llmCalls };
    }
    appendSeed(events, decision);
  }

  const activeSeed = latestEvent(events, "substrate_seed_offered");
  const seedText = clean(activeSeed?.seed) || DEFAULT_SUBSTRATE_SEED;
  const refinementPrompt =
    clean(activeSeed?.refinement_prompt) || DEFAULT_REFINEMENT_PROMPT;
  ctx.composerCta = {
    label: "Add a starting link",
    text: substrateComposerText(seedText, refinementPrompt),
  };
  if (!options.loopUi) {
    console.log(seedText);
  }

  if (!refinementEvent) {
    const refinement = await prompt.ask(
      "substrate_refinement",
      "Substrate refinement: ",
    );
    events.push(
      graphNeutral({
        type: "substrate_refinement",
        text: refinement,
      }),
    );
    refinementEvent = latestEvent(events, "substrate_refinement");
  }

  const { decision, llmCall } = callSubstrateBridge({
    bridge,
    ctx,
    options,
    launchText,
    seedOffered: true,
    refinementText: refinementEvent?.text || "",
  });
  llmCalls.push(
    substrateLlmCall(ctx, llmCall, decision, "substrate_refinement_gate"),
  );

  if (decision.substrate_adequate) {
    events.push(substrateConfirmedEvent("adequate", decision));
    return { llm_calls: llmCalls };
  }

  appendSupportExhausted(events, decision);
  events.push(substrateConfirmedEvent("minimal", decision));
  return { llm_calls: llmCalls };
}
