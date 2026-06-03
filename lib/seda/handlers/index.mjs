export { handleColdAttempt } from "./cold-attempt.mjs";
export { handleDelta } from "./delta.mjs";
export { handleIdle } from "./idle.mjs";
export { handleIgnition } from "./ignition.mjs";
export { handleModelBridge } from "./model-bridge.mjs";
export { handlePostBridgeTransfer } from "./post-bridge-transfer.mjs";
export { handleRepair } from "./repair.mjs";
export { handleRepairAbandoned } from "./repair-abandoned.mjs";
export { handleRepairDialogue } from "./repair-dialogue.mjs";
export { handleRepairRecovery } from "./repair-recovery.mjs";
export { handleRoute } from "./route.mjs";
export { handleSpacing } from "./spacing.mjs";
export { handleSpacedRedrill } from "./spaced-redrill.mjs";
export { handleStrongColdPath } from "./strong-cold-path.mjs";
export { handleSubstrateGate } from "./substrate-gate.mjs";

import { handleColdAttempt } from "./cold-attempt.mjs";
import { handleDelta } from "./delta.mjs";
import { handleIdle } from "./idle.mjs";
import { handleIgnition } from "./ignition.mjs";
import { handleModelBridge } from "./model-bridge.mjs";
import { handlePostBridgeTransfer } from "./post-bridge-transfer.mjs";
import { handleRepair } from "./repair.mjs";
import { handleRepairAbandoned } from "./repair-abandoned.mjs";
import { handleRepairDialogue } from "./repair-dialogue.mjs";
import { handleRepairRecovery } from "./repair-recovery.mjs";
import { handleRoute } from "./route.mjs";
import { handleSpacing } from "./spacing.mjs";
import { handleSpacedRedrill } from "./spaced-redrill.mjs";
import { handleStrongColdPath } from "./strong-cold-path.mjs";
import { handleSubstrateGate } from "./substrate-gate.mjs";

export const HANDLERS = {
  idle: handleIdle,
  ignition: handleIgnition,
  substrate_gate: handleSubstrateGate,
  route: handleRoute,
  cold_attempt: handleColdAttempt,
  strong_cold_path: handleStrongColdPath,
  delta: handleDelta,
  repair_dialogue: handleRepairDialogue,
  repair_recovery: handleRepairRecovery,
  repair_abandoned: handleRepairAbandoned,
  repair: handleRepair,
  model_bridge: handleModelBridge,
  post_bridge_transfer: handlePostBridgeTransfer,
  spacing: handleSpacing,
  spaced_redrill: handleSpacedRedrill,
};
