import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CommandError,
  agentFinish,
  agentVerdict,
  agentWriteGuard,
  assertCleanWorktree,
  agentWorktreeGuard,
  agentWorktreeStart,
  herdrAgentStartArgs,
  herdrWorkspaceCreateArgs,
  validateAgentSlug,
  writeAgentHandoff,
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
    parseRemoteOwnerRepo("https://github.com/acme/repo.name.git"),
    "acme/repo.name",
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

test("agent git validates worktree slugs", () => {
  assert.equal(validateAgentSlug("bughunt-routing_1"), "bughunt-routing_1");
  assert.throws(() => validateAgentSlug("../main"), /path separators|slug/);
  assert.throws(() => validateAgentSlug("bug/hunt"), /path separators|slug/);
});

test("agent git guard blocks protected branches without integrator override", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "ignore" });

  assert.throws(
    () => agentWorktreeGuard(dir, {}),
    (error) => error instanceof CommandError && error.code === 2,
  );
  assert.deepEqual(agentWorktreeGuard(dir, { SOCRATINK_INTEGRATOR: "1" }), {
    root: fs.realpathSync(dir),
    branch: "main",
    ok: true,
  });
});

test("agent git write guard blocks protected branches without integrator override", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-write-guard-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "ignore" });

  assert.throws(
    () => agentWriteGuard(dir, {}),
    (error) => error instanceof CommandError && error.code === 2 && /file edits/.test(error.message),
  );
  assert.deepEqual(agentWriteGuard(dir, { SOCRATINK_INTEGRATOR: "1" }), {
    root: fs.realpathSync(dir),
    branch: "main",
    ok: true,
  });

  execFileSync("git", ["checkout", "-b", "agent/safe"], { cwd: dir, stdio: "ignore" });
  assert.deepEqual(agentWriteGuard(dir, {}), {
    root: fs.realpathSync(dir),
    branch: "agent/safe",
    ok: true,
  });
});

test("agent git start creates an isolated agent worktree", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-parent-"));
  const repo = path.join(parent, "repo");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-b", "main"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "agent@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Agent Test"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "README.md"), "test\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repo, stdio: "ignore" });

  const result = agentWorktreeStart(repo, { slug: "bughunt-routing", herdr: false });
  assert.equal(result.branch, "agent/bughunt-routing");
  assert.equal(result.path, fs.realpathSync(path.join(parent, "socratink-agent-bughunt-routing")));
  assert.equal(result.created, true);
  assert.equal(
    execFileSync("git", ["branch", "--show-current"], { cwd: result.path, encoding: "utf8" }).trim(),
    "agent/bughunt-routing",
  );
});

test("agent git start refuses dirty source checkouts", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-dirty-start-"));
  const repo = initRepo(parent);
  fs.appendFileSync(path.join(repo, "README.md"), "dirty\n");

  assert.throws(
    () => agentWorktreeStart(repo, { slug: "dirty-source", herdr: false }),
    /dirty checkout/,
  );
  assert.throws(() => assertCleanWorktree(repo), /dirty checkout/);
  assert.equal(fs.existsSync(path.join(parent, "socratink-agent-dirty-source")), false);
});

function initRepo(parent) {
  const repo = path.join(parent, "repo");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-b", "main"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "agent@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Agent Test"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "README.md"), "test\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repo, stdio: "ignore" });
  return repo;
}

function initRepoWithOrigin(parent) {
  const origin = path.join(parent, "origin.git");
  const repo = path.join(parent, "repo");
  execFileSync("git", ["init", "--bare", "-b", "main", origin], { stdio: "ignore" });
  execFileSync("git", ["clone", origin, repo], { stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "agent@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Agent Test"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "README.md"), "test\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["push", "-u", "origin", "main"], { cwd: repo, stdio: "ignore" });
  return repo;
}

test("agent git verdict blocks missing worktrees", () => {
  const repo = initRepo(fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-verdict-missing-")));
  assert.deepEqual(
    {
      recommendation: agentVerdict(repo, { slug: "missing" }).recommendation,
      reason: agentVerdict(repo, { slug: "missing" }).reason,
    },
    { recommendation: "blocked", reason: "missing branch" },
  );
});

test("agent git verdict marks unchanged agent branch empty", () => {
  const repo = initRepo(fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-verdict-empty-")));
  agentWorktreeStart(repo, { slug: "empty", herdr: false });

  const verdict = agentVerdict(repo, { slug: "empty" });
  assert.equal(verdict.recommendation, "empty");
  assert.equal(verdict.reason, "no branch changes");
  assert.equal(verdict.ahead, 0);
  assert.deepEqual(verdict.changedFiles, []);
});

test("agent git verdict marks committed agent work ready for review", () => {
  const repo = initRepo(fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-verdict-review-")));
  const started = agentWorktreeStart(repo, { slug: "review", herdr: false });
  fs.writeFileSync(path.join(started.path, "alpha.md"), "finding\n");
  execFileSync("git", ["add", "alpha.md"], { cwd: started.path });
  execFileSync("git", ["commit", "-m", "docs: add alpha finding"], { cwd: started.path, stdio: "ignore" });

  const verdict = agentVerdict(repo, { slug: "review" });
  assert.equal(verdict.recommendation, "review");
  assert.equal(verdict.reason, "ready for integrator review");
  assert.equal(verdict.ahead, 1);
  assert.deepEqual(verdict.changedFiles, ["A\talpha.md"]);
  assert.match(verdict.commits[0], /docs: add alpha finding/);
});

test("agent git verdict blocks dirty agent worktrees", () => {
  const repo = initRepo(fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-verdict-dirty-")));
  const started = agentWorktreeStart(repo, { slug: "dirty", herdr: false });
  fs.writeFileSync(path.join(started.path, "loose.md"), "not committed\n");

  const verdict = agentVerdict(repo, { slug: "dirty" });
  assert.equal(verdict.recommendation, "blocked");
  assert.equal(verdict.reason, "dirty worktree");
  assert.match(verdict.porcelain, /loose\.md/);
});

test("agent git finish removes merged agent residue", () => {
  const repo = initRepoWithOrigin(fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-finish-")));
  const started = agentWorktreeStart(repo, { slug: "done", herdr: false });
  fs.writeFileSync(path.join(started.path, "done.md"), "done\n");
  execFileSync("git", ["add", "done.md"], { cwd: started.path });
  execFileSync("git", ["commit", "-m", "docs: finish agent work"], { cwd: started.path, stdio: "ignore" });
  execFileSync("git", ["push", "-u", "origin", "agent/done"], { cwd: started.path, stdio: "ignore" });
  execFileSync("git", ["merge", "--no-ff", "agent/done", "-m", "Merge agent/done"], {
    cwd: repo,
    stdio: "ignore",
  });
  execFileSync("git", ["push", "origin", "main"], { cwd: repo, stdio: "ignore" });

  const result = agentFinish(repo, { slug: "done", verifyPr: false });

  assert.equal(result.removedWorktree, true);
  assert.equal(result.deletedLocalBranch, true);
  assert.equal(result.deletedRemoteBranch, true);
  assert.equal(fs.existsSync(started.path), false);
  assert.throws(() => execFileSync("git", ["show-ref", "--verify", "--quiet", "refs/heads/agent/done"], { cwd: repo }));
  assert.throws(() => execFileSync("git", ["ls-remote", "--exit-code", "--heads", "origin", "agent/done"], { cwd: repo }));
  assert.equal(result.status.branch, "main");
  assert.equal(result.status.dirty, false);
  assert.equal(result.status.aheadBehind, "0\t0");
});

test("agent git start uses a no-focus Herdr workspace", () => {
  assert.deepEqual(herdrWorkspaceCreateArgs({ path: "/tmp/socratink-agent-demo", slug: "demo" }), [
    "workspace",
    "create",
    "--cwd",
    "/tmp/socratink-agent-demo",
    "--label",
    "agent:demo",
    "--no-focus",
  ]);
});

test("agent git writes a task handoff for started agents", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-handoff-"));
  const handoff = writeAgentHandoff({
    branch: "agent/alpha-docs",
    handoffDir: dir,
    path: "/tmp/socratink-agent-alpha-docs",
    slug: "alpha-docs",
    task: "Review docs and consolidate alpha findings",
  });

  assert.equal(handoff.path, path.join(dir, "handoff-agent-alpha-docs.md"));
  const text = fs.readFileSync(handoff.path, "utf8");
  assert.match(text, /# Copyable prompt for next session/);
  assert.match(text, /Review docs and consolidate alpha findings/);
  assert.match(text, /Branch: agent\/alpha-docs/);
  assert.match(text, /Run npm run agent:git -- guard-write/);
  assert.match(text, /Do not push, merge, close PRs, delete branches/);
  assert.match(text, /Finish with one commit, or report blocked; do not leave a dirty worktree/);
});

test("agent git starts Codex from the task handoff inside Herdr", () => {
  const args = herdrAgentStartArgs({
    cwd: "/tmp/socratink-agent-alpha-docs",
    handoffPath: "/tmp/handoff-agent-alpha-docs.md",
    slug: "alpha-docs",
    task: "Review docs",
    workspaceId: "w1S",
  });

  assert.deepEqual(args.slice(0, 10), [
    "agent",
    "start",
    "agent:alpha-docs",
    "--cwd",
    "/tmp/socratink-agent-alpha-docs",
    "--workspace",
    "w1S",
    "--no-focus",
    "--",
    "codex",
  ]);
  assert.match(args.at(-1), /Read \/tmp\/handoff-agent-alpha-docs\.md/);
  assert.match(args.at(-1), /Task: Review docs/);
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
  assert.throws(
    () => assertSafeRequestedCommand(["git", "push", "--delete", "origin", "feat/old"]),
    /blocked dangerous command/,
  );
  assert.throws(
    () => assertSafeRequestedCommand(["git", "push", "--force-with-lease=refs/heads/main"]),
    /blocked dangerous command/,
  );
  assert.throws(
    () => assertSafeRequestedCommand(["git", "clean", "-fxd"]),
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
