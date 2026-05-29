export function isUncertainRepair(text) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "");
  if (!normalized) return true;
  return [
    "i am not sure",
    "i'm not sure",
    "idk",
    "not sure",
    "i do not know",
    "i don't know",
    "dont know",
    "don't know",
    "no idea",
    "unsure",
  ].includes(normalized);
}

export function isBlankRepair(text) {
  return String(text || "").trim().length === 0;
}

function hingeLabel(repairScaffold) {
  return (
    repairScaffold?.hinge_focus ||
    repairScaffold?.missing_operation ||
    "the key process"
  );
}

export function uncertaintyRecoveryPrompt(repairScaffold, step) {
  const hinge = hingeLabel(repairScaffold);
  if (step === 1) {
    return `That's okay. In one sentence, explain what has to happen — ${hinge} — in your own words.`;
  }
  return `Last try before we pause: give 3 keywords for ${hinge}, then write one sentence using them.`;
}

export function repairTurnLabel(turnIndex) {
  if (turnIndex <= 1) return "Fill the missing link";
  if (turnIndex <= 3) return "Try the missing link again";
  return "One more try";
}

export function repairNudge(turnIndex, state, judge) {
  if (turnIndex <= 1) return "";
  const emphasis = judge?.echo_risk
    ? "Avoid repeating prior wording."
    : "Use your own words.";
  if (state?.escalationLevel >= 2 || turnIndex >= 4) {
    const finalPass = [
      "Last pass before we pause. One short sentence is enough.",
      "Final try: one sentence — starting situation, key process, outcome.",
      "One more concise attempt, then we pause here.",
    ];
    return `${finalPass[(turnIndex - 1) % finalPass.length]} ${emphasis}`;
  }
  if (state?.escalationLevel >= 1) {
    const analogical = [
      "Compare two moments in the same topic — what's different?",
      "Switch modality: describe the key process with an in-domain contrast.",
      "Use the contrast you were given; name what had to happen between those moments.",
    ];
    return `${analogical[(turnIndex - 2) % analogical.length]} ${emphasis}`;
  }
  const direct = [
    "Good effort. Keep it to one concrete change.",
    "Name one key change and what it causes.",
    "Focus on the middle operation, then state its effect.",
  ];
  return `${direct[(turnIndex - 2) % direct.length]} ${emphasis}`;
}

export function missingOperationFeedback(repairScaffold, judge) {
  if (judge?.bridge_ready || judge?.next_prompt) return "";
  const hinge =
    repairScaffold?.hinge_focus ||
    repairScaffold?.missing_operation ||
    "the key process";
  const contrast = repairScaffold?.contrast_prompt;
  if (contrast) {
    return `Still not bridge-ready. Focus on: ${hinge}. (${contrast})`;
  }
  const before = repairScaffold?.before || "the starting situation";
  const after = repairScaffold?.after || "the outcome";
  return `Still not bridge-ready: ${hinge}. After ${before}, what had to happen so that ${after}?`;
}

export function chooseRepairHintLevel({ state, turnIndex, lastDialogueTurn }) {
  let level = 1;
  if (state.hintCount >= 1) level = 2;
  if (state.hintCount >= 2) level = 3;
  if (state.escalationLevel >= 1 || state.uncertaintyRecoveryCount > 0) {
    level = Math.max(level, 2);
  }
  if (turnIndex >= 4 || state.uncertaintyRecoveryCount >= 2) {
    level = 3;
  }
  if (lastDialogueTurn?.uncertainty && level < 3) {
    level = 2;
  }
  return Math.min(3, level);
}

export function repairHintText(repairScaffold, level) {
  const hinge = hingeLabel(repairScaffold);
  const before = repairScaffold.before;
  const after = repairScaffold.after;
  const contrast = repairScaffold.contrast_prompt;
  if (level === 1) {
    return `Tiny hint: focus on "${hinge}". After ${before}, what had to happen so that ${after}?`;
  }
  if (level === 2) {
    const lines = [
      "Guided hint: use this frame in your own words.",
      `Starting: ${before}. Key process: ${hinge}. Outcome: ${after}.`,
      "Now write one short sentence for the key process.",
    ];
    if (contrast) lines.splice(1, 0, contrast);
    return lines.join("\n");
  }
  return [
    "Stronger hint: this is a shape, not the answer.",
    `After ${before}, ${hinge} has to occur so that ${after}.`,
    "Now restate that shift in your own words.",
  ].join("\n");
}

export function recoveryNextActionText(repairScaffold) {
  const hinge = hingeLabel(repairScaffold);
  return `Next best step: when you're ready, explain "${hinge}" in one sentence — what had to happen between the two situations.`;
}

export function bucketFromRepairTurn(turn) {
  if (turn?.bridge_ready) return "ready";
  if (turn?.uncertainty_type === "blank") return "blank";
  if (turn?.uncertainty) return "uncertain";
  // Any other non-ready turn (with or without a partial causal link) buckets as
  // partial_link: it carries some generative content but never reached bridge.
  return "partial_link";
}

export function canEnterRecoveryBucket(bucket) {
  return bucket === "blank" || bucket === "partial_link";
}

// Closed-loop integrity (Principle 2): ctx.repairState carries phase-critical
// working state (escalation, recovery, hint counters) that drives prompt
// selection but is set to null on exit, so a session cannot be replayed
// mid-repair from events[] alone. Stamping this snapshot onto each repair turn
// makes that state reconstructable from the append-only fact chain. The fields
// reflect the state that produced the turn (escalation_level is the level used
// to render this turn's prompt). Telemetry only: it never feeds nextPhase.
export function repairStateSnapshot(state) {
  if (!state) return undefined;
  return {
    turn_index: state.turnIndex,
    escalation_level: state.escalationLevel,
    uncertainty_recovery_count: state.uncertaintyRecoveryCount,
    hint_count: state.hintCount,
    last_hint_level: state.lastHintLevel,
    ladder_policy_version: state.ladderPolicyVersion,
  };
}

export function repairDialogueEvent({
  gapId,
  turnIndex,
  repairText,
  repairScaffold,
  judge,
  repairState,
}) {
  const event = {
    type: "repair_dialogue_turn",
    gap_id: gapId,
    turn_index: turnIndex,
    text: repairText,
    prompt_type: judge.support_level,
    support_level: judge.support_level,
    classification: judge.classification,
    gap_delta: {
      missing_operation: repairScaffold.missing_operation,
      causal_link_present: judge.causal_link_present,
      missing_operation_addressed: judge.missing_operation_addressed,
    },
    score_eligible: false,
    graph_neutral: true,
    causal_link_present: judge.causal_link_present,
    missing_operation_addressed: judge.missing_operation_addressed,
    echo_risk: judge.echo_risk,
    bridge_ready: judge.bridge_ready,
    next_dialogue_action: judge.next_dialogue_action,
    judge_reason: judge.judge_reason,
    next_prompt: judge.next_prompt,
    not_mastery_reason: judge.not_mastery_reason,
  };
  const snapshot = repairStateSnapshot(repairState);
  if (snapshot) event.repair_state = snapshot;
  return event;
}

// Sole builder for judge-less (blank / uncertain) repair_dialogue_turn events.
// Keeps the shared turn shape in one place so the handler holds no raw literals.
export function uncertaintyDialogueTurnEvent({
  turnIndex,
  text,
  nextDialogueAction,
  uncertaintyType = "idk",
  ladderStage,
  ladderStep,
  ladderPolicyVersion,
  kcId,
  judgeReason,
  repairState,
}) {
  const event = {
    type: "repair_dialogue_turn",
    turn_index: turnIndex,
    text,
    bridge_ready: false,
    next_dialogue_action: nextDialogueAction,
    uncertainty: true,
    uncertainty_signal: true,
    uncertainty_type: uncertaintyType,
    ladder_stage: ladderStage,
    ladder_step: ladderStep,
    ladder_policy_version: ladderPolicyVersion,
    score_eligible: false,
    graph_neutral: true,
    kc_id: kcId,
  };
  if (judgeReason) event.judge_reason = judgeReason;
  const snapshot = repairStateSnapshot(repairState);
  if (snapshot) event.repair_state = snapshot;
  return event;
}

export function buildRepairDialogueBridgeArgs(ctx, learnerText, turnIndex, options) {
  return {
    node_label: ctx.firstNode.label,
    node_mechanism: ctx.firstNode.mechanism,
    gap_id: ctx.gapId,
    missing_operation: ctx.repairScaffold.missing_operation,
    before: ctx.repairScaffold.before,
    after: ctx.repairScaffold.after,
    learner_text: learnerText,
    turn_index: turnIndex,
    log_raw_llm: options.logRawLlm,
  };
}
