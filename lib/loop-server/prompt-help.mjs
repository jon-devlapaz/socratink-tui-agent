import { isMetaLearnerFeatureEnabled } from "../seda/meta-command.mjs";

/** Shown at idle before the `>` prompt (loop transcript + TUI). */
export function idleStartupLine(options = {}) {
  const commands = ["/help"];
  if (isMetaLearnerFeatureEnabled(options.env)) {
    commands.push("/meta");
  }
  commands.push("/feedback <message>", "/exit");
  return `Pick a concept · ${commands.join(" · ")}`;
}

export const IDLE_STARTUP_LINE = idleStartupLine();

const PROMPT_HELP = {
  concept: {
    title: "Concept",
    body: 'What topic? One phrase is enough (e.g. "LLMs", "immune memory").',
  },
  learner_goal: {
    title: "Learner goal",
    body: "What do you want to explain? One sentence.",
  },
  launch_attempt: {
    title: "First try",
    body: "Try your first explanation. Messy is fine.",
  },
  substrate_refinement: {
    title: "Starting link",
    body:
      "Use the small seed to add one in-domain link in your own words. " +
      "Do not worry about the full answer yet.",
  },
  cold_attempt: {
    title: "First question",
    body:
      "Answer from memory in your own words. No notes.",
  },
  repair: {
    title: "Missing link",
    body: "Repair one missing link. /hint gives a small nudge.",
  },
  repair_dialogue_turns: {
    title: "Missing link",
    body: "Stay on the same missing link. /hint gives a small nudge.",
  },
  run_gap_drill: {
    title: "Transfer check",
    body: "Try using it somewhere new. Skipping is fine.",
  },
  gap_attempt: {
    title: "Transfer check",
    body: "Use it somewhere new in your own words.",
  },
  spaced_attempt: {
    title: "Memory check",
    body: "From memory, explain it again.",
  },
};

const DEFAULT_STEP_HELP = {
  title: "This step",
  body: "Answer in your own words. /help shows guidance for this prompt.",
};

/** Two lines at idle: journey + commands (loop and TUI). */
export function printIdleHelp(options = {}) {
  console.log(
    "[Help] Path: concept → goal → first try → memory answer → missing link.",
  );
  const commands = ["/help (this step)"];
  if (isMetaLearnerFeatureEnabled(options.env)) {
    commands.push("/meta (why this step)");
  }
  commands.push("/feedback <note>", "/exit", "/hint (repair only)");
  console.log(
    `[Help] Commands: ${commands.join(" · ")}. Sessions reset when we redeploy.`,
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
