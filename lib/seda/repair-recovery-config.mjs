export const MAX_UNCERTAINTY_RECOVERY_STEPS = 2;
export const REPAIR_RECOVERY_POLICY_VERSION = "repair-recovery-v1-shadow";

export function isRecoveryBranchEnabled() {
  return process.env.SOCRATINK_TUI_ENABLE_RECOVERY_BRANCH === "1";
}
