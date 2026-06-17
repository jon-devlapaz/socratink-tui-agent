# Lab Workbench Progress

- Baseline: `rtk node --test tests/js/lab-api.test.mjs tests/js/lab-runs.test.mjs` passed 30/30 before workbench edits.
- Selected-run state: current `/lab` Runs rows now carry the selected run into Dialogue without new persistence or backend abstractions.
- Thurman deliverable: selected founder runs render one read-only workbench with evidence path and copyable patch/comparison prompt; debug/persona rows render no patch prompt.
- Validation: `rtk node --test tests/js/lab-api.test.mjs tests/js/lab-runs.test.mjs` passed 32/32 after edits.
- Browser: selected a founder-batch row in `/lab`; saw `Prompt/output patch proposal`, evidence path, and a copy-ready prompt with the no-apply-patches guard.
- Browser: selected a persona row; saw `No patch prompt` and the prompt textarea stayed hidden.
