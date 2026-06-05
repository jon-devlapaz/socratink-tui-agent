import { isMetaLearnerFeatureEnabled } from "../seda/meta-command.mjs";

/** Shown at idle before the `>` prompt (loop transcript + TUI). */
export function idleStartupLine(options = {}) {
  const commands = ["/help"];
  if (isMetaLearnerFeatureEnabled(options.env)) {
    commands.push("/meta");
  }
  commands.push("/feedback <message>", "/exit");
  return `Type a concept to explore · ${commands.join(" · ")}`;
}

export const IDLE_STARTUP_LINE = idleStartupLine();

const PROMPT_HELP = {
  concept: {
    title: "Concept",
    body: 'What topic? One phrase is enough (e.g. "LLMs", "immune memory").',
  },
  learner_goal: {
    title: "Learner goal",
    body: "What do you want to be able to explain? One sentence.",
  },
  launch_attempt: {
    title: "Launch attempt",
    body:
      "Your current rough explanation before the map appears. Messy is fine; this steers the route and is not counted as the scored answer.",
  },
  substrate_refinement: {
    title: "Starting link",
    body:
      "Use the small seed to add one in-domain link in your own words. " +
      "Do not worry about the full answer yet.",
  },
  cold_attempt: {
    title: "Cold attempt",
    body:
      "Answer from memory. No notes. This is the first counted reconstruction for this question.",
  },
  repair: {
    title: "Repair dialogue",
    body: "What had to happen in the middle? Your words. /hint if stuck (small nudge only).",
  },
  repair_dialogue_turns: {
    title: "Repair dialogue",
    body: "Stay on the same gap. What had to happen between the two situations? /hint for a small nudge.",
  },
  run_gap_drill: {
    title: "Post-bridge transfer check",
    body: "Optional: try applying the idea after the model. Skipping is fine.",
  },
  gap_attempt: {
    title: "Post-bridge transfer check",
    body: "Your words after what you saw—this does not mean you have it fully yet.",
  },
  spaced_attempt: {
    title: "Spaced re-drill",
    body:
      "Same idea again after a pause. This checks whether the explanation comes back without leaning on earlier wording.",
  },
};

const DEFAULT_STEP_HELP = {
  title: "This step",
  body: "Answer in your own words. /help shows guidance for this prompt.",
};

/** Two lines at idle: journey + commands (loop and TUI). */
export function printIdleHelp(options = {}) {
  console.log(
    "[Help] Path: concept → your goal → first explanation → draft map → answer from memory (repair if needed).",
  );
  const commands = ["/help (this step)"];
  if (isMetaLearnerFeatureEnabled(options.env)) {
    commands.push("/meta (why this step)");
  }
  commands.push("/feedback <note>", "/exit", "/hint (repair only)");
  console.log(
    `[Help] Commands: ${commands.join(" · ")}. Dogfood: map is a draft, not your grade; sessions reset when we redeploy.`,
  );
}

export function printPromptHelp(key, options = {}) {
  if (key === "cmd") {
    printIdleHelp(options);
    return;
  }
  const help = PROMPT_HELP[key] || DEFAULT_STEP_HELP;
  console.log(`[Help] ${help.title}: ${help.body}`);
}
