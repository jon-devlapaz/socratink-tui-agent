/** Learner-facing closure after spaced re-drill before idle. */
export function spacedRedrillClosureLine({ finalState, evidenceHold }) {
  if (finalState === "solidified") {
    return (
      "This link held after spacing — it's on your map for now. " +
      "Type a new concept when you're ready for the next room."
    );
  }
  if (evidenceHold) {
    return (
      "Useful practice. Not stable yet: " +
      `${evidenceHold.reason} Rest, then retry later.`
    );
  }
  return (
    "Useful practice. Not stable yet. Rest, then retry this room later."
  );
}

/** Explain when evaluator solid disagrees with derivation (labels ≠ truth). */
export function buildEvidenceHold({ finalState, spacedEvaluation, training, nodeId }) {
  if (
    spacedEvaluation?.classification !== "solid" ||
    finalState === "solidified"
  ) {
    return null;
  }
  const attempts = training?.node_records?.[nodeId]?.attempts || [];
  const firstAttempt = attempts[0] || null;
  if (firstAttempt?.classification !== "strong") {
    return {
      event: "spaced_redrill",
      state: finalState,
      reason:
        `this link stays ${finalState} because the first no-help attempt was ` +
        "not strong. Current derivation requires two strong no-help " +
        "reconstructions separated by spacing before solidified.",
    };
  }
  return {
    event: "spaced_redrill",
    state: finalState,
    reason:
      `this link stays ${finalState} under ` +
      "the current training derivation contract.",
  };
}
