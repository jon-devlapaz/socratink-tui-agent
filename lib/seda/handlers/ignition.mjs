import { TRAINING_NOW } from "../constants.mjs";

export async function handleIgnition({ events, store, prompt, ctx }) {
  console.log(ctx.section("ignition", "Ignition"));
  if (!ctx.concept) {
    ctx.concept = await prompt.ask("concept", "Concept: ");
  } else {
    console.log(`Concept: ${ctx.concept}`);
  }
  ctx.learnerGoal = await prompt.ask(
    "learner_goal",
    "Learner goal (optional): ",
  );
  const launchAttempt = await prompt.ask("launch_attempt", "Launch attempt: ");
  ctx.launchAttempt = launchAttempt;
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
  events.push({ type: "launch_attempt", text: launchAttempt });
  return {};
}
