export function decideBlankTurn({ turnIndex, maxRepairTurns }) {
  return {
    nextDialogueAction:
      turnIndex >= maxRepairTurns ? "abandon" : "recover_uncertainty",
  };
}

export function decideUncertainTurn({
  turnIndex,
  escalationLevel,
  uncertaintyRecoveryCount,
  maxUncertaintyRecoverySteps,
  maxRepairTurns,
}) {
  // First uncertainty at the direct prompt escalates once to the analogical
  // prompt; subsequent uncertainty descends the bounded recovery ladder
  // (Policy B) until it is exhausted or the turn cap is hit, then abandons.
  if (escalationLevel === 0 && turnIndex === 1) {
    return {
      action: "escalate",
      nextDialogueAction: "escalate",
      nextEscalationLevel: 1,
      nextUncertaintyRecoveryCount: uncertaintyRecoveryCount,
      ladderStage: "direct",
      ladderStep: 0,
    };
  }

  if (
    uncertaintyRecoveryCount < maxUncertaintyRecoverySteps &&
    turnIndex < maxRepairTurns
  ) {
    const nextCount = uncertaintyRecoveryCount + 1;
    return {
      action: "recover_uncertainty",
      nextDialogueAction: "recover_uncertainty",
      nextEscalationLevel: escalationLevel,
      nextUncertaintyRecoveryCount: nextCount,
      ladderStage:
        nextCount === 1 ? "bounded_causal_link" : "keyword_to_sentence",
      ladderStep: nextCount,
    };
  }

  return {
    action: "abandon",
    nextDialogueAction: "abandon",
    nextEscalationLevel: escalationLevel,
    nextUncertaintyRecoveryCount: uncertaintyRecoveryCount,
    ladderStage: "abandon",
    ladderStep: uncertaintyRecoveryCount,
  };
}

export function decidePostJudgeTurn({
  turnIndex,
  nextDialogueAction,
  maxRepairTurns,
  escalationLevel,
}) {
  if (
    nextDialogueAction === "abandon" ||
    turnIndex >= maxRepairTurns
  ) {
    return {
      closeRepairState: true,
      nextEscalationLevel: escalationLevel,
    };
  }

  return {
    closeRepairState: false,
    nextEscalationLevel: escalationLevel + 1,
  };
}
