Packet ID: A
Objective: Fix post-bridge transfer recording after an HTTP split prompt.
Context: Live persona run showed a learner opted into transfer, then their transfer answer was recorded as `post_bridge_transfer_skipped`.
Files / sources: `lib/seda/handlers/post-bridge-transfer.mjs`, `lib/loop-server/http-prompt.mjs`, `lib/loop-server/runtime.mjs`, `app.mjs`, `lib/seda/ctx.d.ts`.
Ownership: Post-bridge handler continuation state only.
Do: Persist the yes/no decision on ctx across HTTP prompt restarts and clear it after check/skip.
Do not: Change routing semantics or graph-truth derivation.
Expected output: `gap_attempt` answer appends `post_bridge_transfer_check`.
Verification: `tests/js/post-bridge-transfer.test.mjs`.
