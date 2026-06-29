#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mexRoot = path.join(root, ".mex");

function fail(message) {
  console.error(`[mex-truth] ${message}`);
  process.exitCode = 1;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function cleanClaim(raw) {
  return raw
    .replace(/^['"([{]+/, "")
    .replace(/[)'"\]},.;:]+$/, "")
    .split("#")[0]
    .trim();
}

function looksLikePath(claim) {
  if (/\s/.test(claim)) return false;
  return (
    /^(?:\.\/|\/Users\/|\.mex|context|patterns|scripts|docs|deploy|lib|tests|vendor|public|fixtures|learning_cases|evals|pedagogical_agents|\.github)\//.test(
      claim,
    ) || /^[A-Za-z0-9._-]+\.md$/.test(claim)
  );
}

function isExampleOnly(claim) {
  return /[*<>]|\.\.\.|your-project|\/\*$/.test(claim);
}

function resolveClaims(claim, filePath) {
  const local = path.join(path.dirname(filePath), claim);
  if (claim.startsWith("context/") || claim.startsWith("patterns/")) {
    const mexPath = path.join(mexRoot, claim);
    return [mexPath, `${mexPath}.md`];
  }
  if (claim === "ROUTER.md" || claim === "SETUP.md" || claim === "SYNC.md") {
    return [path.join(mexRoot, claim)];
  }
  if (claim.startsWith("./")) {
    return [path.join(root, claim)];
  }
  if (path.isAbsolute(claim)) {
    return [claim];
  }
  return [local, path.join(mexRoot, claim), path.join(root, claim)];
}

function pathClaims(text) {
  const claims = [];
  const patterns = [
    /`([^`\n]+)`/g,
    /\[[^\]]+\]\(([^)\s]+)\)/g,
    /(?:^|[\s(["'])((?:\.mex\/|context\/|patterns\/|scripts\/|docs\/|deploy\/|lib\/|tests\/|vendor\/|public\/|fixtures\/|learning_cases\/|evals\/|pedagogical_agents\/|\.github\/)[A-Za-z0-9._/@:+-]+|(?:AGENTS|CONTEXT|HARNESS|README|CHANGELOG|SECURITY|INDEX|HARNESS-[A-Z-]+)\.md)(?=$|[\s)"'`,.;:])/gm,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const claim = cleanClaim(match[1]);
      if (!claim || !looksLikePath(claim) || isExampleOnly(claim)) continue;
      claims.push({ claim, index: match.index ?? 0 });
    }
  }
  return claims;
}

function sortMexIssues(issues) {
  return [...issues].sort((a, b) => {
    const aKey = `${a.file || a.path || ""}:${a.line || 0}:${a.type || a.code || ""}:${a.message || ""}`;
    const bKey = `${b.file || b.path || ""}:${b.line || 0}:${b.type || b.code || ""}:${b.message || ""}`;
    return aKey.localeCompare(bKey);
  });
}

function describeMexIssue(issue) {
  const file = issue.file || issue.path || "(unknown file)";
  const line = issue.line ? `:${issue.line}` : "";
  const type = issue.type || issue.code || "ISSUE";
  const message = issue.message || issue.description || JSON.stringify(issue);
  return `${file}${line} ${type}: ${message}`;
}

function reportMexIssues(report) {
  const issues = Array.isArray(report?.issues) ? sortMexIssues(report.issues) : [];
  if (!issues.length) return;
  console.error("[mex-truth] mex issues:");
  for (const issue of issues) {
    console.error(`- ${describeMexIssue(issue)}`);
  }
}

function assertNoForbiddenAgentContext() {
  const forbidden = [
    /\bCONTEXT\.md\b/,
    /\bHARNESS\.md\b/,
    /docs\/strategy\/2026-06-20-product-moving-alpha-plan\.md/,
    /\bWhere To Look\b/,
    /Canonical gates live in AGENTS\.md/,
    /docs\/design\/socratink-ux\.md/,
    /\bDESIGN\.md\b/,
  ];
  const files = [
    path.join(root, "AGENTS.md"),
    path.join(root, "scripts", "agentlint.mjs"),
    ...walk(path.join(root, "vendor", "python", "app_prompts")).filter((file) => file.endsWith(".txt")),
    ...walk(mexRoot).filter((file) => file.endsWith(".md")),
  ];
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    const relFile = path.relative(root, filePath);
    for (const pattern of forbidden) {
      const match = pattern.exec(text);
      if (match) {
        fail(`${relFile}:${lineNumber(text, match.index)} references forbidden non-Mex agent context ${match[0]}`);
      }
    }
  }
}

const mex = spawnSync(path.join(root, "node_modules", ".bin", "mex"), ["check", "--json"], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe",
});

process.stderr.write(mex.stderr || "");
if (mex.error) {
  fail(`failed to run mex: ${mex.error.message}`);
}
let mexReport;
try {
  mexReport = JSON.parse(mex.stdout);
} catch (error) {
  if (mex.stdout) {
    console.error("[mex-truth] mex stdout:");
    console.error(mex.stdout.trimEnd());
  }
  fail(`failed to parse mex JSON output: ${error.message}`);
}
reportMexIssues(mexReport);
console.log(`mex: drift score ${mexReport?.score ?? "unknown"}/100`);
if ((mex.status ?? 1) !== 0) {
  fail(`mex check failed with status ${mex.status}`);
}
if (mexReport?.score !== 100 || mexReport?.issues?.length !== 0) {
  fail(`mex check score=${mexReport?.score ?? "unknown"} issues=${mexReport?.issues?.length ?? "unknown"}`);
}
if (process.exitCode) process.exit(process.exitCode);

if (!fs.existsSync(mexRoot)) {
  fail(".mex/ does not exist");
}

assertNoForbiddenAgentContext();

const seen = new Set();
for (const filePath of walk(mexRoot).filter((file) => file.endsWith(".md"))) {
  const text = fs.readFileSync(filePath, "utf8");
  const relFile = path.relative(root, filePath);
  for (const { claim, index } of pathClaims(text)) {
    const key = `${relFile}:${claim}:${index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const candidates = resolveClaims(claim, filePath);
    if (!candidates.some((candidate) => fs.existsSync(candidate))) {
      fail(`${relFile}:${lineNumber(text, index)} references missing path ${claim}`);
    }
  }
}

const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
for (const filePath of walk(mexRoot).filter((file) => file.endsWith(".md"))) {
  const text = fs.readFileSync(filePath, "utf8");
  for (const match of text.matchAll(/Package version is `([^`]+)`/g)) {
    if (match[1] !== packageVersion) {
      fail(
        `${path.relative(root, filePath)}:${lineNumber(text, match.index ?? 0)} claims package version ${match[1]}, package.json is ${packageVersion}`,
      );
    }
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("[mex-truth] OK");
