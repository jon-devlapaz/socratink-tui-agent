# Product-Moving Alpha Plan

Status: active next-action spine
Date: 2026-06-20

## Product Standard

Socratink should become the best learner tool in the age of AI by doing the
thing generic AI tutors avoid: make learners generate, repair, and prove ideas
from memory before the system gives answer-shaped help.

The product does not win by adding more tutor modes, agents, dashboards, or
content generation. It wins when a novice can start confused, produce a rough
sketch, repair the missing middle, transfer the idea, and later reconstruct it
again without the graph lying.

## Cut

- Broad repo-mentor benchmarking.
- Generic "AI tutor" feature copying.
- New mastery signals from citations, summaries, hints, annotations, or chat
  satisfaction.
- Dashboard polish that does not change the next learner run.
- New routes or stores for lab review while `.qa-runs` plus promoted
  `learning_cases` already cover the path.

## Do Now

1. Prove novice first-session value.
   - Run the novice substrate path on hosted `/loop`.
   - Capture where the learner stalls: launch, Substrate Seed, Cold Attempt,
     Own-Words Repair, Model Bridge, Transfer, or Spaced Re-drill.
   - Promote one real novice trace into `learning_cases` only if it preserves
     graph honesty.

2. Reduce repair load without leaking the answer.
   - Use founder-lab run review to find the highest-friction repair prompt.
   - Change one repair opening or contingent probe.
   - Verify the learner still has to generate the missing causal link.

3. Make the founder-lab review loop operational.
   - Treat `/lab` as the product workbench: run, inspect, label friction,
     choose one next experiment.
   - Keep reviews read-only over run artifacts.
   - Do not let lab summaries become graph truth.

4. Tighten the learner loop copy.
   - Keep learner language plain: "try it," "repair one missing link," "use it
     somewhere new," "prove it comes back later."
   - Hide internal terms such as substrate, graph-neutral, Bloom, KC, and
     evidence taxonomy from learner-facing text.

5. Publish only after proof.
   - Run the smallest check tied to the changed surface.
   - For loop behavior, prefer `scripts/verify-loop-gemini.mjs` over `/health`.
   - For release claims, require promoted trace replay or live hosted dogfood.

## Borrow Only These Patterns

- From event-sourced agent systems: append facts, project reviews, replay before
  claims.
- From LLM observability tools: trace -> label failure -> change prompt -> rerun.
- From learning systems: adapt to weak skills, but count only reconstruction as
  evidence.

## Next Slice

Make one novice run visibly better.

Success means a real learner reaches a meaningful Cold Attempt or bounded
Own-Words Repair without receiving the mechanism as recognition material. If
that fails, fix that exact beat before adding anything else.
