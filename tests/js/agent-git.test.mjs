import test from "node:test";
import assert from "node:assert/strict";

import {
  CommandError,
  assertSafeRequestedCommand,
  classifyBranch,
  isProtectedBranch,
  parseRemoteOwnerRepo,
} from "../../lib/agent-git/core.mjs";

test("agent git parses GitHub remotes", () => {
  assert.equal(
    parseRemoteOwnerRepo("https://github.com/jon-devlapaz/socratink-tui-agent.git"),
    "jon-devlapaz/socratink-tui-agent",
  );
  assert.equal(
    parseRemoteOwnerRepo("git@github.com:jon-devlapaz/socratink-tui-agent.git"),
    "jon-devlapaz/socratink-tui-agent",
  );
  assert.equal(parseRemoteOwnerRepo("https://example.com/not/github.git"), null);
});

test("agent git protects mainline and release branches", () => {
  assert.equal(isProtectedBranch("main"), true);
  assert.equal(isProtectedBranch("master"), true);
  assert.equal(isProtectedBranch("prod"), true);
  assert.equal(isProtectedBranch("release/v1"), true);
  assert.equal(isProtectedBranch("feat/prod-ui"), false);
});

test("agent git blocks destructive command pass-through", () => {
  assert.throws(
    () => assertSafeRequestedCommand(["git", "reset", "--hard"]),
    (error) => error instanceof CommandError && error.code === 2,
  );
  assert.throws(
    () => assertSafeRequestedCommand(["git", "push", "origin", "--delete", "feat/old"]),
    /blocked dangerous command/,
  );
  assert.doesNotThrow(() => assertSafeRequestedCommand(["status"]));
});

test("agent git cleanup classification keeps unsafe branches", () => {
  const context = {
    current: "main",
    mergedBranches: new Set(),
    remoteBranches: new Set(["feat/open", "feat/closed"]),
    openPrBranches: new Set(["feat/open"]),
    closedPrBranches: new Set(["feat/closed"]),
    mergedPrBranches: new Set(),
    uniqueCommitBranches: new Set(["feat/unique"]),
    dirtyWorktreeBranches: new Set(["feat/dirty"]),
  };

  assert.deepEqual(classifyBranch("feat/open", context), {
    branch: "feat/open",
    action: "keep",
    reason: "open PR",
  });
  assert.deepEqual(classifyBranch("feat/closed", context), {
    branch: "feat/closed",
    action: "archive-first",
    reason: "closed but unmerged PR",
  });
  assert.deepEqual(classifyBranch("feat/unique", context), {
    branch: "feat/unique",
    action: "keep",
    reason: "unique commits not reachable from origin base",
  });
  assert.deepEqual(classifyBranch("feat/dirty", context), {
    branch: "feat/dirty",
    action: "keep",
    reason: "dirty worktree",
  });
});

test("agent git cleanup classification deletes only proven merged branches", () => {
  const context = {
    current: "feat/current",
    mergedBranches: new Set(["feat/merged"]),
    remoteBranches: new Set(["feat/merged"]),
    openPrBranches: new Set(),
    closedPrBranches: new Set(),
    mergedPrBranches: new Set(["feat/merged-pr"]),
    uniqueCommitBranches: new Set(),
    dirtyWorktreeBranches: new Set(),
  };

  assert.deepEqual(classifyBranch("main", context), {
    branch: "main",
    action: "keep",
    reason: "protected branch pattern",
  });
  assert.deepEqual(classifyBranch("feat/current", context), {
    branch: "feat/current",
    action: "keep",
    reason: "current branch",
  });
  assert.deepEqual(classifyBranch("feat/merged", context), {
    branch: "feat/merged",
    action: "delete-local",
    reason: "merged; remote may also be deleted after proof",
  });
  assert.deepEqual(classifyBranch("feat/merged-pr", context), {
    branch: "feat/merged-pr",
    action: "delete-local",
    reason: "merged local branch",
  });
});
