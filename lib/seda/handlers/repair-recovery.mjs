import {
  buildRepairDialogueBridgeArgs,
  recoveryNextActionText,
  repairDialogueEvent,
} from "../repair-dialogue-helpers.mjs";
import {
  callBridgeSafely,
  invalidBridgeError,
  resultToBridgeError,
  validateRepairDialoguePayload,
} from "../bridge-fail-closed.mjs";
import { eventBuilders } from "../event-facts.mjs";
import { REPAIR_RECOVERY_POLICY_VERSION } from "../repair-recovery-config.mjs";
import { repairDialogueJudgeLlmCall } from "../repair-telemetry.mjs";

export async function handleRepairRecovery({ events, bridge, prompt, options, ctx }) {
  console.log("");
  console.log(ctx.section("repair", "Recovery"));
  console.log("Let's try one short recovery attempt.");
  const repairText = await prompt.ask("repair_recovery", "One recovery try: ");
  const turnIndex =
    events.filter((event) => event.type === "repair_dialogue_turn").length + 1;

  if (!repairText.trim()) {
    console.log("No problem. We can pause here — come back when you're ready.");
    console.log(recoveryNextActionText(ctx.repairScaffold));
    events.push(eventBuilders.repairRecoveryTurn({
      turn_index: 1,
      learner_text: "",
      judge_next_action: "abandon_recovery",
      progression_state: "no_change",
      improvement_observed: false,
      improvement_note: "No learner text submitted during recovery turn.",
      concept_id: ctx.conceptId,
      kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
      policy_version: REPAIR_RECOVERY_POLICY_VERSION,
    }));
    events.push(eventBuilders.repairRecoveryClosed({
      outcome: "idle_return",
      next_phase: "idle",
      learner_next_action: recoveryNextActionText(ctx.repairScaffold),
      concept_id: ctx.conceptId,
      kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
      policy_version: REPAIR_RECOVERY_POLICY_VERSION,
    }));
    return { llm_calls: [] };
  }

  const dialogueResult = callBridgeSafely({
    bridge,
    action: "repair-dialogue",
    payload: buildRepairDialogueBridgeArgs(ctx, repairText, turnIndex, options),
  });
  if (!dialogueResult.ok) {
    events.push(
      resultToBridgeError({
        result: dialogueResult,
        action: "repair-dialogue",
        phase: "repair_recovery",
      }),
    );
    return { llm_calls: [] };
  }
  const dialogue = dialogueResult.payload;
  const invalid = validateRepairDialoguePayload(dialogue);
  if (invalid) {
    events.push(
      invalidBridgeError({
        action: "repair-dialogue",
        phase: "repair_recovery",
        reason: invalid,
      }),
    );
    return { llm_calls: [] };
  }
  const judge = dialogue.repair_dialogue;
  const recoveryTurn = eventBuilders.repairRecoveryTurn({
    turn_index: 1,
    learner_text: repairText,
    judge_next_action: judge.bridge_ready ? "resume_repair" : "abandon_recovery",
    progression_state: judge.bridge_ready
      ? "ready"
      : judge.improvement_observed
        ? "improved"
        : "no_change",
    improvement_observed: Boolean(judge.improvement_observed),
    improvement_note:
      judge.improvement_note || "Recovery turn did not produce a bridge-ready link.",
    concept_id: ctx.conceptId,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
    policy_version: REPAIR_RECOVERY_POLICY_VERSION,
  });
  events.push(recoveryTurn);

  const recoveryCall = repairDialogueJudgeLlmCall(
    ctx.agentLookup,
    dialogue,
    turnIndex,
  );

  if (judge.bridge_ready) {
    const rde = repairDialogueEvent({
      gapId: ctx.gapId,
      turnIndex,
      repairText,
      repairScaffold: ctx.repairScaffold,
      judge,
      kcId: ctx.firstNode.kc_id || ctx.firstNode.id,
    });
    events.push(rde);
    events.push(eventBuilders.repairRecoveryClosed({
      outcome: "recovered",
      next_phase: "repair",
      concept_id: ctx.conceptId,
      kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
      policy_version: REPAIR_RECOVERY_POLICY_VERSION,
    }));
    console.log("Recovery worked. Continuing with your repaired link.");
    return { llm_calls: [recoveryCall] };
  }

  events.push(eventBuilders.repairRecoveryClosed({
    outcome: "reabandoned",
    next_phase: "idle",
    learner_next_action: recoveryNextActionText(ctx.repairScaffold),
    concept_id: ctx.conceptId,
    kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
    policy_version: REPAIR_RECOVERY_POLICY_VERSION,
  }));
  console.log("We'll pause here. You can return and try again when you're ready.");
  console.log(recoveryNextActionText(ctx.repairScaffold));
  return { llm_calls: [recoveryCall] };
}
