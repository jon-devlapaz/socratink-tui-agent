import { agentCall } from "../agent-call.mjs";
import { TRAINING_NOW } from "../constants.mjs";
import { summarizeTraining } from "../training-summary.mjs";

export async function handleModelBridge({ events, derived, store, ctx }) {
  console.log("");
  console.log(ctx.section("study", "Model Bridge"));
  const mdlCall = agentCall(ctx.agentLookup, "model_bridge", {
    stage: "model_bridge",
    provider: "orchestrator",
    model: "contract",
    latency_ms: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  });
  console.log(ctx.firstNode.mechanism);
  events.push({
    type: "model_bridge",
    text: ctx.firstNode.mechanism,
    graph_neutral: true,
  });
  derived.push({
    event: "model_bridge",
    ...summarizeTraining(
      await store.loadTraining(ctx.conceptId),
      ctx.nodeIds,
      TRAINING_NOW,
    ),
  });
  return { llm_calls: [mdlCall] };
}
