Accepted: Persisted `ctx.postBridgeTransfer.runGap` after the yes/no prompt and reused it on the next HTTP handler invocation.
Rejected: No changes to `nextPhase`; routing already handled both check and skipped events.
Conflicts: None.
Decisions: Clear `ctx.postBridgeTransfer` after either event is emitted.
Final changes: `post_bridge_transfer_check` now records the learner's transfer answer when opt-in was already captured.
Remaining risks: Full hosted API rerun was not repeated after patch in this pass.
