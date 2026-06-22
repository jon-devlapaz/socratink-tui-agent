import test from "node:test";
import assert from "node:assert/strict";

import {
  bucketFromRepairTurn,
  canEnterRecoveryBucket,
  isQuestionLikeRepair,
  missingOperationFeedback,
  questionRepairRedirect,
  repairFollowUpPrompt,
  recoveryNextActionText,
  repairHintText,
  repairStateSnapshot,
  repairNudge,
  uncertaintyRecoveryPrompt,
  uncertaintyDialogueTurnEvent,
} from "../../lib/seda/repair-dialogue-helpers.mjs";

test("bucketFromRepairTurn classifies turns by precedence", () => {
  assert.equal(bucketFromRepairTurn({ bridge_ready: true }), "ready");
  assert.equal(bucketFromRepairTurn({ uncertainty_type: "blank" }), "blank");
  assert.equal(bucketFromRepairTurn({ uncertainty: true }), "uncertain");
  assert.equal(
    bucketFromRepairTurn({ causal_link_present: true }),
    "partial_link",
  );
  assert.equal(bucketFromRepairTurn({}), "partial_link");
  assert.equal(bucketFromRepairTurn(undefined), "partial_link");
});

test("bridge_ready wins over uncertainty and blank", () => {
  assert.equal(
    bucketFromRepairTurn({ bridge_ready: true, uncertainty: true }),
    "ready",
  );
});

test("only blank and partial_link qualify for recovery", () => {
  assert.equal(canEnterRecoveryBucket("blank"), true);
  assert.equal(canEnterRecoveryBucket("partial_link"), true);
  assert.equal(canEnterRecoveryBucket("uncertain"), false);
  assert.equal(canEnterRecoveryBucket("ready"), false);
});

test("repairStateSnapshot mirrors loop-critical working state for replay", () => {
  const state = {
    turnIndex: 2,
    escalationLevel: 1,
    uncertaintyRecoveryCount: 1,
    hintCount: 3,
    lastHintLevel: 2,
    ladderPolicyVersion: "v9",
    queuedPrompt: "transient — not snapshotted",
    isFirstTurn: false,
  };
  assert.deepEqual(repairStateSnapshot(state), {
    turn_index: 2,
    escalation_level: 1,
    uncertainty_recovery_count: 1,
    hint_count: 3,
    last_hint_level: 2,
    ladder_policy_version: "v9",
  });
  // No state => no snapshot (recovery branch has no multi-turn repairState).
  assert.equal(repairStateSnapshot(null), undefined);
});

test("repair_dialogue_turn events embed the repair_state snapshot", () => {
  const event = uncertaintyDialogueTurnEvent({
    turnIndex: 1,
    text: "not sure",
    nextDialogueAction: "probe_again",
    kcId: "c1_s1",
    repairState: { turnIndex: 1, escalationLevel: 0, ladderPolicyVersion: "v9" },
  });
  assert.equal(event.repair_state.escalation_level, 0);
  // The escalation level was invisible to the log before; routing must not read it.
  assert.equal(event.bridge_ready, false);
});

test("repair fallback copy asks for one missing link without old worksheet phrasing", () => {
  const scaffold = {
    hinge_focus: "memory cells persist",
    before: "the first exposure",
    after: "the later response is faster",
  };
  const copy = [
    uncertaintyRecoveryPrompt(scaffold, 1),
    repairNudge(4, { escalationLevel: 1 }, {}),
    missingOperationFeedback(scaffold, {}),
    repairHintText(scaffold, 1),
    recoveryNextActionText(scaffold),
  ].join("\n");

  assert.match(copy, /repair one missing link|missing link/i);
  assert.doesNotMatch(copy, /what has to happen|what had to happen/i);
});

test("question-shaped repair is redirected into a claim", () => {
  assert.equal(isQuestionLikeRepair("How does that work?"), true);
  assert.equal(isQuestionLikeRepair("Memory cells stay ready."), false);

  const prompt = questionRepairRedirect({
    after: "the later response is faster",
  });
  assert.match(prompt, /Don't ask another question yet/);
  assert.match(prompt, /because ___/);
  assert.match(prompt, /in your own words/);

  const fallbackPrompt = questionRepairRedirect({
    after: "how immune memory cells enable faster responses. is correctly explained",
  });
  assert.match(fallbackPrompt, /the outcome changes/);
  assert.doesNotMatch(fallbackPrompt, /correctly explained/);
});

test("repairFollowUpPrompt centralizes question redirect and judge fallback", () => {
  const scaffold = { after: "stored results return faster" };
  assert.match(
    repairFollowUpPrompt({
      repair: "Why is that?",
      judge: { next_prompt: "ignored judge prompt" },
      scaffold,
    }),
    /Don't ask another question yet/,
  );
  assert.equal(
    repairFollowUpPrompt({
      repair: "It skips recomputing.",
      judge: { next_prompt: "Use that in one sentence." },
      scaffold,
    }),
    "Use that in one sentence.",
  );
});
