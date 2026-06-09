## Summary

<!-- What and why -->

## Version

- [ ] No manual `LOOP_APP_VERSION` bump needed — CI auto-bumps on merge to `main` (`npm run bump:loop`)

## Test plan

- [ ] `./scripts/check-canon-drift.sh`
- [ ] `.venv/bin/pytest tests -q` (or scoped tests for your change)
- [ ] `find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test`
