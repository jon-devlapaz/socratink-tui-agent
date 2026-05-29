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
