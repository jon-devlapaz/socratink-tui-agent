import { REPAIR_AT, TRAINING_NOW } from "../constants.mjs";
import { bridgeErrorEvent } from "../bridge-fail-closed.mjs";
import { eventBuilders } from "../event-facts.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handleRepair({ events, derived, store, ctx }) {
  const lastTurn = events.findLast((e) => e.type === "repair_dialogue_turn");
  if (!lastTurn?.bridge_ready) {
    events.push(
      bridgeErrorEvent({
        action: "repair-dialogue",
        phase: "repair",
        error: "BridgeReadinessMissing",
        message: "repair requires a valid bridge_ready repair dialogue turn",
      }),
    );
    return {};
  }
  const repairText = lastTurn?.text || "";
  await store.appendRepair(ctx.conceptId, ctx.firstNode.id, {
    id: "repair-1",
    at: REPAIR_AT,
    text: repairText,
  });
  events.push(eventBuilders.repair({
    text: repairText,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
  }));
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
