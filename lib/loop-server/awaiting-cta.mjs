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
    "What do you want to explain? One sentence.",
  launch_attempt:
    "Try your first explanation. Messy is fine.",
  run_gap_drill: "Try using it somewhere new?",
  gap_attempt: "Use it somewhere new.",
  spaced_attempt: "From memory, explain it again.",
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

  if (
    key === "continue" &&
    ctx?.coldEval?.agent_response &&
    ctx?.zeroSchemaCold !== true &&
    !ctx?.repairScaffold
  ) {
    enriched.ctaLabel = "Missing link";
    enriched.ctaText = ctx.coldEval.agent_response;
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
    enriched.ctaText = `${ctx.firstNode.learner_prompt}\n\nUse your own words. No notes.`;
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
