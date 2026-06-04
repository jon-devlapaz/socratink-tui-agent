/**
 * Composer-first CTA (Option F): full generative ask in the composer, not the transcript.
 */

const FORM_KEYS = new Set([
  "cmd",
  "continue",
  "concept",
  "learner_goal",
  "launch_attempt",
  "run_gap_drill",
  "gap_attempt",
  "spaced_attempt",
]);

const FORM_CTA_TEXT = {
  concept: "Pick a concept to test. One phrase is enough.",
  learner_goal:
    "What should you be able to explain by the end? One sentence is enough.",
  launch_attempt:
    "Sketch your current rough model before the map appears. This steers the route; it is not the scored answer.",
  run_gap_drill:
    "You just saw the model version. Press Return to choose the transfer check option shown in the prompt.",
  gap_attempt:
    "Try applying the idea in your own words after the model version.",
  spaced_attempt:
    "Durability check: explain the same idea again from memory after a pause.",
};

function cleanLabel(label) {
  return String(label ?? "")
    .replace(/:\s*$/, "")
    .trim();
}

export function enrichAwaiting(awaiting, ctx) {
  if (!awaiting) return null;

  const enriched = { ...awaiting };
  const key = awaiting.key;

  if (key === "cmd") {
    enriched.ctaLabel = null;
    enriched.ctaText = null;
    return enriched;
  }

  if (FORM_KEYS.has(key)) {
    enriched.ctaLabel = cleanLabel(awaiting.label) || null;
    enriched.ctaText = FORM_CTA_TEXT[key] || null;
    return enriched;
  }

  if (key === "substrate_refinement" && ctx?.composerCta?.text) {
    enriched.ctaLabel = ctx.composerCta.label || "Add a starting link";
    enriched.ctaText = ctx.composerCta.text;
    return enriched;
  }

  if (ctx?.composerCta?.text) {
    enriched.ctaLabel = ctx.composerCta.label || cleanLabel(awaiting.label) || null;
    enriched.ctaText = ctx.composerCta.text;
    return enriched;
  }

  if (key === "cold_attempt" && ctx?.firstNode?.learner_prompt) {
    enriched.ctaLabel = "Answer from memory";
    enriched.ctaText = `${ctx.firstNode.learner_prompt}\n\nThis is the first counted reconstruction for this question.`;
    return enriched;
  }

  if (
    (key === "repair" || key === "repair_dialogue_turns") &&
    ctx?.repairScaffold?.socratic_question
  ) {
    enriched.ctaLabel = cleanLabel(awaiting.label) || "Repair";
    enriched.ctaText = ctx.repairScaffold.socratic_question;
    return enriched;
  }

  if (key === "repair_recovery" && ctx?.repairState?.queuedPrompt) {
    enriched.ctaLabel = "Recovery";
    enriched.ctaText = ctx.repairState.queuedPrompt;
    return enriched;
  }

  enriched.ctaLabel = cleanLabel(awaiting.label) || null;
  enriched.ctaText = null;
  return enriched;
}
