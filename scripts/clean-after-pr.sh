#!/usr/bin/env bash
# Return this checkout to an updated main and delete redundant local branches.
#
# Default mode is a dry run. Both modes refresh remote-tracking refs first.
# Pass --apply to switch/update main and delete branches that are either
# ancestry-merged into origin/main or tree-identical to origin/main after a
# squash merge.
set -euo pipefail

REMOTE="origin"
MAIN_BRANCH="main"
APPLY=0

usage() {
  cat <<'USAGE'
Usage: ./scripts/clean-after-pr.sh [--apply] [--remote origin] [--main main]

Dry run:
  ./scripts/clean-after-pr.sh

Apply local cleanup:
  ./scripts/clean-after-pr.sh --apply

Note:
  Dry-run still runs git fetch --prune so the branch analysis uses current
  remote-tracking refs. It does not switch, reset, or delete local branches.

What it does:
  - requires a clean worktree
  - fetches and prunes the configured remote
  - switches to main and fast-forwards it to origin/main
  - resets main only when its tree already matches origin/main
  - deletes local branches that are merged into origin/main
  - deletes local branches whose tip tree is identical to origin/main

What it will not do:
  - discard uncommitted work
  - delete remote branches
  - delete branches checked out in another worktree
  - delete branches with content not present in origin/main
USAGE
}

log() {
  printf '[clean-after-pr] %s\n' "$*"
}

run() {
  if [ "$APPLY" -eq 1 ]; then
    log "run: $*"
    "$@"
  else
    log "would run: $*"
  fi
}

die() {
  printf '[clean-after-pr] ERROR: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --remote)
      REMOTE="${2:-}"
      [ -n "$REMOTE" ] || die "--remote requires a value"
      shift 2
      ;;
    --main)
      MAIN_BRANCH="${2:-}"
      [ -n "$MAIN_BRANCH" ] || die "--main requires a value"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [ -n "$(git status --porcelain)" ]; then
  if [ "$APPLY" -eq 1 ]; then
    die "worktree is dirty; commit, stash, or discard changes first"
  fi
  log "worktree is dirty; dry-run branch analysis will not modify it"
fi

git remote get-url "$REMOTE" >/dev/null || die "remote '$REMOTE' does not exist"

if [ "$APPLY" -eq 0 ]; then
  log "dry run only; pass --apply to modify branches"
fi

log "refreshing $REMOTE with fetch --prune"
git fetch --prune "$REMOTE"

REMOTE_MAIN="$REMOTE/$MAIN_BRANCH"
git rev-parse --verify --quiet "$REMOTE_MAIN" >/dev/null || die "$REMOTE_MAIN does not exist"

MAIN_EXISTS=0
if git show-ref --verify --quiet "refs/heads/$MAIN_BRANCH"; then
  MAIN_EXISTS=1
  run git switch "$MAIN_BRANCH"
  [ "$APPLY" -eq 1 ] || log "would switch to $MAIN_BRANCH"
else
  run git switch --track -c "$MAIN_BRANCH" "$REMOTE_MAIN"
  [ "$APPLY" -eq 1 ] || log "would create $MAIN_BRANCH tracking $REMOTE_MAIN"
fi

if [ "$APPLY" -eq 1 ]; then
  read -r AHEAD BEHIND < <(git rev-list --left-right --count "$MAIN_BRANCH...$REMOTE_MAIN")

  if [ "$AHEAD" -gt 0 ]; then
    if git diff --quiet "$REMOTE_MAIN..$MAIN_BRANCH" --; then
      log "$MAIN_BRANCH has duplicate commits but matches $REMOTE_MAIN; resetting pointer"
      git reset --hard "$REMOTE_MAIN"
    else
      die "$MAIN_BRANCH has local content not in $REMOTE_MAIN; inspect before resetting"
    fi
  elif [ "$BEHIND" -gt 0 ]; then
    git merge --ff-only "$REMOTE_MAIN"
  else
    log "$MAIN_BRANCH already matches $REMOTE_MAIN"
  fi
else
  if [ "$MAIN_EXISTS" -eq 0 ]; then
    log "would create $MAIN_BRANCH from $REMOTE_MAIN; no local divergence to inspect"
  else
    read -r AHEAD BEHIND < <(git rev-list --left-right --count "$MAIN_BRANCH...$REMOTE_MAIN")
    if [ "$AHEAD" -gt 0 ]; then
      if git diff --quiet "$REMOTE_MAIN..$MAIN_BRANCH" --; then
        log "would reset $MAIN_BRANCH to $REMOTE_MAIN because the trees match"
      else
        log "would stop: $MAIN_BRANCH has local content not in $REMOTE_MAIN"
      fi
    elif [ "$BEHIND" -gt 0 ]; then
      log "would fast-forward $MAIN_BRANCH to $REMOTE_MAIN"
    else
      log "$MAIN_BRANCH already matches $REMOTE_MAIN"
    fi
  fi
fi

if [ "$APPLY" -eq 1 ]; then
  CURRENT_BRANCH="$(git branch --show-current)"
else
  CURRENT_BRANCH="$MAIN_BRANCH"
fi
PROTECTED_PATTERN="^(${MAIN_BRANCH}|master|dev|develop|staging|production|release)$"
DELETE_COUNT=0
KEEP_COUNT=0

while IFS=$'\t' read -r BRANCH WORKTREE_PATH; do
  [ -n "$BRANCH" ] || continue

  if [ "$BRANCH" = "$CURRENT_BRANCH" ] || [[ "$BRANCH" =~ $PROTECTED_PATTERN ]]; then
    KEEP_COUNT=$((KEEP_COUNT + 1))
    log "keep $BRANCH: protected/current branch"
    continue
  fi

  if [ -n "$WORKTREE_PATH" ] && { [ "$APPLY" -eq 1 ] || [ "$WORKTREE_PATH" != "$REPO_ROOT" ]; }; then
    KEEP_COUNT=$((KEEP_COUNT + 1))
    log "keep $BRANCH: checked out at $WORKTREE_PATH"
    continue
  fi

  if git merge-base --is-ancestor "$BRANCH" "$REMOTE_MAIN"; then
    DELETE_COUNT=$((DELETE_COUNT + 1))
    run git branch -D "$BRANCH"
    continue
  fi

  if git diff --quiet "$REMOTE_MAIN..$BRANCH" --; then
    DELETE_COUNT=$((DELETE_COUNT + 1))
    log "$BRANCH is tree-identical to $REMOTE_MAIN"
    run git branch -D "$BRANCH"
    continue
  fi

  KEEP_COUNT=$((KEEP_COUNT + 1))
  log "keep $BRANCH: has content not proven present in $REMOTE_MAIN"
done < <(git for-each-ref refs/heads --format='%(refname:short)%09%(worktreepath)')

log "local branch cleanup: $DELETE_COUNT delete candidate(s), $KEEP_COUNT kept"
log "final status:"
git status --short --branch
