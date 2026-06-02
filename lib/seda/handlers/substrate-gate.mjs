const SUBSTRATE_SEED =
  "Try one small starting link in your own words.";

const UNKNOWN_RE = /^(i\s+do\s*n't\s+know|i\s+dont\s+know|don\s*'?t\s+know|unsure|not\s+sure|no\s+idea)$/i;
const PROCESS_RE =
  /\b(because|so|therefore|which|that|when|after|before|then|leads?\s+to|causes?|triggers?|enables?)\b/i;

function words(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function clean(text) {
  return String(text ?? "").trim();
}

function isWeakSubstrateText(text) {
  const trimmed = clean(text);
  if (!trimmed) return true;
  if (UNKNOWN_RE.test(trimmed.replace(/[.!?]+$/g, ""))) return true;
  return words(trimmed).length <= 3;
}

export function classifySubstrateLaunch(text) {
  const trimmed = clean(text);
  if (isWeakSubstrateText(trimmed)) return "slow";
  const wordCount = words(trimmed).length;
  const clauses = trimmed.split(
    /[,. ;:]|\s+(?:because|so|then|which|that)\s+/i,
  );
  if (
    wordCount >= 12 &&
    clauses.filter((part) => clean(part)).length >= 2 &&
    PROCESS_RE.test(trimmed)
  ) {
    return "fast";
  }
  return "slow";
}

function substrateConfirmedEvent(adequacy) {
  return {
    type: "substrate_confirmed",
    adequacy,
    graph_neutral: true,
    score_eligible: false,
  };
}

function lastLaunchAttempt(events, ctx) {
  return (
    events.findLast((event) => event.type === "launch_attempt")?.text ??
    ctx.launchAttempt ??
    ""
  );
}

function hasEvent(events, type) {
  return events.some((event) => event.type === type);
}

/**
 * Lane 1 substrate gate stub. It does not call the bridge, append training
 * attempts, or mutate graph truth. No ctx.substrateGateState is needed here:
 * seed/refinement progress is fully reconstructable from graph-neutral events.
 */
export async function handleSubstrateGate({ events, prompt, ctx, options = {} }) {
  console.log("");
  console.log(ctx.section("substrate", "Substrate Gate"));

  const launchText = lastLaunchAttempt(events, ctx);
  const seedOffered = hasEvent(events, "substrate_seed_offered");
  const refinementEvent = events.findLast(
    (event) => event.type === "substrate_refinement",
  );

  if (
    !seedOffered &&
    !refinementEvent &&
    classifySubstrateLaunch(launchText) === "fast"
  ) {
    events.push(substrateConfirmedEvent("adequate"));
    return { llm_calls: [] };
  }

  if (!seedOffered) {
    events.push({
      type: "substrate_seed_offered",
      seed: SUBSTRATE_SEED,
      graph_neutral: true,
      score_eligible: false,
    });
  }

  ctx.composerCta = {
    label: "Add a starting link",
    text: SUBSTRATE_SEED,
  };
  if (!options.loopUi) {
    console.log(SUBSTRATE_SEED);
  }

  const refinement =
    refinementEvent?.text ??
    (await prompt.ask("substrate_refinement", "Substrate refinement: "));

  if (!refinementEvent) {
    events.push({
      type: "substrate_refinement",
      text: refinement,
      graph_neutral: true,
      score_eligible: false,
    });
  }

  if (isWeakSubstrateText(refinement)) {
    if (!hasEvent(events, "substrate_support_exhausted")) {
      events.push({
        type: "substrate_support_exhausted",
        reason: "weak_substrate_refinement",
        graph_neutral: true,
        score_eligible: false,
      });
    }
    events.push(substrateConfirmedEvent("minimal"));
    return { llm_calls: [] };
  }

  const adequacy =
    classifySubstrateLaunch(refinement) === "fast" ? "adequate" : "minimal";
  events.push(substrateConfirmedEvent(adequacy));
  return { llm_calls: [] };
}
