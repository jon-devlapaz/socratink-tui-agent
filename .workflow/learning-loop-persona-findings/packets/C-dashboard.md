Packet ID: C
Objective: Keep the dashboard framed as pedagogical loop observability.
Context: The dashboard should surface run logs, friction, and next improvements rather than developer-centered status.
Files / sources: `lib/observability/dashboard-metrics.mjs`, `public/dashboard/*`, `tests/js/dashboard.test.mjs`, `tests/test_workspace_smoke.py`.
Ownership: Read-only dashboard payload and presentation.
Do: Expose learning loop summaries, run logs, friction counts, and improvement queue.
Do not: Make the dashboard a source of truth or claim live commands are green from saved traces.
Expected output: Dashboard payload title and fields align to learning-loop model.
Verification: `tests/js/dashboard.test.mjs`.
