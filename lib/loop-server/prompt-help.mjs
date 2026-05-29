const PROMPT_HELP = {
  concept: {
    title: "Concept",
    body: "Name the idea you want Socratink to build a provisional route around.",
  },
  learner_goal: {
    title: "Learner goal",
    body: "Say what you want to explain or do with the concept. This shapes relevance, not graph evidence.",
  },
  launch_attempt: {
    title: "Launch attempt",
    body: "Write your current model before seeing any route. Rough, incomplete, and uncertain is useful.",
  },
  cold_attempt: {
    title: "Cold attempt",
    body: "Reconstruct the current node from memory. This exposes the gap before any answer material appears.",
  },
  repair: {
    title: "Repair dialogue",
    body: "Name the key process (hinge) that connects the starting situation to the outcome — in your own words. Type /hint anytime for a bounded nudge.",
  },
  repair_dialogue_turns: {
    title: "Repair dialogue",
    body: "Stay on the same bottleneck. What had to happen between the two situations you were asked about? Type /hint for adaptive support.",
  },
  cmd: {
    title: "Idle",
    body: "Type a concept to start, /help for commands, /feedback <message> to contact the team, or /exit to end the session.",
  },
  run_gap_drill: {
    title: "Post-bridge transfer check",
    body: "Choose whether to do a small graph-neutral transfer check after seeing the model bridge.",
  },
  gap_attempt: {
    title: "Post-bridge transfer check",
    body: "Apply the repaired link after comparison material. This keeps the link active but does not prove mastery.",
  },
  spaced_attempt: {
    title: "Spaced re-drill",
    body: "Reconstruct the mechanism again after spacing. Only spaced strong reconstruction can derive solidified.",
  },
};

export function printPromptHelp(key) {
  const help = PROMPT_HELP[key] || {
    title: "This step",
    body: "Answer in your own words. Type /help at any prompt to see this guidance.",
  };
  console.log(`[Help] ${help.title}: ${help.body}`);
}
