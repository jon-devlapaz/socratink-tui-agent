import { deriveProductLoopBranch } from "./session-record.mjs";

export function analyzeSession(session) {
  const events = session.events || [];
  const has = (type) => events.some((event) => event.type === type);
  const dialogueTurns = events.filter((event) => event.type === "repair_dialogue_turn");
  const lastDialogueTurn = dialogueTurns.at(-1);
  const lastRecoveryClosed = events.findLast(
    (event) => event.type === "repair_recovery_closed",
  );
  const reachedModelBridge = has("model_bridge");
  const terminalAbandon = deriveProductLoopBranch(events).bridge_gate !== undefined;

  return {
    terminalAbandon,
    repairAbandoned: has("repair_abandoned"),
    recoveryStarted: has("repair_recovery_started"),
    recoveryRecovered: lastRecoveryClosed?.outcome === "recovered",
    hasRepairDialogue: dialogueTurns.length > 0,
    bridgeReadyWithinConcept:
      dialogueTurns.length > 0 &&
      lastDialogueTurn?.bridge_ready === true &&
      reachedModelBridge,
    falseReady:
      dialogueTurns.some((turn) => turn.bridge_ready) && !reachedModelBridge,
    statusReversal:
      Array.isArray(session.evidence_holds) && session.evidence_holds.length > 0,
  };
}

export function computeRecoveryTelemetry(sessions) {
  const total = sessions.length;
  if (!total) {
    return {
      repair_abandoned_rate: 0,
      recovery_enter_rate: 0,
      recovery_success_rate: 0,
      bridge_ready_within_same_concept_rate: 0,
      status_reversal_rate: 0,
      false_ready_rate: 0,
    };
  }

  const stats = sessions.map((session) => analyzeSession(session));
  const repairAbandonedCount = stats.filter((s) => s.repairAbandoned).length;
  const recoveryStartedCount = stats.filter((s) => s.recoveryStarted).length;
  const dialogueCount = stats.filter((s) => s.hasRepairDialogue).length;

  return {
    repair_abandoned_rate: roundRate(
      stats.filter((s) => s.terminalAbandon).length / total,
    ),
    recovery_enter_rate: roundRate(
      repairAbandonedCount
        ? recoveryStartedCount / repairAbandonedCount
        : 0,
    ),
    recovery_success_rate: roundRate(
      recoveryStartedCount
        ? stats.filter((s) => s.recoveryRecovered).length / recoveryStartedCount
        : 0,
    ),
    bridge_ready_within_same_concept_rate: roundRate(
      dialogueCount
        ? stats.filter((s) => s.bridgeReadyWithinConcept).length / dialogueCount
        : 0,
    ),
    status_reversal_rate: roundRate(
      stats.filter((s) => s.statusReversal).length / total,
    ),
    false_ready_rate: roundRate(
      dialogueCount ? stats.filter((s) => s.falseReady).length / dialogueCount : 0,
    ),
  };
}

export function buildDashboardPayload({ cases, sessions }) {
  return {
    title: "Socratink Founder Dashboard",
    case_summary: {
      total: cases.length,
      regression: cases.filter((c) => c.case_type === "regression").length,
      golden: cases.filter((c) => c.case_type === "golden").length,
      research: cases.filter((c) => c.case_type === "research").length,
    },
    recovery_telemetry: computeRecoveryTelemetry(sessions),
  };
}

function roundRate(value) {
  return Math.round(value * 1000) / 1000;
}
