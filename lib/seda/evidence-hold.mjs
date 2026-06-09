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
      "Case paused here. Rest and retry after more spacing, or type a new concept."
    );
  }
  return (
    "Case paused at primed. The note above is feedback on what's still missing — " +
    "not another question. Rest and try this room again later, or type a new concept."
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
        `The spaced answer was solid, but this node remains ${finalState} because ` +
        "the first attempt was not strong. Current derivation requires two strong " +
        "reconstructions separated by spacing before solidified.",
    };
  }
  return {
    event: "spaced_redrill",
    state: finalState,
    reason:
      `The spaced answer was solid, but this node remains ${finalState} under ` +
      "the current training derivation contract.",
  };
}
