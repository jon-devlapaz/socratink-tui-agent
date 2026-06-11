## Summary

<!-- What and why -->

## Version

- [ ] `LOOP_APP_VERSION` bumped with `npm run bump:loop` when targeting `main`; CI verifies but does not push commits

## Test plan

- [ ] `./scripts/check-canon-drift.sh`
- [ ] `.venv/bin/pytest tests -q` (or scoped tests for your change)
- [ ] `find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test`
