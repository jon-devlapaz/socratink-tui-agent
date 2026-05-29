import { TRAINING_NOW } from "../constants.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handleStrongColdPath({ events, derived, store, ctx }) {
  console.log("");
  console.log(ctx.section("evidence", "Strong Cold Path"));
  console.log(
    "Repair skipped for now. The graph still waits for spaced reconstruction before solidified.",
  );
  events.push({
    type: "strong_cold_path",
    reason: "cold_reconstruction_solid",
    graph_neutral: true,
    next_step: "spaced_redrill",
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
  });
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
