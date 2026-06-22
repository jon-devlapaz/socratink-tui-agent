import { TRAINING_NOW } from "../constants.mjs";
import { eventBuilders } from "../event-facts.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handleStrongColdPath({ events, derived, store, ctx }) {
  console.log("");
  console.log(ctx.section("evidence", "Strong Cold Path"));
  console.log(
    "Repair skipped for now. Memory check still has to come back later.",
  );
  events.push(eventBuilders.strongColdPath({
    reason: "cold_reconstruction_solid",
    next_step: "spaced_redrill",
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
  }));
  derived.push({
    event: "strong_cold_path",
    ...summarizeTraining(
      await store.loadTraining(ctx.conceptId),
      ctx.nodeIds,
      TRAINING_NOW,
    ),
  });
  return {};
}
