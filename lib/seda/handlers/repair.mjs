import { REPAIR_AT, TRAINING_NOW } from "../constants.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handleRepair({ events, derived, store, ctx }) {
  const lastTurn = events.findLast((e) => e.type === "repair_dialogue_turn");
  const repairText = lastTurn?.text || "";
  await store.appendRepair(ctx.conceptId, ctx.firstNode.id, {
    id: "repair-1",
    at: REPAIR_AT,
    text: repairText,
  });
  events.push({
    type: "repair",
    text: repairText,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
    graph_neutral: true,
  });
  derived.push({
    event: "repair",
    ...summarizeTraining(
      await store.loadTraining(ctx.conceptId),
      ctx.nodeIds,
      TRAINING_NOW,
    ),
  });
  return {};
}
