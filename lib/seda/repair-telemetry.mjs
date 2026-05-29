import { agentCall } from "./agent-call.mjs";

export function repairPromptLlmCall(agentLookup) {
  return agentCall(agentLookup, "repair", {
    stage: "repair_prompt",
    provider: "orchestrator",
    model: "contract",
    latency_ms: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  });
}

export function repairDialogueJudgeLlmCall(agentLookup, dialogue, turnIndex) {
  return agentCall(agentLookup, "repair", {
    stage: "repair_dialogue",
    turn_index: turnIndex,
    ...dialogue.llm_call,
  });
}
