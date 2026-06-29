---
name: hosted-session-persistence
description: Authority boundary for hosted loop session storage and rehydration. Load when changing loop persistence, resume, adapter metadata, or transcript handling.
triggers:
  - "hosted persistence"
  - "rehydration"
  - "resume"
  - "session store"
  - "events.jsonl"
  - "transcript"
edges:
  - target: context/seda.md
    condition: when persisted events affect routing or replay
  - target: context/graph-honesty.md
    condition: when persisted state could affect evidence or derived graph truth
  - target: context/architecture.md
    condition: when persistence changes the hosted loop flow
last_updated: 2026-06-29
---

# Hosted session persistence

`events[]` is the durable hosted authority. Adapter metadata makes HTTP
ergonomics work, but it must not become routing truth or evidence truth.

## Authority boundary

| Item | Owner | Authority |
| --- | --- | --- |
| append-only events | SEDA handlers | durable authority |
| session id and timestamps | hosted adapter | adapter metadata |
| transcript and transcript tail | hosted adapter or UI | display only |
| awaiting prompt metadata | hosted adapter or UI | input affordance only |
| current phase | `nextPhase(events)` | derived, never persisted as truth |
| training state | training replay from events | derived |

## Resume rule

A fresh runtime must be able to read persisted events, rebuild safe kernel
context, derive graph state, and compute the next phase with `nextPhase(events)`.
If required facts are missing, fail with `CannotRehydrateSession`; do not recover
by trusting transcript text or a cached phase.

## Store shape

When `SOCRATINK_LOOP_SESSION_STORE_DIR` is set, the hosted loop writes one
directory per session:

- `events.jsonl`: append-only journal, one event per line
- metadata file: bounded adapter metadata, status, display phase, awaiting
  display metadata, completion flags, and transcript tail

If the env var is unset, the server uses an OS-temp development path.

## Non-goals

- browser session-id reuse is not the authority boundary
- cross-deploy durability and database storage can come later behind the same
  adapter contract
- transcript history is not evidence
- repeated GET/load calls must not append events
