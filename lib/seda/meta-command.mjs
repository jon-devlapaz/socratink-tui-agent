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
    "Say what you want to be able to explain. This steers the route, but it is not graded.",
  launch_attempt:
    "Give your current rough explanation before the map appears. Messy is useful because it shows what you can already build from memory.",
  substrate_refinement:
    "Use the small starting seed to add one link in your own words. The seed helps you begin; your line is still not counted as the scored answer.",
  cold_attempt:
    "Answer from memory before seeing study material. This is the first counted reconstruction for this question.",
  repair:
    "You are rebuilding one missing middle step. Short and causal is better than polished.",
  repair_dialogue_turns:
    "Stay on the same missing middle step. The goal is to make the link in your own words before the model version appears.",
  repair_recovery:
    "This is a lower-load repair step. Make one small link; do not try to cover the whole concept.",
  run_gap_drill:
    "You just saw the model version. Choose whether to try a quick transfer check in your own words.",
  gap_attempt:
    "Use the idea after seeing the model version. This checks transfer, not memorized wording.",
  spaced_attempt:
    "This is the durability check. Try the idea again from memory after a pause.",
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
  const event = {
    type: "meta_turn",
    phase: key,
    graph_neutral: true,
    score_eligible: false,
    intent: "explain_current_move",
    response_kind: "phase_explainer",
    response,
  };
  events.push(event);
  console.log(`[Meta] ${response}`);
  return event;
}
