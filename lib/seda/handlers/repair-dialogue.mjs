import {
  decideBlankTurn,
  decidePostJudgeTurn,
  decideUncertainTurn,
} from "../repair-policy.mjs";
import { isHintCommand } from "../prompt-commands.mjs";
import {
  callBridgeSafely,
  invalidBridgeError,
  resultToBridgeError,
  validateRepairDialoguePayload,
} from "../bridge-fail-closed.mjs";
import { eventBuilders } from "../event-facts.mjs";
import { MAX_REPAIR_TURNS } from "../next-phase.mjs";
import {
  buildRepairDialogueBridgeArgs,
  chooseRepairHintLevel,
  isBlankRepair,
  isUncertainRepair,
  missingOperationFeedback,
  repairDialogueEvent,
  repairHintText,
  repairNudge,
  repairStateSnapshot,
  repairTurnLabel,
  uncertaintyDialogueTurnEvent,
  uncertaintyRecoveryPrompt,
} from "../repair-dialogue-helpers.mjs";
import { MAX_UNCERTAINTY_RECOVERY_STEPS } from "../repair-recovery-config.mjs";
import {
  repairDialogueJudgeLlmCall,
  repairPromptLlmCall,
} from "../repair-telemetry.mjs";

export async function handleRepairDialogue({ events, bridge, prompt, options, ctx }) {
  const state = ctx.repairState;
  let lastDialogueTurn = events.findLast((e) => e.type === "repair_dialogue_turn");
  if (lastDialogueTurn?.bridge_ready) {
    // Safety guard: never render another dialogue prompt after readiness.
    ctx.repairState = null;
    return { llm_calls: [] };
  }
  const turnIndex = state.turnIndex + 1;
  const isFirstTurn = state.isFirstTurn;
  const sessionLlmCalls = isFirstTurn
    ? [repairPromptLlmCall(ctx.agentLookup)]
    : [];

  if (isFirstTurn) {
    console.log("");
    console.log(ctx.section("repair", "Own-Words Repair"));
  }
  console.log(ctx.section("repair", "Repair Dialogue"));

  let promptToShow;
  if (state.queuedPrompt) {
    promptToShow = state.queuedPrompt;
    state.queuedPrompt = null;
  } else if (state.escalationLevel === 0) {
    promptToShow = ctx.repairScaffold.socratic_question;
  } else if (state.escalationLevel === 1) {
    promptToShow =
      ctx.repairScaffold.analogical_prompt ||
      ctx.repairScaffold.socratic_question;
  } else {
    promptToShow =
      ctx.repairScaffold.micro_scaffold_prompt ||
      "Try the same missing link again";
  }

  const repairKey = ctx.scripted?.repair_dialogue_turns
    ? "repair_dialogue_turns"
    : "repair";
  const turnLabel = repairTurnLabel(turnIndex);
  const label = `${turnLabel}: `;
  ctx.composerCta = {
    label: turnLabel,
    text: promptToShow || "",
  };
  let repair = "";
  while (true) {
    const repairInput = await prompt.ask(repairKey, label);
    if (isHintCommand(repairInput)) {
      const hintLevel = chooseRepairHintLevel({
        state,
        turnIndex,
        lastDialogueTurn,
      });
      state.hintCount += 1;
      state.lastHintLevel = hintLevel;
      console.log(ctx.section("repair", "Hint"));
      console.log(repairHintText(ctx.repairScaffold, hintLevel));
      events.push(eventBuilders.repairHintRequested({
        turn_index: turnIndex,
        text: repairInput,
        hint_level: hintLevel,
        hint_count: state.hintCount,
        next_dialogue_action: "retry_after_hint",
        kc_id: ctx.firstNode.kc_id || ctx.firstNode.id,
        gap_id: ctx.gapId,
        repair_state: repairStateSnapshot(state),
      }));
      lastDialogueTurn = events.findLast((e) => e.type === "repair_dialogue_turn");
      continue;
    }
    repair = repairInput;
    break;
  }
  state.turnIndex = turnIndex;
  if (isBlankRepair(repair)) {
    const blankDecision = decideBlankTurn({
      turnIndex,
      maxRepairTurns: MAX_REPAIR_TURNS,
    });
    console.log(
      "I didn't catch an answer. One short guess is enough, even if you're unsure.",
    );
    events.push(
      uncertaintyDialogueTurnEvent({
        turnIndex,
        text: "",
        nextDialogueAction: blankDecision.nextDialogueAction,
        uncertaintyType: "blank",
        ladderStage: "blank_submission",
        ladderStep: state.uncertaintyRecoveryCount,
        ladderPolicyVersion: state.ladderPolicyVersion,
        kcId: ctx.firstNode.kc_id || ctx.firstNode.id,
        judgeReason: "No learner text submitted on this turn.",
        repairState: state,
      }),
    );
    state.isFirstTurn = false;
    return { llm_calls: sessionLlmCalls };
  }

  if (isUncertainRepair(repair)) {
    const uncertainDecision = decideUncertainTurn({
      turnIndex,
      escalationLevel: state.escalationLevel,
      uncertaintyRecoveryCount: state.uncertaintyRecoveryCount,
      maxUncertaintyRecoverySteps: MAX_UNCERTAINTY_RECOVERY_STEPS,
      maxRepairTurns: MAX_REPAIR_TURNS,
    });
    const turnEvent = uncertaintyDialogueTurnEvent({
      turnIndex,
      text: repair,
      nextDialogueAction: uncertainDecision.nextDialogueAction,
      ladderStage: uncertainDecision.ladderStage,
      ladderStep: uncertainDecision.ladderStep,
      ladderPolicyVersion: state.ladderPolicyVersion,
      kcId: ctx.firstNode.kc_id || ctx.firstNode.id,
      repairState: state,
    });
    if (uncertainDecision.action === "escalate") {
      console.log(ctx.section("repair", "Escalating"));
      console.log(
        "Uncertainty at direct prompt \u2014 trying a different approach.",
      );
      state.escalationLevel = uncertainDecision.nextEscalationLevel;
      state.isFirstTurn = false;
      events.push(turnEvent);
      return { llm_calls: sessionLlmCalls };
    }
    if (uncertainDecision.action === "recover_uncertainty") {
      state.uncertaintyRecoveryCount =
        uncertainDecision.nextUncertaintyRecoveryCount;
      state.queuedPrompt = uncertaintyRecoveryPrompt(
        ctx.repairScaffold,
        state.uncertaintyRecoveryCount,
      );
      state.isFirstTurn = false;
      events.push(turnEvent);
      return { llm_calls: sessionLlmCalls };
    }
    events.push(turnEvent);
    ctx.repairState = null;
    return { llm_calls: sessionLlmCalls };
  }

  const dialogueResult = callBridgeSafely({
    bridge,
    action: "repair-dialogue",
    payload: buildRepairDialogueBridgeArgs(ctx, repair, turnIndex, options),
  });
  if (!dialogueResult.ok) {
    events.push(
      resultToBridgeError({
        result: dialogueResult,
        action: "repair-dialogue",
        phase: "repair_dialogue",
      }),
    );
    ctx.repairState = null;
    return { llm_calls: sessionLlmCalls };
  }
  const dialogue = dialogueResult.payload;
  const invalid = validateRepairDialoguePayload(dialogue);
  if (invalid) {
    events.push(
      invalidBridgeError({
        action: "repair-dialogue",
        phase: "repair_dialogue",
        reason: invalid,
      }),
    );
    ctx.repairState = null;
    return { llm_calls: sessionLlmCalls };
  }
  const judge = dialogue.repair_dialogue;
  sessionLlmCalls.push(
    repairDialogueJudgeLlmCall(ctx.agentLookup, dialogue, turnIndex),
  );

  const rde = repairDialogueEvent({
    gapId: ctx.gapId,
    turnIndex,
    repairText: repair,
    repairScaffold: ctx.repairScaffold,
    judge,
    repairState: state,
    kcId: ctx.firstNode.kc_id || ctx.firstNode.id,
  });

  console.log(`Bridge readiness: ${judge.bridge_ready ? "ready" : "not yet"}`);
  console.log(judge.judge_reason);
  if (!judge.bridge_ready) {
    if (judge.next_prompt) {
      ctx.composerCta = {
        label: turnLabel,
        text: judge.next_prompt,
      };
      if (!options.loopUi) console.log(judge.next_prompt);
    } else {
      const feedback = missingOperationFeedback(ctx.repairScaffold, judge);
      if (feedback) console.log(feedback);
    }
    const nudge = repairNudge(turnIndex, state, judge);
    if (nudge) console.log(nudge);
  }

  if (judge.bridge_ready) {
    events.push(rde);
    ctx.repairState = null;
    return { llm_calls: sessionLlmCalls };
  }

  events.push(rde);
  const postJudgeDecision = decidePostJudgeTurn({
    turnIndex,
    nextDialogueAction: judge.next_dialogue_action,
    maxRepairTurns: MAX_REPAIR_TURNS,
    escalationLevel: state.escalationLevel,
  });
  if (judge.next_prompt) state.queuedPrompt = judge.next_prompt;

  if (postJudgeDecision.closeRepairState) {
    ctx.repairState = null;
    return { llm_calls: sessionLlmCalls };
  }

  state.escalationLevel = postJudgeDecision.nextEscalationLevel;
  state.isFirstTurn = false;
  return { llm_calls: sessionLlmCalls };
}
