import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRepairTurnBudget,
  decideBlankTurn,
  decidePostJudgeTurn,
  decideUncertainTurn,
} from "../../lib/seda/repair-policy.mjs";
import { MAX_REPAIR_TURNS, nextPhase } from "../../lib/seda/next-phase.mjs";
import { MAX_UNCERTAINTY_RECOVERY_STEPS } from "../../lib/seda/repair-recovery-config.mjs";
import { uncertaintyDialogueTurnEvent } from "../../lib/seda/repair-dialogue-helpers.mjs";

const ev = (type, extra = {}) => ({ type, ...extra });

const baseRepairState = {
  turnIndex: 0,
  escalationLevel: 0,
  isFirstTurn: true,
  queuedPrompt: null,
  uncertaintyRecoveryCount: 0,
  hintCount: 0,
  lastHintLevel: 0,
  ladderPolicyVersion: "repair-recovery-v1-shadow",
};

function policyTurnEvent({ turnIndex, decision, uncertaintyType = "idk" }) {
  return uncertaintyDialogueTurnEvent({
    turnIndex,
    text: uncertaintyType === "blank" ? "" : "i am not sure",
    nextDialogueAction: decision.nextDialogueAction,
    uncertaintyType,
    ladderStage: decision.ladderStage ?? "direct",
    ladderStep: decision.ladderStep ?? 0,
    ladderPolicyVersion: baseRepairState.ladderPolicyVersion,
    kcId: "kc-test",
    judgeReason: "policy golden test",
    repairState: { ...baseRepairState, turnIndex },
  });
}

function routeAfterPolicyTurn(priorEvents, turnEvent) {
  return nextPhase([...priorEvents, turnEvent]);
}

test("decideBlankTurn: recover before cap, abandon at cap", () => {
  assert.deepEqual(
    decideBlankTurn({ turnIndex: 1, maxRepairTurns: MAX_REPAIR_TURNS }),
    { nextDialogueAction: "recover_uncertainty" },
  );
  assert.deepEqual(
    decideBlankTurn({ turnIndex: MAX_REPAIR_TURNS, maxRepairTurns: MAX_REPAIR_TURNS }),
    { nextDialogueAction: "abandon" },
  );
});

test("decideUncertainTurn: first uncertainty at direct prompt escalates once", () => {
  assert.deepEqual(
    decideUncertainTurn({
      turnIndex: 1,
      escalationLevel: 0,
      uncertaintyRecoveryCount: 0,
      maxUncertaintyRecoverySteps: MAX_UNCERTAINTY_RECOVERY_STEPS,
      maxRepairTurns: MAX_REPAIR_TURNS,
    }),
    {
      action: "escalate",
      nextDialogueAction: "escalate",
      nextEscalationLevel: 1,
      nextUncertaintyRecoveryCount: 0,
      ladderStage: "direct",
      ladderStep: 0,
    },
  );
});

test("decideUncertainTurn: second uncertainty abandons at two-turn cap", () => {
  const step1 = decideUncertainTurn({
    turnIndex: 2,
    escalationLevel: 1,
    uncertaintyRecoveryCount: 0,
    maxUncertaintyRecoverySteps: MAX_UNCERTAINTY_RECOVERY_STEPS,
    maxRepairTurns: MAX_REPAIR_TURNS,
  });
  assert.equal(step1.action, "abandon");
  assert.equal(step1.ladderStage, "abandon");
});

test("decideUncertainTurn: abandons when ladder exhausted or turn cap hit", () => {
  assert.equal(
    decideUncertainTurn({
      turnIndex: 4,
      escalationLevel: 1,
      uncertaintyRecoveryCount: MAX_UNCERTAINTY_RECOVERY_STEPS,
      maxUncertaintyRecoverySteps: MAX_UNCERTAINTY_RECOVERY_STEPS,
      maxRepairTurns: MAX_REPAIR_TURNS,
    }).action,
    "abandon",
  );
  assert.equal(
    decideUncertainTurn({
      turnIndex: MAX_REPAIR_TURNS,
      escalationLevel: 1,
      uncertaintyRecoveryCount: 0,
      maxUncertaintyRecoverySteps: MAX_UNCERTAINTY_RECOVERY_STEPS,
      maxRepairTurns: MAX_REPAIR_TURNS,
    }).action,
    "abandon",
  );
});

test("decidePostJudgeTurn: closes repair state on abandon or cap", () => {
  assert.deepEqual(
    decidePostJudgeTurn({
      turnIndex: 1,
      nextDialogueAction: "probe_again",
      maxRepairTurns: MAX_REPAIR_TURNS,
      escalationLevel: 0,
    }),
    { closeRepairState: false, nextEscalationLevel: 1 },
  );
  assert.deepEqual(
    decidePostJudgeTurn({
      turnIndex: 2,
      nextDialogueAction: "abandon",
      maxRepairTurns: MAX_REPAIR_TURNS,
      escalationLevel: 1,
    }),
    { closeRepairState: true, nextEscalationLevel: 1 },
  );
  assert.deepEqual(
    decidePostJudgeTurn({
      turnIndex: MAX_REPAIR_TURNS,
      nextDialogueAction: "probe_again",
      maxRepairTurns: MAX_REPAIR_TURNS,
      escalationLevel: 2,
    }),
    { closeRepairState: true, nextEscalationLevel: 2 },
  );
});

test("applyRepairTurnBudget bridges substantive repair at cap", () => {
  const judge = applyRepairTurnBudget(
    {
      bridge_ready: false,
      next_dialogue_action: "probe_again",
      next_action: "probe_again",
      progression_state: "needs_work",
      judge_reason: "Still missing the hinge.",
    },
    { turnIndex: MAX_REPAIR_TURNS, maxRepairTurns: MAX_REPAIR_TURNS },
  );

  assert.equal(judge.bridge_ready, true);
  assert.equal(judge.next_dialogue_action, "commit_repair");
  assert.equal(judge.next_action, "commit_repair");
  assert.equal(judge.progression_state, "ready");
  assert.match(judge.judge_reason, /two substantive repair tries/);
});

test("applyRepairTurnBudget leaves earlier repair judge alone", () => {
  const judge = {
    bridge_ready: false,
    next_dialogue_action: "probe_again",
  };
  assert.equal(
    applyRepairTurnBudget(judge, {
      turnIndex: MAX_REPAIR_TURNS - 1,
      maxRepairTurns: MAX_REPAIR_TURNS,
    }),
    judge,
  );
});

const goldenMatrix = [
  {
    name: "first uncertainty escalates to repair_dialogue",
    prior: [ev("gap_identified", { graph_neutral: true })],
    turnIndex: 1,
    policyInput: {
      turnIndex: 1,
      escalationLevel: 0,
      uncertaintyRecoveryCount: 0,
      maxUncertaintyRecoverySteps: MAX_UNCERTAINTY_RECOVERY_STEPS,
      maxRepairTurns: MAX_REPAIR_TURNS,
    },
    expectedPhase: "repair_dialogue",
  },
  {
    name: "second uncertainty at cap routes to repair_abandoned",
    prior: [
      ev("gap_identified", { graph_neutral: true }),
      ev("repair_dialogue_turn", {
        turn_index: 1,
        next_dialogue_action: "escalate",
        graph_neutral: true,
      }),
    ],
    turnIndex: 2,
    policyInput: {
      turnIndex: 2,
      escalationLevel: 1,
      uncertaintyRecoveryCount: 0,
      maxUncertaintyRecoverySteps: MAX_UNCERTAINTY_RECOVERY_STEPS,
      maxRepairTurns: MAX_REPAIR_TURNS,
    },
    expectedPhase: "repair_abandoned",
  },
  {
    name: "policy abandon routes to repair_abandoned",
    prior: [ev("gap_identified", { graph_neutral: true })],
    turnIndex: MAX_REPAIR_TURNS,
    policyInput: {
      turnIndex: MAX_REPAIR_TURNS,
      escalationLevel: 1,
      uncertaintyRecoveryCount: MAX_UNCERTAINTY_RECOVERY_STEPS,
      maxUncertaintyRecoverySteps: MAX_UNCERTAINTY_RECOVERY_STEPS,
      maxRepairTurns: MAX_REPAIR_TURNS,
    },
    expectedPhase: "repair_abandoned",
  },
  {
    name: "blank at cap routes to repair_abandoned",
    prior: [ev("gap_identified", { graph_neutral: true })],
    turnIndex: MAX_REPAIR_TURNS,
    policyFn: () =>
      decideBlankTurn({
        turnIndex: MAX_REPAIR_TURNS,
        maxRepairTurns: MAX_REPAIR_TURNS,
      }),
    expectedPhase: "repair_abandoned",
    uncertaintyType: "blank",
  },
];

for (const row of goldenMatrix) {
  test(`golden matrix: ${row.name}`, () => {
    const decision = row.policyFn
      ? row.policyFn()
      : decideUncertainTurn(row.policyInput);
    const turnEvent = policyTurnEvent({
      turnIndex: row.turnIndex,
      decision,
      uncertaintyType: row.uncertaintyType,
    });
    assert.equal(
      routeAfterPolicyTurn(row.prior, turnEvent),
      row.expectedPhase,
      JSON.stringify(decision),
    );
  });
}

test("golden sequence: inner repair dialogue gates model bridge", () => {
  const events = [
    ev("launch_attempt"),
    ev("route_generated"),
    ev("cold_attempt", { evaluation: { classification: "shallow" } }),
    ev("gap_identified", { graph_neutral: true }),
  ];

  events.push(
    ev("repair_dialogue_turn", {
      turn_index: 1,
      bridge_ready: false,
      next_dialogue_action: "probe_again",
      graph_neutral: true,
    }),
  );
  assert.equal(nextPhase(events), "repair_dialogue");

  events.push(
    ev("repair_dialogue_turn", {
      turn_index: 2,
      bridge_ready: true,
      next_dialogue_action: "commit_repair",
      graph_neutral: true,
    }),
  );
  assert.equal(nextPhase(events), "repair");
});

test("golden sequence: abandon then recovery_prompt routes to repair_recovery", () => {
  const events = [
    ev("gap_identified", { graph_neutral: true }),
    ev("repair_dialogue_turn", {
      turn_index: MAX_REPAIR_TURNS,
      bridge_ready: false,
      next_dialogue_action: "abandon",
      graph_neutral: true,
    }),
  ];
  assert.equal(nextPhase(events), "repair_abandoned");

  events.push(
    ev("repair_abandoned", {
      graph_neutral: true,
      next_step: "recovery_prompt",
    }),
  );
  assert.equal(nextPhase(events), "repair_recovery");
});

test("golden sequence: recovery closed recovered routes back to repair", () => {
  const events = [
    ev("repair_abandoned", { graph_neutral: true, next_step: "recovery_prompt" }),
    ev("repair_recovery_turn", { graph_neutral: true, score_eligible: false }),
    ev("repair_recovery_closed", {
      graph_neutral: true,
      outcome: "recovered",
      next_phase: "repair",
    }),
  ];
  assert.equal(nextPhase(events), "repair");
});
