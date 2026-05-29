/** Cold-attempt evidence gates: substantive vs graph-neutral help turns. */

export const MAX_COLD_HELP_TURNS = 2;

export function isSubstantiveColdEvaluation(evaluation) {
  if (!evaluation) return false;
  if (evaluation.answer_mode === "help_request") return false;
  if (evaluation.score_eligible === false) return false;
  if (!evaluation.classification) return false;
  if (evaluation.generative_commitment === false) return false;
  return true;
}

export function countColdHelpTurns(events) {
  return events.filter((event) => event.type === "cold_help_turn").length;
}

export function classifyForStore(evaluation) {
  if (evaluation.classification === "solid") return "strong";
  if (
    evaluation.classification === "deep" ||
    evaluation.classification === "shallow"
  ) {
    return "partial";
  }
  if (evaluation.classification === "misconception") return "wrong_direction";
  return "thin";
}

export function gapsForStore(evaluation) {
  if (!evaluation.gap_description) return [];
  return [
    { mechanism: "target mechanism", correction: evaluation.gap_description },
  ];
}
