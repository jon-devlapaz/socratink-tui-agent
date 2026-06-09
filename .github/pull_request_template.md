## Summary

<!-- What and why -->

## Version

- [ ] No manual `LOOP_APP_VERSION` bump — CI auto-bumps the PR branch (`bump-loop-version` job)

## Test plan

- [ ] `./scripts/check-canon-drift.sh`
- [ ] `.venv/bin/pytest tests -q` (or scoped tests for your change)
- [ ] `find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test`
