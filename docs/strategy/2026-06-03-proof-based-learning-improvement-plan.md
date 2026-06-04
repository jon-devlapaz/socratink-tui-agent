# Proof-Based Learning Improvement Plan

Status: implemented baseline slice
Date: 2026-06-03

## Strategic Read

Socratink should win by proving reconstruction, not by acting like a broad AI
tutor. The product should make the loop legible: starting sketch, confirmed
starting point, draft map, answer from memory, own-words repair, model bridge,
transfer, and durability check.

The learner-facing promise is plain: try first, repair the missing middle, then
prove the idea comes back later. Internal graph and taxonomy terms stay out of
the UI.

## Implemented Baseline Slice

- `/dashboard` now exposes `product_strategy_v2` as a compatible payload block:
  north star, activation funnel, product metrics, friction segments, experiment
  queue, and dogfood evidence boundary.
- `/loop` copy now makes `/meta` visible and clarifies rough sketch versus
  counted reconstruction.
- `/meta` is deterministic, graph-neutral, and returns to the same prompt.
- Product Design context is saved under the Codex plugin state so future audits
  use the correct repo, URLs, vocabulary, and local evidence folder.

## Top Three Improvement Bets

1. Prove novice viability with Substrate Gate traces.
2. Reduce own-words repair load without leaking answer shape.
3. Explain durable proof separately from a good answer now.

## Evidence Path

The dashboard trusts promoted `learning_cases` traces. `.qa-runs` remains the
working evidence stream until a trace is promoted. Any future claim that the
product improved should point to:

- dashboard product metrics,
- promoted trace replay,
- hosted loop persona runs,
- human dogfood notes promoted into a stable artifact.

## Non-Negotiables

- Source, goal, route, substrate, help, hints, and `/meta` are context.
- Cold attempts and spaced re-drills are evidence candidates.
- Durable graph truth comes from derivation rules, not UI copy or model prose.
