import { FINAL_NOW, SPACED_AT, TRAINING_NOW } from "../constants.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handleSpacing({ events, derived, store, ctx }) {
  console.log("");
  console.log(ctx.section("spacing", "Spacing"));
  console.log("Spacing advanced: 20 hours");
  events.push({ type: "spacing_advanced", from: TRAINING_NOW, to: SPACED_AT });
  derived.push({
    event: "spacing_advanced",
    ...summarizeTraining(
      await store.loadTraining(ctx.conceptId),
      ctx.nodeIds,
      FINAL_NOW,
    ),
  });
  return {};
}
