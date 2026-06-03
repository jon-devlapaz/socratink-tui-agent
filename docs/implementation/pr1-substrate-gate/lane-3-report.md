Implemented Lane 3 substrate turn handling.

Changed:
- [substrate-gate.mjs](/Users/jondev/dev/socratink/prod/socratink-tui-substrate-gate/lib/seda/handlers/substrate-gate.mjs:107): composer CTA now includes the offered substrate seed plus the refinement ask before `prompt.ask("substrate_refinement", ...)` pauses the loop turn.
- [awaiting-cta.mjs](/Users/jondev/dev/socratink/prod/socratink-tui-substrate-gate/lib/loop-server/awaiting-cta.mjs:33) and [prompt-help.mjs](/Users/jondev/dev/socratink/prod/socratink-tui-substrate-gate/lib/loop-server/prompt-help.mjs:18): added substrate refinement CTA/help handling.
- [loop.js](/Users/jondev/dev/socratink/prod/socratink-tui-substrate-gate/public/loop/loop.js:22): added substrate phase slug/label/busy copy.
- [loop-chat-ui.test.mjs](/Users/jondev/dev/socratink/prod/socratink-tui-substrate-gate/tests/js/loop-chat-ui.test.mjs:314): added the regression proving `substrate_seed_offered` appears before `route_generated` across separate loop turns.

Verification:
- `node --test --test-name-pattern "^loop substrate seed waits" tests/js/loop-chat-ui.test.mjs` passed.
- `node --test --test-name-pattern "^enrichAwaiting exposes substrate|^slow path offers" tests/js/awaiting-cta.test.mjs tests/js/substrate-gate.test.mjs` passed.
- `find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test` passed: 100 tests.

Could not run the real server-backed command because this sandbox rejects binding the loop server: `listen EPERM: operation not permitted 0.0.0.0:8787`.

