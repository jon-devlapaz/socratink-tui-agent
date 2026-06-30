---
name: product-todos
type: context
description: Open product questions, action items, and strategic insights surfaced from analysis and dogfooding. Read when planning product direction, prioritizing work, or evaluating whether a feature addresses a real bottleneck.
triggers:
  - "product"
  - "todo"
  - "roadmap"
  - "priority"
  - "bottleneck"
  - "scale"
  - "go-to-market"
  - "gtm"
  - "positioning"
edges:
  - target: context/architecture.md
    condition: when a todo requires an architectural change
  - target: context/decisions.md
    condition: when a todo will result in a new design decision
  - target: context/graph-honesty.md
    condition: when a todo touches evidence, scoring, or mastery claims
last_updated: 2026-06-30
---

# Product Todos

## Strategic Positioning

Socratink is not a general-purpose "study helper" or consumer tutor. Its architecture is uniquely optimized for **high-stakes, high-trust training environments** (B2B, medical certification, flight/operator training, cloud infra, enterprise compliance, safety). Graph-honesty audit trails and spaced-generative verification are worth real money in those verticals.

### Core Insight (2026-06-24): Constrained Renderer Is Necessary, Not Sufficient

The founder's intuition that "AI constrained by source material produces useful assistance instead of plausible nonsense" is directionally correct but incomplete. The project is not merely a controlled renderer—constraining the LLM is the *starting point*, not the product. Three deeper properties make this defensible:

1. **Router, not prompt, owns control flow.** `nextPhase(events)` governs all phase transitions. The LLM is a subprocess producing typed feedback, not generating free-form instruction.
2. **Generation before recognition.** Learners must produce before seeing the answer. This is a pedagogical invariant, not just a hallucination guard.
3. **Derivation separate from evaluation.** Evaluator `solid` ≠ graph `solidified`. The event log is the source of truth; the LLM is a consultant, not the authority.

**Implication:** Marketing and positioning should not pitch "AI that doesn't hallucinate." Pitch: *"A learning loop that proves you actually know it—and can show you the evidence."*

### GTM Path (2026-06-24): Self-Directed Learner → Cert Prep → Enterprise

No existing professor network. Three viable paths ranked by speed-to-signal:

| Path | Time to first user | Time to first $ | Fits the build |
|------|---------------------|-------------------|----------------|
| Self-directed learner communities | 1 week | 1-2 months | ★★★★★ |
| Certification prep (PMP, AWS, CPA) | 2-4 weeks | 2-3 months | ★★★★★ |
| Corporate L&D / compliance | 1-2 months | 3-6 months | ★★★ |

**Do not start with professors.** No network + committee procurement + the professor doesn't pay = 3-6 month sales cycle for a conversation that may never convert.

**Do start with self-directed learner communities where "I studied this but can't explain it" is the acknowledged pain.** Post authentic personal experience, not a marketing pitch.

### Entry Concept (2026-06-24): Systems Thinking

The founder is currently learning systems. This is the authentic wedge:
- "I kept confusing reinforcing and balancing loops" → run the loop → post the result
- The meta-skill (systems) is also what the product *does* (forces reconstruction of mechanisms)
- Concrete candidate concepts, ranked by personal resonance:
  1. Feedback loops (positive vs. negative) — classic recognition/reconstruction gap
  2. Stocks and flows — everyone reads the diagram, nobody can generate the dynamics
  3. Delays in systems — most counterintuitive piece, most common real-world mistake
  4. Leverage points (Meadows) — most cited, least actually understood
  5. Limits to growth — universal archetype, easy to name, hard to explain the collapse mechanism

**Tactic:** Run the loop on whichever concept the founder has personally gotten wrong. Export the session. The gap between what they *thought* they knew and what they *actually* generated is the first marketing asset.

## Unfair Advantages (to press)

- [ ] **Anti-chatbot cage:** The SEDA architecture prevents LLM drift, off-topic conversation, and answer leakage. Productize this as a trust differentiator — "the tutor that cannot cheat."
- [ ] **Audit trail of knowledge:** `session.json` event logs are immutable, structured, and replayable. Enterprises can prove a candidate actually reconstructed a mechanism (not just recognized it). Build export/reports for this.
- [ ] **"Anki killer" upgrade:** Active recall + generative dialogue + spaced re-drill is a massive pedagogical upgrade over self-graded flashcard recognition. Once stable, own this positioning explicitly.
- [ ] **Router-owned control flow as moat:** The pure `nextPhase(events)` state machine is not reproducible by bolting constraints onto a chatbot. It is a fundamentally different architecture. This is the defensible property—position accordingly.
- [ ] **Derivation gap as marketing asset:** The observable gap between what a learner *thinks* they know (recognition) and what they can *actually* generate (reconstruction) is viscerally compelling. Every session produces this gap. Turn it into shareable evidence.

## Critical Bottlenecks (to solve)

- [ ] **Memory-check contamination:** Hosted `/loop` can show answer-bearing praise immediately before `Memory check`, then ask "From memory, explain it again." That weakens the claim: the learner may be reconstructing from visible feedback, not memory. First fix should be copy/projection only: replace answer-restating praise with a neutral continuation such as "Good enough to continue. Now try it again from memory." Keep timers, transcript hiding, and anti-peeking UI out until live runs show this small fix is insufficient. See [memory-check-retrieval-spec.md](memory-check-retrieval-spec.md).
- [ ] **Learner-facing debug leakage:** Labels like `[STRONG COLD PATH]` belong in founder evidence, not the learner transcript. Hide route/audit labels from `/loop` while preserving them in logs and founder surfaces.
- [ ] **Cognitive friction / churn risk:** Typing paragraph-length generative explanations is mentally exhausting. Tired users will close the app and go back to passive flashcards. Investigate: voice-to-text, micro-grain decomposition, gamification of repair dialogue, or shorter-target KCs to reduce per-turn burden.
- [ ] **LLM latency (the 19-second problem):** Route generation in live Gemini runs takes ~19s. Modern users expect <500ms. Investigate: model routing (small local/edge models for fast evaluations, deep models only for initial routing), streaming evaluations, background processing, or pre-computed route templates.
- [ ] **Curriculum scale / fake dungeon rooms:** Every concept needs a structured Provisional Map with prerequisite nodes and causal mechanisms. Human authoring doesn't scale; LLM-generated maps are often poor ("fake dungeon rooms"). Need a robust "Ingest Engine" that can turn textbooks, PDFs, or API docs into SEDA-ready graphs with quality guardrails.

## Deferred Product Signal (2026-06-27): Legacy TUI Dogfood Triage

Archive review of the older Socratink TUI repo found that most old runtime ideas are already present in this repo: cold help, zero-schema continuation, strong-cold path, evidence hold, repair recovery, learner-goal relevance framing, graph-neutral event boundaries, and extract-prompt rules.

The one product signal worth preserving is the strict dogfood-to-backlog contract from the legacy repo:

- source material: legacy dogfooding guide and triage schema from the older TUI repo
- product job: turn replay traces and dashboard JSON into structured findings
- finding types: `BUG` and `LEARNING_ENHANCEMENT`
- required fields: evidence, repro, proposed fix, test to add, owner, status
- prioritization fields: `top_3_merge_blockers`, `top_3_learning_roi`, and `pr_splits`

Why this matters:

- Socratink already has replay, dashboard metrics, lab reports, and hosted-loop evidence.
- What is missing is a small artifact that forces each dogfood finding to become either a merge blocker or a learning-ROI candidate with evidence and a test plan.
- This supports the positioning claim: "a learning loop that proves you actually know it - and can show you the evidence."

Promotion rule:

- Do not copy the legacy dashboard or old runtime code.
- When ready, add a compact active dogfooding guide plus a triage schema adapted to the current repo.
- Keep the schema small. Add fields only when current lab/dashboard evidence needs them.

Related non-migrations:

- Legacy learnops extraction is path-shifted into `vendor/python/app_prompts/extract-system-v1.txt` and related model docs.
- The old demo map visualizer is historical demo output; archive only.
- Legacy fake-evaluator heuristics should not be copied into `bridge.py`; use the current `bridge_lib.fake` path if deterministic fake behavior needs adjustment.
- Legacy `dashboard.mjs` had useful route-retry and next-product-target signals, but any revival should use current `lib/observability/dashboard-metrics.mjs` or lab surfaces, not the old NOTES-driven dashboard block.

## External Market Signal (2026-06-27): AI Tutor Adoption Is Not Learning Proof

Recent AI-in-education news supports Socratink's current wedge: the market is not short on AI tutor access; it is short on trustworthy evidence that learners used the tool, reconstructed the idea, and improved without answer leakage.

Observed signals:

- **Access without use/gains:** June 2026 coverage of AI tutor studies reports that giving students access does not reliably mean they use the tutor or show learning gains. Product implication: Socratink should keep proving attempted reconstruction, not merely offering available help.
- **Guidance gap:** Schools and teachers are still asking what responsible AI use guidelines should look like. Product implication: teacher/admin controls, source-bounded prompts, and audit trails matter more than open-ended chat flexibility.
- **Backlash risk:** NYC school AI guidance and pause debates show that broad AI deployment can trigger parent/public resistance. Product implication: avoid "AI will tutor your kids" framing; lead with constrained practice, learner-generated evidence, and human-reviewable logs.
- **Critical-thinking concern:** Teacher sentiment is turning on tools that let students outsource thinking. Product implication: Socratink's generation-before-recognition loop is the point, not an implementation detail.
- **Funding/policy tailwind:** Government and institutional attention is moving toward AI literacy and AI in grants, but guardrails remain the blocker. Product implication: sell into trust-sensitive learning contexts only after the loop can demonstrate low-risk, reviewable proof.

Positioning adjustment:

```text
Not: AI tutor access.
Yes: Evidence that the learner reconstructed the concept without being handed the answer.
```

Smallest next product move:

- In learner/product copy, avoid claiming "AI tutor" or "mastery." Use "practice loop," "own-words reconstruction," "same-session reconstruction," and "spaced re-drill evidence."
- For first-user tests, ask whether users trust the evidence trail more than they trust a chatbot answer. That is the sharper question than whether they like AI tutoring.

Sources captured from the June 2026 scan:

- The 74, "Study: Giving Kids Access to AI Tutors Doesn't Mean They'll Use Them" (2026-06-17): https://www.the74million.org/article/study-giving-kids-access-to-ai-tutors-doesnt-mean-theyll-use-them/
- K-12 Dive, "AI tutor access alone doesn't equate to student gains, study says" (2026-06-18): https://www.k12dive.com/news/ai-tutor-access-alone-doesnt-equate-to-student-gains-study-says/823214/
- K-12 Dive, "NYC schools face public pressure to pause AI use for 2 years" (2026-06-12): https://www.k12dive.com/news/nyc-schools-face-public-pressure-to-pause-ai-use-for-2-years/822673/
- Education Week, "What AI Use Guidelines Should Look Like for Schools" (2026-06-26): https://www.edweek.org/technology/what-ai-use-guidelines-should-look-like-for-schools/2026/06
- Education Week, "Teachers Say Lack of AI Guidance Is a Major Problem" (2026-05-28): https://www.edweek.org/technology/teachers-say-lack-of-ai-guidance-is-a-major-problem/2026/05
- K-12 Dive, "Over half of teachers say AI is harming students' critical thinking" (2026-06-09): https://www.k12dive.com/news/over-half-of-teachers-say-ai-is-harming-students-critical-thinking/822296/
- K-12 Dive, "How the Education Department will prioritize AI in awarding grants" (2026-04-14): https://www.k12dive.com/news/how-the-education-department-will-prioritize-ai-in-awarding-grants/817340/
- K-12 Dive, "AI in schools: 3 ways Congress can help" (2026-06-18): https://www.k12dive.com/news/3-ways-congress-could-help-effectively-roll-out-ai-in-schools/823279/

## Vertical Fit Candidates (validate)

- [ ] Medical board prep (pathology mechanism reconstruction)
- [ ] Cloud infra certification (AWS/K8s failure explanation)
- [ ] Enterprise compliance / safety (proving "why" not just "what")
- [ ] Military / aviation (emergency protocol spaced verification)
- [ ] Self-directed learner communities (r/GetStudying 3.3M, Discord Study Together ~1M, cert subreddits)
- [ ] Professional certification (PMP $555 exam, AWS, CPA — learners already spend $200-600 on prep)

## GTM Action Items (2026-06-24)

- [ ] Run the loop on one systems concept the founder has personally struggled with
- [ ] Export the session.json; identify the recognition/reconstruction gap
- [ ] Write an authentic Reddit post: "I built a tool that forced me to explain [concept] from memory. Here\u2019s what happened."
- [ ] Deploy hosted loop link; include in post
- [ ] If 10+ people try it: add $5/mo tier or waitlist
- [ ] If <10 try it: the pitch is wrong, not the product — iterate on angle

## Positioning Statements (to test)

| Draft | Status |
|-------|--------|
| \"AI constrained by source material\" | ✗ Necessary but not sufficient; describes a safer chatbot, not the product |
| \"Controlled renderer for education\" | ✗ Misses generation-before-recognition, derivation, and the state machine |
| \"A learning loop that proves you actually know it\u2014and can show you the evidence\" | ✓ Test this — captures the gap, the audit trail, and the pedagogical claim |
| \"The tutor that cannot cheat\" | ✓ Good for trust-sensitive verticals; less resonant for self-directed learners |

## Open Questions

- [ ] What is the right first vertical where audit-proof generative knowledge is worth paying for?
- [ ] Can voice input reduce cognitive friction enough for consumer-adjacent use, or is this permanently B2B?
- [ ] How to price: per-seat enterprise, per-concept, per-audited-certification?
- [ ] At what point does the provisional-map generation quality justify releasing an auto-ingest pipeline?
- [ ] Which specific systems concept produces the most compelling recognition/reconstruction gap for a first post?
- [ ] Does the founder have enough personal struggle with a candidate concept to write an authentic story?
