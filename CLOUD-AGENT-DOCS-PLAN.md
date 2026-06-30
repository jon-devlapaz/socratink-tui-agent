# Cloud Agent Docs Plan

Status: approved direction, not yet implemented  
Last updated: 2026-06-30  
Audience: Cursor Cloud Agents, Codex, and repo maintainers

This file captures the agreed plan to raise cloud-agent documentation quality from
~8/10 to 10/10. Canonical agent context remains `.mex/`; this document is a
top-level execution brief only.

## Problem

After PR #64, agent context is consolidated under `.mex/` and `npm run mex:check`
passes 100/100. Cloud agents still fail on **behavior**, not missing files:

- Vague or empty user prompts ("Not sure what to say here")
- Skipping `ROUTER.md` → `ACTIVE.md` bootstrap
- Loading too much context or the wrong verification gate
- AgentLint scoring `AGENTS.md` at 93/100 while the real brain (`.mex/`) is unscored

## Definition of 10/10

An agent with zero prior context can:

1. Bootstrap via `AGENTS.md` → `.mex/ROUTER.md` → `.mex/ACTIVE.md`
2. Pick a bounded task when the user prompt is empty (default: ACTIVE hardening)
3. Load only routed context and matching patterns
4. Run `npm run agent:git -- guard-write` before edits
5. Verify with the shallowest gate from `.mex/context/release-ladder.md`
6. Finish with branch, commit, push, and draft PR hygiene

## AgentLint vs Mex (use both, differently)

| | Mex (`npm run mex:check`) | AgentLint (`npm run agentlint`) |
|---|---|---|
| Scope | `.mex/` scaffold + path refs in agent context | `AGENTS.md` only (today) |
| Pass bar | 100/100, zero issues | ≥75/100 in CI (advisory) |
| Role | Structural canon, broken links, forbidden legacy refs | Bootloader readability heuristics |
| Chase score? | Yes — hard gate | No — calibration says advisory; ignore MEMORY/SOUL tips |

**Do not** raise AgentLint to replace Mex. Extend Mex overlay and patterns instead.

## Implementation plan (priority order)

### 1. Cloud agent session pattern (highest ROI)

Create `.mex/patterns/cloud-agent-session.md` and register it in
`patterns/INDEX.md` and `.mex/ROUTER.md`.

The pattern MUST cover:

- Session start: read `ROUTER.md`, then `ACTIVE.md`
- Empty or vague user task: execute ACTIVE "Current hardening tasks"; report plan;
  ask at most one narrowing question
- Before edits: `npm run agent:git -- guard-write`
- Load only routed `.mex/context/` files and matching patterns
- Verify using the shallowest gate from `release-ladder.md`; enumerate results
  (per ROUTER behavioural contract)
- Git/PR: branch `cursor/<slug>-7768`, commit, push, open draft PR

Add ROUTER triggers for cloud / cursor / codex (see `.mex/config.json`).

Add ~6 lines to root `AGENTS.md` (keep it a bootloader):

```markdown
## Session start (MUST)
1. Read `.mex/ROUTER.md`, then `.mex/ACTIVE.md`.
2. If the user gave no concrete task, execute ACTIVE "Current hardening tasks".
3. Before edits: `npm run agent:git -- guard-write`.
```

Sync `.mex/AGENTS.md` if bootstrap rules change there too.

**Expected impact:** ~8/10 → ~9/10

### 2. Fix ROUTER completeness and drift

- Add `context/memory-check-retrieval-spec.md` to the routing table (deferred spec)
- Add founder-lab routes: `ACTIVE.md` + `context/founder-lab-loop-rubric.md`
- **Reconcile YAML `routing:` block with the markdown routing table** — today the
  YAML subset is smaller and can drift silently

### 3. Extend `scripts/check-mex-truth.mjs`

Add repo overlay assertions:

- Frontmatter required on `.mex/context/*.md` and `.mex/patterns/*.md` (except
  `INDEX.md` and `README.md`)
- Every pattern file listed in `patterns/INDEX.md`
- Every ROUTER table target path exists on disk
- Orphan context files must be routed **or** explicitly marked deferred in
  frontmatter (do not force every spec into ROUTER)

**Do not** add time-based `last_updated` freshness rules initially — too brittle.

**Expected impact:** ~9/10 → ~9.5/10

### 4. Scaffold consistency

- Add YAML frontmatter to `context/product-vocabulary.md` and
  `context/seda-harness.md`
- Bump stale `last_updated` on context files last touched at canon migration
- Add patterns:
  - `founder-lab-hardening.md` — `/lab` UI, reports, batch comparison loop
  - `edit-mex-scaffold.md` — any `.mex/` edit → `mex:check` + GROW checklist

### 5. Mechanize ACTIVE where cheap

Extend `tests/js/founder-console.test.mjs` (do **not** add a parallel
`active-contract.test.mjs`).

Cover mechanizable ACTIVE items:

- API/surface blocks empty Concept or Goal
- Pedagogical monitor exposes required stages (partially covered already)
- Report/evidence boundary strings where testable without a browser

**Defer** until Founder Lab hardening is active:

- Fake/sandbox tutor control visibility in DOM
- Responsive overflow at mobile-ish widths

Those belong to release-ladder Tier 4 (hosted loop UI / browser tests).

**Expected impact:** ~9.5/10 → 10/10 when combined with successful cloud runs

## Explicitly defer

| Item | Reason |
|------|--------|
| Raise AgentLint min to 90 / widen corpus | Fights `scripts/agentlint.mjs` calibration; optimizes bootloader only |
| Add MEMORY.md, SOUL.md, USER.md | `.mex/` is the memory system |
| Root README for agent score | Human onboarding, not cloud bootstrap |
| Restore `.github/pull_request_template.md` first | Helps humans; does not fix agent bootstrap |
| Reload deleted `docs/` tree | PR #64 canon migration was correct |
| Inflate `AGENTS.md` with architecture | Belongs in `.mex/context/` |

Fold optional `npm run agent:git -- golden` preflight into the cloud-agent
pattern instead of a separate doc pass.

## Verification for the implementing PR

```bash
npm install
npm run mex:check
npm test
```

Run `npm run ci:local` if `.mex/` routing, overlay, or founder-console tests
change broadly.

## Success metrics

| Milestone | Signal |
|-----------|--------|
| 9/10 | Cloud agent with empty prompt executes ACTIVE checklist without wandering |
| 9.5/10 | `mex:check` enforces frontmatter, INDEX, and ROUTER referential integrity |
| 10/10 | Above plus founder-console tests cover remaining mechanizable ACTIVE items and observed cloud runs succeed |

## References

- Bootloader: `AGENTS.md`
- Router and behavioural contract: `.mex/ROUTER.md`
- Current work: `.mex/ACTIVE.md`
- Verification tiers: `.mex/context/release-ladder.md`
- Mex gate: `npm run mex:check` → `scripts/check-mex-truth.mjs`
- AgentLint calibration: `scripts/agentlint.mjs`
