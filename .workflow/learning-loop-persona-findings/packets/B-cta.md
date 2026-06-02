Packet ID: B
Objective: Prevent stale repair CTA copy from leaking into transfer, spaced re-drill, and idle prompts.
Context: Live API returned `Fill the missing link` CTA after model bridge and spacing.
Files / sources: `lib/loop-server/awaiting-cta.mjs`, `tests/js/awaiting-cta.test.mjs`.
Ownership: Awaiting metadata enrichment only.
Do: Treat form-like keys as phase-owned prompts and clear CTA body for them.
Do not: Remove legitimate cold or repair CTA prompts.
Expected output: `gap_attempt`, `spaced_attempt`, and `cmd` return label-only awaiting metadata.
Verification: `tests/js/awaiting-cta.test.mjs`.
