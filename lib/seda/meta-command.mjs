import { eventBuilders } from "./event-facts.mjs";

const INTERNAL_TERMS = [
  "primed",
  "solidified",
  "graph-neutral",
  "kc_id",
  "node",
  "evidence candidate",
  "repair_dialogue_turn",
  "substrate_gate",
];

const ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

const META_COPY = {
  cmd:
    "You are between runs. Pick a concept, give a rough goal, or leave feedback. Nothing here is counted as an answer.",
  concept:
    "Name the topic you want to test. One phrase is enough; the loop will ask for your own rough model next.",
  learner_goal:
    "Say what you want to explain. This steers the route, but it is not graded.",
  launch_attempt:
    "Try your first explanation. Messy is useful.",
  substrate_refinement:
    "Use the small starting seed to add one link in your own words. The seed helps you begin; your line is still not counted as the scored answer.",
  cold_attempt:
    "Answer from memory before seeing the model answer.",
  repair:
    "Repair one missing link. Short and causal is better than polished.",
  repair_dialogue_turns:
    "Stay on the same missing link. Make it in your own words before the model answer.",
  repair_recovery:
    "This is a lower-load repair step. Make one small link; do not try to cover the whole concept.",
  run_gap_drill:
    "You just saw the model answer. Try using it somewhere new.",
  gap_attempt:
    "Use it somewhere new. This checks transfer, not memorized wording.",
  spaced_attempt:
    "From memory, explain it again after a pause.",
};

export function metaResponseForPrompt(key) {
  return META_COPY[key] || "This step asks for your own words. A rough causal link is enough.";
}

export function isMetaLearnerFeatureEnabled(env = process.env) {
  return ENABLED_VALUES.has(
    String(env?.SOCRATINK_TUI_META_COMMAND || "")
      .trim()
      .toLowerCase(),
  );
}

export function assertMetaCopySafe(text) {
  const lower = String(text || "").toLowerCase();
  const leaked = INTERNAL_TERMS.find((term) => lower.includes(term));
  if (leaked) {
    throw new Error(`meta-copy-leaks-internal-term:${leaked}`);
  }
}

export function appendMetaTurn(events, key, options = {}) {
  if (!isMetaLearnerFeatureEnabled(options.env)) {
    return null;
  }
  const response = metaResponseForPrompt(key);
  assertMetaCopySafe(response);
  const event = eventBuilders.metaTurn({
    phase: key,
    intent: "explain_current_move",
    response_kind: "phase_explainer",
    response,
  });
  events.push(event);
  console.log(`[Meta] ${response}`);
  return event;
}
