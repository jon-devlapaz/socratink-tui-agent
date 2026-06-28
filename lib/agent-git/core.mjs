import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PROTECTED_BRANCH_PATTERNS = [/^main$/, /^master$/, /^prod$/, /^production$/, /^release\//];

export const DANGEROUS_COMMANDS = [
  ["git", "reset", "--hard"],
  ["git", "clean", "-fd"],
  ["git", "clean", "-fdx"],
  ["git", "branch", "-D"],
  ["git", "push", "--force"],
  ["git", "push", "--force-with-lease"],
  ["git", "push", "origin", "--delete"],
  ["gh", "pr", "close"],
  ["gh", "pr", "merge", "--admin"],
  ["rm", "-rf"],
];

export class CommandError extends Error {
  constructor(message, { code = 1, stdout = "", stderr = "" } = {}) {
    super(message);
    this.name = "CommandError";
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function execQuiet(cmd, args = [], options = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: options.cwd,
      encoding: "utf8",
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    }).trimEnd();
  } catch (error) {
    throw new CommandError(`${cmd} ${args.join(" ")} failed`, {
      code: error.status || 1,
      stdout: error.stdout?.toString() || "",
      stderr: error.stderr?.toString() || "",
    });
  }
}

export function runStatus(cmd, args = [], options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    code: result.status || 0,
    stdout: (result.stdout || "").trimEnd(),
    stderr: (result.stderr || "").trimEnd(),
  };
}

export function repoRoot(cwd = process.cwd()) {
  return execQuiet("git", ["rev-parse", "--show-toplevel"], { cwd });
}

export function currentBranch(cwd) {
  return execQuiet("git", ["branch", "--show-current"], { cwd });
}

export function validateAgentSlug(slug) {
  if (!slug || !/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) {
    throw new CommandError("agent slug must use letters, numbers, dots, underscores, or dashes", { code: 2 });
  }
  if (slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
    throw new CommandError("agent slug must not contain path separators", { code: 2 });
  }
  return slug;
}

export function agentWorktreePath(root, slug) {
  return path.resolve(path.dirname(root), `socratink-agent-${slug}`);
}

export function assertCleanWorktree(cwd) {
  const porcelain = execQuiet("git", ["status", "--porcelain=v1"], { cwd });
  if (porcelain) {
    throw new CommandError("Refusing to start an agent worktree from a dirty checkout. Commit, stash, or rescue first.", {
      code: 2,
      stdout: porcelain,
    });
  }
}

export function herdrWorkspaceCreateArgs({ path: cwd, slug }) {
  return ["workspace", "create", "--cwd", cwd, "--label", `agent:${slug}`, "--no-focus"];
}

export function agentTaskPrompt({ handoffPath, task }) {
  return `Read ${handoffPath} and continue from its Copyable prompt for next session section. Task: ${task}`;
}

export function writeAgentHandoff({ branch, handoffDir = os.tmpdir(), path: cwd, slug, task }) {
  if (!task) return null;
  const handoffPath = path.join(handoffDir, `handoff-agent-${slug}.md`);
  const prompt = `I want to discuss and possibly work on: ${task}

Context:
- Repo: Socratink TUI.
- Branch: ${branch}.
- Worktree: ${cwd}.
- Goal: ${task}.
- Keep graph honesty intact: learner reconstruction is evidence; substrate, help, repair, lab summaries, and dashboard projections are context unless promoted through the repo's evidence path.

Before editing:
- Read AGENTS.md.
- Run npm run agent:git -- guard-write.
- Inspect the relevant docs, code, tests, recent commits, and local evidence before changing anything.
- Decide whether the task is still real, already solved, over-scoped, or better handled differently.
- Call out stale assumptions, hidden risks, and anything that should stop the work.

Task:
- Do the smallest coherent change that satisfies the goal.
- Keep changes scoped to this branch and worktree.
- Do not push, merge, close PRs, delete branches, or post public comments unless explicitly told.
- Finish with one commit, or report blocked; do not leave a dirty worktree.

Validation:
- Run the smallest relevant checks.
- For docs-only work, run a readability review and git diff --check.

Output:
- Start with findings and recommendation.
- Then list changed files and proof run.
`;

  fs.writeFileSync(
    handoffPath,
    `# Copyable prompt for next session

${prompt}

# Suggested skills

- handoff
- govuk-style
- ponytail:ponytail
`,
  );
  return { path: handoffPath, prompt };
}

function herdrWorkspaceId(output) {
  try {
    return JSON.parse(output).result?.workspace?.workspace_id || null;
  } catch {
    return null;
  }
}

export function herdrAgentStartArgs({ cwd, handoffPath, slug, task, workspaceId }) {
  const args = ["agent", "start", `agent:${slug}`, "--cwd", cwd];
  if (workspaceId) args.push("--workspace", workspaceId);
  args.push("--no-focus", "--", "codex", agentTaskPrompt({ handoffPath, task }));
  return args;
}

export function openHerdrWorkspace({ branch, path: cwd, slug, startAgent = false, task }, env = process.env) {
  if (env.HERDR_ENV !== "1") return { opened: false, skipped: "HERDR_ENV is not 1" };
  const result = runStatus("herdr", herdrWorkspaceCreateArgs({ path: cwd, slug }), { env });
  if (!result.ok) {
    return { opened: false, skipped: result.stderr || result.stdout || "herdr workspace create failed" };
  }
  const opened = { opened: true, output: result.stdout };
  if (!startAgent || !task) return opened;

  const handoff = writeAgentHandoff({ branch, path: cwd, slug, task });
  const agent = runStatus(
    "herdr",
    herdrAgentStartArgs({
      cwd,
      handoffPath: handoff.path,
      slug,
      task,
      workspaceId: herdrWorkspaceId(result.stdout),
    }),
    { env },
  );
  return {
    ...opened,
    agent: agent.ok
      ? { started: true, output: agent.stdout }
      : { started: false, skipped: agent.stderr || agent.stdout || "herdr agent start failed" },
    handoff,
  };
}

export function agentWorktreeStart(cwd = process.cwd(), { slug, herdr = false, startAgent = false, task = "" } = {}) {
  validateAgentSlug(slug);
  const root = repoRoot(cwd);
  assertCleanWorktree(root);
  const branch = `agent/${slug}`;
  const target = agentWorktreePath(root, slug);
  const existingTarget = runStatus("git", ["-C", target, "rev-parse", "--show-toplevel"]);
  if (existingTarget.ok) {
    const result = { root, branch, path: target, created: false };
    if (herdr) result.herdr = openHerdrWorkspace({ branch, path: target, slug, startAgent, task });
    return result;
  }

  const branchExists = runStatus("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: root }).ok;
  const args = branchExists
    ? ["worktree", "add", target, branch]
    : ["worktree", "add", "-b", branch, target];
  execQuiet("git", args, { cwd: root });
  const result = { root, branch, path: target, created: true };
  if (herdr) result.herdr = openHerdrWorkspace({ branch, path: target, slug, startAgent, task });
  return result;
}

function assertMergedPr(root, branch) {
  const prResult = runStatus(
    "gh",
    ["pr", "list", "--state", "all", "--head", branch, "--limit", "20", "--json", "number,state,mergedAt,url,headRefName"],
    { cwd: root },
  );
  if (!prResult.ok) {
    throw new CommandError("Refusing to finish without GitHub PR proof.", {
      code: 2,
      stderr: prResult.stderr || prResult.stdout,
    });
  }
  const prs = JSON.parse(prResult.stdout || "[]");
  const merged = prs.find((pr) => pr.mergedAt || pr.state === "MERGED");
  if (!merged) {
    throw new CommandError(`Refusing to finish ${branch}; no merged PR found.`, { code: 2 });
  }
  return merged;
}

export function agentFinish(cwd = process.cwd(), { slug, verifyPr = true } = {}) {
  validateAgentSlug(slug);
  const root = repoRoot(cwd);
  const base = defaultBranch(root) || "main";
  const current = currentBranch(root);
  const branch = `agent/${slug}`;
  const target = agentWorktreePath(root, slug);

  if (current !== base) {
    throw new CommandError(`Run finish from ${base}, not ${current}.`, { code: 2 });
  }
  assertCleanWorktree(root);
  const pr = verifyPr ? assertMergedPr(root, branch) : null;

  execQuiet("git", ["fetch", "origin", base], { cwd: root });
  execQuiet("git", ["merge", "--ff-only", `origin/${base}`], { cwd: root });

  let removedWorktree = false;
  if (runStatus("git", ["-C", target, "rev-parse", "--show-toplevel"]).ok) {
    assertCleanWorktree(target);
    execQuiet("git", ["worktree", "remove", target], { cwd: root });
    removedWorktree = true;
  }

  let deletedLocalBranch = false;
  if (runStatus("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: root }).ok) {
    execQuiet("git", ["branch", "-d", branch], { cwd: root });
    deletedLocalBranch = true;
  }

  let deletedRemoteBranch = false;
  if (runStatus("git", ["ls-remote", "--exit-code", "--heads", "origin", branch], { cwd: root }).ok) {
    execQuiet("git", ["push", "origin", "--delete", branch], { cwd: root });
    deletedRemoteBranch = true;
  }

  execQuiet("git", ["fetch", "--prune", "origin"], { cwd: root });

  return {
    root,
    base,
    branch,
    path: target,
    pr,
    removedWorktree,
    deletedLocalBranch,
    deletedRemoteBranch,
    status: collectStatus(root, { gh: false }),
  };
}

export function agentWorktreeGuard(cwd = process.cwd(), env = process.env) {
  const root = repoRoot(cwd);
  const branch = currentBranch(root);
  if (isProtectedBranch(branch) && env.SOCRATINK_INTEGRATOR !== "1") {
    throw new CommandError("Refusing agent work on protected branch. Use npm run agent:git -- start <slug>.", {
      code: 2,
    });
  }
  return { root, branch, ok: true };
}

export function agentWriteGuard(cwd = process.cwd(), env = process.env) {
  const root = repoRoot(cwd);
  const branch = currentBranch(root);
  if (isProtectedBranch(branch) && env.SOCRATINK_INTEGRATOR !== "1") {
    throw new CommandError(
      "Refusing agent file edits on protected branch. Use npm run agent:git -- start <slug> or set SOCRATINK_INTEGRATOR=1.",
      { code: 2 },
    );
  }
  return { root, branch, ok: true };
}

function existingBaseRef(root, base) {
  if (runStatus("git", ["rev-parse", "--verify", `origin/${base}`], { cwd: root }).ok) return `origin/${base}`;
  return base;
}

function lines(text) {
  return text ? text.split("\n").filter(Boolean) : [];
}

export function agentVerdict(cwd = process.cwd(), { slug } = {}) {
  validateAgentSlug(slug);
  const root = repoRoot(cwd);
  const base = defaultBranch(root) || "main";
  const baseRef = existingBaseRef(root, base);
  const branch = `agent/${slug}`;
  const target = agentWorktreePath(root, slug);
  const branchExists = runStatus("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: root }).ok;
  const worktreeExists = runStatus("git", ["-C", target, "rev-parse", "--show-toplevel"]).ok;

  if (!branchExists || !worktreeExists) {
    return {
      root,
      base,
      baseRef,
      branch,
      path: target,
      branchExists,
      worktreeExists,
      dirty: null,
      ahead: 0,
      commits: [],
      changedFiles: [],
      diffStat: "",
      recommendation: "blocked",
      reason: !branchExists ? "missing branch" : "missing worktree",
    };
  }

  const porcelain = execQuiet("git", ["status", "--porcelain=v1"], { cwd: target });
  const dirty = porcelain.length > 0;
  const aheadText = execQuiet("git", ["rev-list", "--count", `${baseRef}..${branch}`], { cwd: root });
  const ahead = Number(aheadText);
  const commits = lines(execQuiet("git", ["log", "--oneline", `${baseRef}..${branch}`], { cwd: root }));
  const changedFiles = lines(execQuiet("git", ["diff", "--name-status", `${baseRef}...${branch}`], { cwd: root }));
  const diffStat = execQuiet("git", ["diff", "--stat", `${baseRef}...${branch}`], { cwd: root });

  if (dirty) {
    return {
      root,
      base,
      baseRef,
      branch,
      path: target,
      branchExists,
      worktreeExists,
      dirty,
      porcelain,
      ahead,
      commits,
      changedFiles,
      diffStat,
      recommendation: "blocked",
      reason: "dirty worktree",
    };
  }

  return {
    root,
    base,
    baseRef,
    branch,
    path: target,
    branchExists,
    worktreeExists,
    dirty,
    porcelain,
    ahead,
    commits,
    changedFiles,
    diffStat,
    recommendation: ahead === 0 && changedFiles.length === 0 ? "empty" : "review",
    reason: ahead === 0 && changedFiles.length === 0 ? "no branch changes" : "ready for integrator review",
  };
}

export function defaultBranch(cwd) {
  const symbolic = runStatus("git", ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], {
    cwd,
  });
  if (symbolic.ok && symbolic.stdout.startsWith("origin/")) {
    return symbolic.stdout.slice("origin/".length);
  }
  for (const candidate of ["main", "master"]) {
    if (runStatus("git", ["rev-parse", "--verify", `origin/${candidate}`], { cwd }).ok) {
      return candidate;
    }
  }
  return null;
}

export function isProtectedBranch(branch) {
  return PROTECTED_BRANCH_PATTERNS.some((pattern) => pattern.test(branch));
}

export function parseRemoteOwnerRepo(remoteUrl) {
  if (!remoteUrl) return null;
  const https = remoteUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (https) return `${https[1]}/${https[2]}`;
  const ssh = remoteUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  return null;
}

function isSubsequence(needle, haystack) {
  let index = 0;
  for (const token of haystack) {
    if (token === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

export function assertSafeRequestedCommand(args) {
  if (!args.length) return;
  const normalized = args.map((arg) => String(arg).toLowerCase());
  const [cmd, sub, ...rest] = normalized;
  const has = (flag) => rest.includes(flag);
  const hasFlag = (flag) => rest.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
  const hasCombinedCleanFlags = (...flags) =>
    rest.some((arg) => arg.startsWith("-") && flags.every((flag) => arg.includes(flag)));
  const block = (shape) => {
    throw new CommandError(
      `blocked dangerous command: ${shape}. Use agent-git rescue first, then run destructive git manually if still needed.`,
      { code: 2 },
    );
  };

  if (cmd === "git" && sub === "reset" && has("--hard")) block("git reset --hard");
  if (
    cmd === "git" &&
    sub === "clean" &&
    (hasCombinedCleanFlags("f", "d") || (has("-f") && has("-d")))
  ) {
    block("git clean -fd/-fdx");
  }
  if (cmd === "git" && sub === "branch" && (has("-d") || has("--delete"))) {
    block("git branch delete");
  }
  if (
    cmd === "git" &&
    sub === "push" &&
    (hasFlag("--delete") ||
      hasFlag("--force") ||
      hasFlag("--force-with-lease") ||
      hasFlag("--mirror") ||
      has("-f"))
  ) {
    block("git push destructive flag");
  }
  if (cmd === "gh" && sub === "pr" && rest.includes("close")) block("gh pr close");
  if (cmd === "gh" && sub === "pr" && rest.includes("merge") && has("--admin")) {
    block("gh pr merge --admin");
  }
  if (
    cmd === "rm" &&
    (normalized.includes("-rf") ||
      normalized.includes("-fr") ||
      (normalized.includes("-r") && normalized.includes("-f")))
  ) {
    block("rm -rf");
  }

  for (const dangerous of DANGEROUS_COMMANDS) {
    if (isSubsequence(dangerous.map((arg) => arg.toLowerCase()), normalized)) block(dangerous.join(" "));
  }
}

export function collectStatus(cwd = process.cwd(), { gh = true } = {}) {
  const root = repoRoot(cwd);
  const branch = currentBranch(root);
  const base = defaultBranch(root);
  const porcelain = execQuiet("git", ["status", "--porcelain=v1"], { cwd: root });
  const shortBranch = execQuiet("git", ["status", "--short", "--branch"], { cwd: root });
  const worktrees = execQuiet("git", ["worktree", "list", "--porcelain"], { cwd: root });
  const aheadBehind =
    base && runStatus("git", ["rev-parse", "--verify", `origin/${base}`], { cwd: root }).ok
      ? execQuiet("git", ["rev-list", "--left-right", "--count", `origin/${base}...HEAD`], {
          cwd: root,
        })
      : null;

  let pr = null;
  let checks = null;
  if (gh) {
    const prResult = runStatus(
      "gh",
      [
        "pr",
        "view",
        "--json",
        "number,state,isDraft,reviewDecision,headRefName,baseRefName,url",
      ],
      { cwd: root },
    );
    if (prResult.ok && prResult.stdout) {
      pr = JSON.parse(prResult.stdout);
      const checksResult = runStatus("gh", ["pr", "checks", "--json", "name,state,bucket,link"], {
        cwd: root,
      });
      if (checksResult.ok && checksResult.stdout) checks = JSON.parse(checksResult.stdout);
    }
  }

  return {
    root,
    branch,
    base,
    dirty: porcelain.length > 0,
    porcelain,
    shortBranch,
    aheadBehind,
    worktrees,
    pr,
    checks,
    protectedBranch: isProtectedBranch(branch),
  };
}

export function doctor(cwd = process.cwd()) {
  const root = repoRoot(cwd);
  const base = defaultBranch(root);
  const branch = currentBranch(root);
  const originUrl = runStatus("git", ["config", "--get", "remote.origin.url"], { cwd: root });
  const ownerRepo = parseRemoteOwnerRepo(originUrl.stdout);
  const checks = [];

  checks.push({ name: "repo", ok: true, detail: root });
  checks.push({ name: "origin", ok: originUrl.ok && Boolean(originUrl.stdout), detail: originUrl.stdout });
  checks.push({ name: "default_branch", ok: Boolean(base), detail: base || "missing origin/HEAD" });
  checks.push({
    name: "current_branch_not_protected",
    ok: !isProtectedBranch(branch),
    detail: branch,
    severity: isProtectedBranch(branch) ? "warn" : "ok",
  });

  const ghAuth = runStatus("gh", ["auth", "status"], { cwd: root });
  checks.push({
    name: "gh_auth",
    ok: ghAuth.ok,
    detail: ghAuth.ok ? "authenticated" : ghAuth.stderr || ghAuth.stdout || "gh auth failed",
  });

  const gtr = runStatus("git", ["gtr", "--version"], { cwd: root });
  checks.push({
    name: "git_gtr",
    ok: gtr.ok,
    detail: gtr.ok ? gtr.stdout : "not installed; native git worktree fallback required",
    severity: gtr.ok ? "ok" : "warn",
  });

  if (ownerRepo && base && ghAuth.ok) {
    const repoView = runStatus("gh", ["repo", "view", ownerRepo, "--json", "deleteBranchOnMerge"], {
      cwd: root,
    });
    checks.push({
      name: "github_auto_delete_head_branches",
      ok: repoView.ok && JSON.parse(repoView.stdout || "{}").deleteBranchOnMerge === true,
      detail: repoView.ok ? repoView.stdout : repoView.stderr,
      severity: "warn",
    });

    const protection = runStatus("gh", ["api", `repos/${ownerRepo}/branches/${encodeURIComponent(base)}/protection`], {
      cwd: root,
    });
    checks.push({
      name: "branch_protection",
      ok: protection.ok,
      detail: protection.ok ? `${base} protected` : protection.stderr || "not found",
      severity: protection.ok ? "ok" : "warn",
    });
  } else {
    checks.push({
      name: "github_repo_metadata",
      ok: false,
      detail: "skipped; GitHub owner/repo, default branch, or gh auth unavailable",
      severity: "warn",
    });
  }

  return { root, branch, base, ownerRepo, checks };
}

export function classifyBranch(branch, context) {
  const {
    current,
    mergedBranches = new Set(),
    remoteBranches = new Set(),
    openPrBranches = new Set(),
    closedPrBranches = new Set(),
    mergedPrBranches = new Set(),
    uniqueCommitBranches = new Set(),
    dirtyWorktreeBranches = new Set(),
  } = context;

  if (branch === current) return { branch, action: "keep", reason: "current branch" };
  if (isProtectedBranch(branch)) return { branch, action: "keep", reason: "protected branch pattern" };
  if (dirtyWorktreeBranches.has(branch)) return { branch, action: "keep", reason: "dirty worktree" };
  if (openPrBranches.has(branch)) return { branch, action: "keep", reason: "open PR" };
  if (mergedBranches.has(branch) || mergedPrBranches.has(branch)) {
    return {
      branch,
      action: "delete-local",
      reason: remoteBranches.has(branch) ? "merged; remote may also be deleted after proof" : "merged local branch",
    };
  }
  if (closedPrBranches.has(branch)) {
    return { branch, action: "archive-first", reason: "closed but unmerged PR" };
  }
  if (uniqueCommitBranches.has(branch)) {
    return { branch, action: "keep", reason: "unique commits not reachable from origin base" };
  }
  return { branch, action: "keep", reason: "no merge or PR proof" };
}

function localBranches(root) {
  return execQuiet("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads"], {
    cwd: root,
  })
    .split("\n")
    .filter(Boolean);
}

function worktreeBranches(root) {
  const raw = execQuiet("git", ["worktree", "list", "--porcelain"], { cwd: root });
  const dirty = new Set();
  const entries = [];
  let current = {};
  for (const line of raw.split("\n")) {
    if (!line) {
      if (current.path && current.branch) entries.push(current);
      current = {};
      continue;
    }
    if (line.startsWith("path ")) current.path = line.slice("path ".length);
    if (line.startsWith("branch refs/heads/")) {
      current.branch = line.slice("branch refs/heads/".length);
    }
  }
  if (current.path && current.branch) entries.push(current);

  for (const entry of entries) {
    const status = runStatus("git", ["status", "--porcelain=v1"], { cwd: entry.path });
    if (status.ok && status.stdout) dirty.add(entry.branch);
  }
  return dirty;
}

export function cleanupDryRun(cwd = process.cwd()) {
  const root = repoRoot(cwd);
  const current = currentBranch(root);
  const base = defaultBranch(root) || "main";
  const branches = localBranches(root);
  const mergedBranches = new Set(
    execQuiet("git", ["branch", "--merged", `origin/${base}`], { cwd: root })
      .split("\n")
      .map((line) => line.replace(/^\*?\s*/, "").trim())
      .filter(Boolean),
  );
  const remoteBranches = new Set(
    execQuiet("git", ["branch", "-r", "--format=%(refname:short)"], { cwd: root })
      .split("\n")
      .filter((name) => name.startsWith("origin/"))
      .map((name) => name.slice("origin/".length))
      .filter((name) => name !== "HEAD"),
  );

  const uniqueCommitBranches = new Set();
  for (const branch of branches) {
    if (branch === current) continue;
    const unique = runStatus("git", ["rev-list", "--max-count=1", `origin/${base}..${branch}`], {
      cwd: root,
    });
    if (unique.ok && unique.stdout) uniqueCommitBranches.add(branch);
  }

  const openPrBranches = new Set();
  const closedPrBranches = new Set();
  const mergedPrBranches = new Set();
  const prResult = runStatus(
    "gh",
    ["pr", "list", "--state", "all", "--limit", "100", "--json", "headRefName,state,mergedAt"],
    { cwd: root },
  );
  if (prResult.ok && prResult.stdout) {
    for (const pr of JSON.parse(prResult.stdout)) {
      if (pr.state === "OPEN") openPrBranches.add(pr.headRefName);
      if (pr.state === "CLOSED" && pr.mergedAt) mergedPrBranches.add(pr.headRefName);
      if (pr.state === "CLOSED" && !pr.mergedAt) closedPrBranches.add(pr.headRefName);
      if (pr.state === "MERGED") mergedPrBranches.add(pr.headRefName);
    }
  }

  const context = {
    current,
    mergedBranches,
    remoteBranches,
    openPrBranches,
    closedPrBranches,
    mergedPrBranches,
    uniqueCommitBranches,
    dirtyWorktreeBranches: worktreeBranches(root),
  };

  return {
    root,
    base,
    current,
    branches: branches.map((branch) => classifyBranch(branch, context)),
    ghAvailable: prResult.ok,
  };
}

export function rescue(cwd = process.cwd(), { message = "" } = {}) {
  const root = repoRoot(cwd);
  const rescueRoot = path.join(root, ".agent", "rescue");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(rescueRoot, stamp);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, "status.txt"), execQuiet("git", ["status", "--short", "--branch"], { cwd: root }) + "\n");
  fs.writeFileSync(path.join(dir, "worktree.patch"), runStatus("git", ["diff"], { cwd: root }).stdout + "\n");
  fs.writeFileSync(path.join(dir, "index.patch"), runStatus("git", ["diff", "--staged"], { cwd: root }).stdout + "\n");
  fs.writeFileSync(
    path.join(dir, "untracked-files.txt"),
    runStatus("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root }).stdout + "\n",
  );

  const stashMessage = `agent-git rescue ${stamp}${message ? `: ${message}` : ""}`;
  const stash = runStatus("git", ["stash", "push", "--include-untracked", "-m", stashMessage], {
    cwd: root,
  });

  return {
    root,
    rescueDir: dir,
    stashMessage,
    stashed: stash.ok && !stash.stdout.includes("No local changes"),
    stashOutput: stash.stdout || stash.stderr,
  };
}
