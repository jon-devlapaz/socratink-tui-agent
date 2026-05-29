import { pathToFileURL } from "node:url";
import { resolveTuiPaths } from "../config/paths.mjs";

let deriveConceptStatus;
let deriveNodeTraining;

/**
 * Load the vendored training-derive module (lib/canon/). Called once at startup
 * AFTER the path preflight, so a missing vendored canon fails with an actionable
 * preflight error rather than an opaque module-load failure during the static
 * import graph.
 */
export async function initTrainingDerive(paths = resolveTuiPaths()) {
  const mod = await import(pathToFileURL(paths.trainingDerivePath).href);
  ({ deriveConceptStatus, deriveNodeTraining } = mod);
}

export function summarizeTraining(training, nodeIds, now) {
  if (!deriveNodeTraining) {
    throw new Error(
      "training-derive not initialized; call initTrainingDerive() at startup",
    );
  }
  const records = training?.node_records || {};
  const nodes = {};
  nodeIds.forEach((nodeId) => {
    const record = records[nodeId] || null;
    nodes[nodeId] = {
      ...deriveNodeTraining(record, { now }),
      attempt_count: Array.isArray(record?.attempts)
        ? record.attempts.length
        : 0,
      repair_count: Array.isArray(record?.repairs) ? record.repairs.length : 0,
    };
  });
  return {
    nodes,
    concept_status: deriveConceptStatus(training, nodeIds, { now }),
  };
}
