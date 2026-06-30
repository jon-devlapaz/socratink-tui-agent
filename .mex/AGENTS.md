---
name: agents
type: agents
description: Always-loaded Mex scaffold anchor. Read after root AGENTS.md bootloader. Keeps routing and scaffold-growth rules only.
last_updated: 2026-06-30
---

# Socratink TUI Mex scaffold

## What this is

`.mex/` is the master agent scaffold and document organizer for this repo. Root
docs keep compact contracts. The current work surface, routed context,
recurring patterns, release-gate guidance, and deferred product notes live here.

Root `AGENTS.md` is only the bootloader and safety card. Read `.mex/ROUTER.md`
and load only the routed context files for the task. If the task is vague or
empty, read `.mex/ACTIVE.md` and use its current hardening tasks.

## Scaffold growth

After meaningful work, run GROW:

- Ground: what changed in reality?
- Record: update `ROUTER.md` and relevant `context/` files
- Orient: create or update a `patterns/` runbook if this can recur
- Write: bump `last_updated` on changed scaffold files and run `mex log` when rationale matters

The scaffold grows from real work, not just setup. See the GROW step in `ROUTER.md` for details.

## Navigation

At the start of every session, read `ROUTER.md` before doing anything else.
For full project context, patterns, and task guidance — everything is there.
