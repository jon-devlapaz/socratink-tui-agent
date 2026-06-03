## Summary

<!-- What and why -->

## Version

- [ ] Bumped `LOOP_APP_VERSION_DEFAULT` in `lib/loop-server/version.mjs` (required on every PR)

## Test plan

- [ ] `./scripts/check-canon-drift.sh`
- [ ] `.venv/bin/pytest tests -q` (or scoped tests for your change)
- [ ] `find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test`
