Goal:
Fix the concrete live persona-run findings from the AI attention loop: post-bridge transfer answers must be recorded correctly, composer CTAs must match the active phase, and the dashboard must surface pedagogical UX improvement signals rather than developer-centered status.

Success criteria:
- Choosing the post-bridge transfer check and then answering it appends `post_bridge_transfer_check`, not `post_bridge_transfer_skipped`.
- `gap_attempt`, `spaced_attempt`, `cmd`, and other non-repair prompts do not inherit stale repair CTA text.
- The learning-loop dashboard exposes run logs, friction, improvement queue, and latency/pedagogical salience from existing trace artifacts.
- Narrow tests cover the fixed state transitions and CTA enrichment.

Current context:
- Live persona run on `Transformer attention in LLMs` found stale `Fill the missing link` CTAs and an incorrect transfer skip event after opting into transfer.
- Dashboard has already been shifted toward learning-loop run logs but needs test-aligned payload expectations.

Constraints:
- Preserve append-only event truth and graph-neutral semantics.
- Do not make dashboard a source of routing or graph truth.
- Preserve unrelated dirty UI changes in `public/loop/*` and existing worktree changes.

Risks:
- HTTP prompt handlers with multiple prompt.ask calls can restart and lose in-handler progress.
- CTA enrichment can accidentally hide legitimate repair prompts if keyed too broadly.
- Dashboard metrics can imply live test status if not clearly derived from saved traces.

Approval required:
None. Changes are local, non-destructive, and do not touch secrets, deploys, or external systems.

Workflow artifact path:
.workflow/learning-loop-persona-findings

Work packets:
- Packet A: Fix post-bridge transfer HTTP continuation state.
- Packet B: Fix CTA enrichment so only current prompt keys receive repair scaffold text.
- Packet C: Align dashboard payload/tests with learning-loop UX metrics and salience.
- Packet D: Run narrow verification and record evidence.

Integration policy:
Prefer event-log truth over UI copy. Tests must assert event type and CTA fields rather than rely on transcript prose.

Verification:
- node --test tests/js/awaiting-cta.test.mjs tests/js/dashboard.test.mjs
- .venv/bin/pytest tests/test_workspace_smoke.py -q if local venv is available
- Optional live API sanity rerun on a throwaway session if server can be restarted safely.

Reusable artifacts:
No new reusable recipe unless the HTTP multi-prompt continuation pattern recurs.
