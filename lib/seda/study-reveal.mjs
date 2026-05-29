import { TRAINING_NOW } from "./constants.mjs";

/** Zero-schema cold path: unlock study/repair without a prior scored attempt. */
export async function ensureStudyRevealEligible(
  store,
  conceptId,
  nodeId,
  learnerText,
) {
  const training = await store.loadTraining(conceptId);
  const record = training.node_records?.[nodeId];
  if (record?.attempts?.length) return;
  await store.appendAttempt(conceptId, nodeId, {
    id: "zero-schema-entry",
    at: TRAINING_NOW,
    user_text: learnerText || "[no substantive cold attempt]",
    classification: "thin",
    gaps: [],
    grader_version: "tui-zero-schema",
  });
}
