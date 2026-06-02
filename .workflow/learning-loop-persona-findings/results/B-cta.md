Accepted: `gap_attempt`, `spaced_attempt`, `cmd`, and other form keys now return label-only CTA metadata before consulting stale `ctx.composerCta`.
Rejected: Did not remove repair CTA support; repair still gets the scaffold question.
Conflicts: None.
Decisions: Phase-specific form prompts own their own visible CTA.
Final changes: Added regression assertions for transfer, spaced re-drill, and idle prompt keys.
Remaining risks: Browser visual smoke was not run after patch.
