# Debloat Assessment — socratink-tui-agent

**Repository:** `socratink-tui-agent`
**Prepared:** 2026-06-08  
**Supersedes:** generic pygount hand-off (`/private/tmp/debloat-assessment.md`)

This assessment is repo-native. It follows the friction classifications in
`BASELINE.md` (same folder) and respects hard-coded paths for fixtures, harness
traces, bridge registry, and persona cartridges.

---

## How to measure (canonical scan)

Generic pygount runs inflate JSON and “binary” counts by scanning ignored trees
(especially `.qa-runs/`). Always use explicit skips:

```bash
pygount --format=summary \
  --folders-to-skip=.git,.venv,.qa-runs,.pytest_cache,.ruff_cache,node_modules
```

**Do not** treat pygount “code LOC” on JSON/Markdown as refactor pressure. JSON
here is mostly replay evidence and test fixtures; Markdown is agent/harness
contract surface.

---

## pygount summary (2026-06-08, skips above)

| Language / bucket | Files | Code LOC | Comment LOC | Notes |
|---|---:|---:|---:|---|
| JavaScript | 125 | 11,308 | 201 | Product + tests; primary executable surface |
| JSON | 45 | 7,692 | 0 | See breakdown below — mostly traces, not config sprawl |
| Python | 37 | 4,105 | 439 | Bridge seam + tests |
| Markdown | 76 | 0 | 3,127 | Agent/harness docs; 0% code is expected |
| CSS / HTML / YAML / Bash / TS | 19 | ~1,632 | ~153 | Small; low ROI to “debloat” |
| `__binary__` (pygount) | 44 | 0 | 0 | Extensionless CLI wrappers (`socratink-*`), not junk |
| **Sum** | **362** | **25,676** | **4,288** | |

**Git-tracked files:** 296 (pygount scans working tree, including some untracked
paths under allowed folders).

**Content duplicates in git:** none found (SHA256 over `git ls-files`).

**Tracked raster/archive binaries:** none (no `.png`, `.ico`, `.gz`, `.zip` in git).

---

## JSON LOC — where the weight actually is

34 JSON files are tracked in git (~7.3k lines). pygount reports 45 / 7,692
(includes a few non-git paths in the working tree).

| Bucket | ~Lines | Classification | Why |
|---|---:|---|---|
| `learning_cases/traces/**/session.json` (8 files) | ~6,700 | **leave-alone** | Harness replay evidence; gates in `routing-proofs`, dashboard, replay |
| `lib/bridge/registry.json` | 386 | **leave-alone** | Bridge contract; tests + `HARNESS-BRIDGE-REGISTRY.md` |
| `pedagogical_agents/contracts.json` + cartridges | ~300 | **leave-alone** | Persona lab runtime paths |
| `fixtures/*.json` (18 files) | ~242 | **leave-alone** | Scripted TUI / smoke; paths referenced in tests and scripts |
| `learning_cases/schema.json` | 84 | **leave-alone** | Promotion schema |

**Do not** consolidate JSON into a `configs/` folder or merge into module
exports. Paths are part of the verification contract.

**Working stream (ignored):** `.qa-runs/` holds ~59 JSON files / ~27.5k lines.
Already in `.gitignore`. If pygount totals look scary, the scan probably included
this directory.

---

## Friction table (aligned with BASELINE.md)

| Friction | Evidence | Action | Verification if you change anything |
|---|---|---|---|
| Large runtime/test files | `dashboard-metrics.mjs`, `loop-chat-ui.test.mjs`, `ai_service.py` | **leave-alone** | Full release ladder only if behavior changes |
| Fake bridge heuristics | `bridge_fake.py` (+ `bridge_fake_*.py`) | **migrated** (2026-06-08 VCR stub) | L2 eval + golden + workspace smoke |
| Trace JSON dominates raw LOC | `learning_cases/traces/**/session.json` | **leave-alone** | `./socratink-harness replay` + `routing-proof` |
| Overlapping architecture docs | `AGENTS.md`, `HARNESS.md`, `HARNESS-TRACEABILITY.md`, `CONTEXT.md`, README, implementation reports | **fix-now** (dedupe, not delete) | `./scripts/check-seda-spine.sh`; anti-drift tests |
| Validation command spread | Docs/CI list different test slices | **fix-now** | One spine entrypoint + one release ladder doc |
| Terminology regression (`floor`, `caseComplete`, …) | Canonical docs + grep surface | **guard** | `tests/js/architecture-anti-drift.test.mjs` |
| Hosted loop UI test scope creep | `loop-chat-ui.test.mjs` mixed into “all JS” mentally | **guard** | Keep server-backed test separate in docs |
| Vendored canon + Python seam | `lib/canon/`, `vendor/python/` | **leave-alone** | `./scripts/check-canon-drift.sh` |
| `.workflow/learning-loop-persona-findings/` | 12 files, ~129 lines; referenced by doc-signal audit | **optional trim** | Grep for references before delete; not on critical path |
| Stale `docs/implementation/*` plans | Historical PR/orchestration write-ups | **optional trim** | Archive only after confirming no agent links |

---

## Do-not-do list (from generic hand-off review)

These were proposed elsewhere and are **unsafe for this repo**:

1. **`mv **/*.json configs/`** — breaks fixtures, traces, registry, cartridges, harness.
2. **Mass-archive `docs/*.md` or move `README.md`** — destroys traceability map agents rely on.
3. **`git rm` tracked images/archives** — nothing to remove; rule is over-broad.
4. **Pre-commit “>10% binary” gate** — pygount `__binary__` here is mostly `socratink-*` CLIs.
5. **pygount code/comment ratio CI** — Markdown and JSON buckets skew the metric by design.
6. **`uniq -w32` duplicate scan on macOS** — BSD `uniq` lacks `-w`; use `shasum` instead.

---

## Safe hygiene (read-only or non-destructive)

```bash
# 1. Canonical size snapshot (paste into PR if debloat-adjacent)
pygount --format=summary \
  --folders-to-skip=.git,.venv,.qa-runs,.pytest_cache,.ruff_cache,node_modules

# 2. Duplicate check (macOS-safe)
git ls-files -z | xargs -0 shasum -a 256 | sort | awk '
  seen[$1]++ { print prev; print $0 }
  { prev = $0 }
'

# 3. Largest tracked JSON (expect traces at the top)
git ls-files '*.json' -z | xargs -0 wc -l | sort -n | tail -15

# 4. Spine check before any doc or architecture trim
./scripts/check-seda-spine.sh
```

---

## Recommended actions (priority order)

### P0 — fix-now (doc surface, not deletion)

1. **Dedupe canonical docs** per BASELINE friction: each concern has one owner file;
   others link inward. Targets: validation ladder, evidence vs completion wording,
   hosted pacing vs routing.
2. **Point agents at `./scripts/check-seda-spine.sh`** as the fast gate; keep full
   release ladder in one place (`AGENTS.md` or `HARNESS-TRACEABILITY.md`).

*Verification:* `./scripts/check-seda-spine.sh`; `tests/js/architecture-anti-drift.test.mjs`.

### P1 — optional, low risk

3. **Prune stale implementation reports** under `docs/implementation/` when a
   goal is marked done and `BASELINE.md` / `REPORT.md` supersede them. Prefer
   a single “archived” note at the top over moving files.
4. **Review `.workflow/learning-loop-persona-findings/`** after persona-validation
   loop stabilizes; delete only if nothing links to it.

*Verification:* `rg` for path references; no test harness dependency expected.

### P2 — leave-alone unless product truth changes

5. **Promoted traces** — trim only when re-capturing with new expected invariants
   (see `learning_cases/README.md`). Use `refresh-trace-broadcast.mjs` for
   derive-only updates.
6. **Fixtures** — small (~242 LOC total); add/remove only with routing/test proof.
7. **Vendor/canon** — sync policy in `AGENTS.md`; never debloat by deleting.

*Verification:* `./socratink-harness replay`; self-contained JS + Python tests.

---

## What “success” looks like

| Metric | Target | Anti-goal |
|---|---|---|
| Agent finds spine + validation in &lt;30s | One spine script, one ladder section | Fewer total markdown files |
| pygount JSON LOC | Stable ~7–8k unless new promoted traces | Flat `configs/*.json` tree |
| Harness green after doc trim | replay + routing-proof pass | Smaller LOC at cost of trace loss |
| `.qa-runs/` on disk | Grows freely; stays gitignored | Checking QA artifacts into git |

---

## Release ladder (after any non-doc change)

```bash
./scripts/check-canon-drift.sh
find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test
.venv/bin/pytest tests -q
./socratink-harness replay
```

Server-backed UI (if loop surfaces touched):

```bash
SOCRATINK_TUI_ENV_FILE=.qa-runs/validation-entrypoints/missing.env \
SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow \
  node --no-warnings loop-server.mjs
SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 node --test tests/js/loop-chat-ui.test.mjs
```

---

## References

- `BASELINE.md` — friction classifications (sibling in this folder)
- `learning_cases/README.md` — trace promotion and refresh rules
- `AGENTS.md` — throughline, test commands, anti-patterns
- `HARNESS-TRACEABILITY.md` — requirements ↔ verification map
