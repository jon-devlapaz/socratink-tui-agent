import { TRAINING_NOW } from "../constants.mjs";
import { eventBuilders } from "../event-facts.mjs";

export async function handleIgnition({ events, store, prompt, ctx }) {
  console.log(ctx.section("ignition", "Starting point"));
  if (!ctx.concept) {
    ctx.concept = await prompt.ask("concept", "Concept: ");
  } else {
    console.log(`Concept: ${ctx.concept}`);
  }
  if (ctx.learnerGoal === null) {
    ctx.learnerGoal = await prompt.ask(
      "learner_goal",
      "Learner goal (optional): ",
    );
    events.push(eventBuilders.learnerGoalSet({
      learner_goal: ctx.learnerGoal,
    }));
  } else if (ctx.learnerGoal) {
    console.log(`Learner goal: ${ctx.learnerGoal}`);
  }
  if (ctx.launchAttempt === null) {
    const launchAttempt = await prompt.ask("launch_attempt", "First try: ");
    ctx.launchAttempt = launchAttempt;
  }
  const launchAttempt = ctx.launchAttempt;
  ctx.conceptId =
    ctx.concept
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "source-less-concept";
  await store.setProvenance(ctx.conceptId, {
    source_mode: "source_less",
    grounding: "learner_sketch",
    source_ref: null,
  });
  await store.setSketch(ctx.conceptId, {
    text: launchAttempt,
    at: TRAINING_NOW,
  });
  events.push(eventBuilders.launchAttempt({
    concept: ctx.concept,
    concept_id: ctx.conceptId,
    learner_goal: ctx.learnerGoal,
    text: launchAttempt,
  }));
  return {};
}
