# ADR 0002: Agent Git Control Plane

## Status

Accepted.

## Context

Coding agents are useful for implementation, review summaries, and local
diagnosis. They are a poor owner for branch topology, stale branch cleanup,
merge decisions, force pushes, and destructive reset/clean operations.

The recurring failure mode is that an agent spends context rediscovering Git
state, then improvises a risky command sequence. That distracts from product
work and makes abandoned agent runs expensive to unwind.

## Decision

This repository uses a deterministic `agent-git` wrapper as the control plane
for common git/PR hygiene.

Phase 1 is intentionally non-destructive:

- `doctor` verifies local and GitHub prerequisites.
- `status` gives one compact state report for humans and agents.
- `cleanup --dry-run` classifies branches without deleting anything.
- `rescue` saves patches and stashes dirty/untracked work before any manual
  cleanup.

Agents may write code and create normal commits inside a prepared branch or
worktree. They must not own merge, force-push, branch deletion, remote branch
deletion, or hard reset behavior.

## Safety Rules

The wrapper blocks known destructive command shapes when passed through it:

- `git reset --hard`
- `git clean -fd`
- `git clean -fdx`
- `git branch -D`
- force pushes
- remote branch deletion
- `gh pr close`
- `gh pr merge --admin`
- `rm -rf`

`cleanup` defaults to dry-run only. Closed-but-unmerged PR branches are
classified as `archive-first`, not deleted. Branches with unique commits,
dirty worktrees, open PRs, or protected names are kept.

## Consequences

This adds a small amount of repo-local tooling, but it removes repeated
free-form git reasoning from coding-agent turns.

Future phases may add deterministic `start`, `pr`, `sync`, `checks`, and
`merge` commands after Phase 1 behavior proves stable.
