#!/usr/bin/env node
/**
 * Bump LOOP_APP_VERSION across canonical files.
 *
 * Usage:
 *   node scripts/bump-loop-version.mjs          # increment v0.NN
 *   node scripts/bump-loop-version.mjs --check    # verify all files match version.mjs
 *   node scripts/bump-loop-version.mjs --print    # print current version only
 *   node scripts/bump-loop-version.mjs --next v0.17
 *   node scripts/bump-loop-version.mjs --set v0.18
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_MJS = path.join(ROOT, "lib/loop-server/version.mjs");
const INDEX_HTML = path.join(ROOT, "public/loop/index.html");
const LOOP_JS = path.join(ROOT, "public/loop/loop.js");
const PACKAGE_JSON = path.join(ROOT, "package.json");

const LOOP_VERSION_RE = /^v0\.(\d{2})$/;

export function parseLoopVersion(text) {
  const match = String(text).match(/LOOP_APP_VERSION_DEFAULT = "(v0\.\d{2})"/);
  if (!match) {
    throw new Error(`Could not parse LOOP_APP_VERSION_DEFAULT in ${VERSION_MJS}`);
  }
  return match[1];
}

export function nextLoopVersion(current) {
  const match = current.match(LOOP_VERSION_RE);
  if (!match) {
    throw new Error(`Invalid loop version label: ${current}`);
  }
  const next = Number.parseInt(match[1], 10) + 1;
  if (next > 99) {
    throw new Error(`Loop version overflow: ${current}`);
  }
  return `v0.${String(next).padStart(2, "0")}`;
}

export function loopVersionToSemver(loopVersion) {
  const match = loopVersion.match(LOOP_VERSION_RE);
  if (!match) {
    throw new Error(`Invalid loop version label: ${loopVersion}`);
  }
  return `0.${match[1]}.0`;
}

function readCurrentVersion() {
  return parseLoopVersion(readFileSync(VERSION_MJS, "utf8"));
}

function updateVersionMjs(version) {
  const src = readFileSync(VERSION_MJS, "utf8");
  const next = src.replace(
    /LOOP_APP_VERSION_DEFAULT = "v0\.\d{2}"/,
    `LOOP_APP_VERSION_DEFAULT = "${version}"`,
  );
  if (next === src) {
    throw new Error("Failed to update lib/loop-server/version.mjs");
  }
  writeFileSync(VERSION_MJS, next);
}

function updateIndexHtml(version) {
  const src = readFileSync(INDEX_HTML, "utf8");
  const next = src.replace(
    /(<span id="version-pill"[^>]*>)v0\.\d{2}(<\/span>)/,
    `$1${version}$2`,
  );
  if (next === src) {
    throw new Error("Failed to update public/loop/index.html version pill");
  }
  writeFileSync(INDEX_HTML, next);
}

function updateLoopJs(version) {
  const src = readFileSync(LOOP_JS, "utf8");
  const next = src.replace(
    /(health\?\.app_version \|\| ")v0\.\d{2}(")/,
    `$1${version}$2`,
  );
  if (next === src) {
    throw new Error("Failed to update public/loop/loop.js fallback version");
  }
  writeFileSync(LOOP_JS, next);
}

function updatePackageJson(version) {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  pkg.version = loopVersionToSemver(version);
  writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
}

export function readSyncedVersions() {
  const versionMjs = readCurrentVersion();
  const indexHtml = readFileSync(INDEX_HTML, "utf8");
  const loopJs = readFileSync(LOOP_JS, "utf8");
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));

  const indexMatch = indexHtml.match(
    /<span id="version-pill"[^>]*>(v0\.\d{2})<\/span>/,
  );
  const loopJsMatch = loopJs.match(/health\?\.app_version \|\| "(v0\.\d{2})"/);

  return {
    versionMjs,
    indexHtml: indexMatch?.[1] ?? null,
    loopJs: loopJsMatch?.[1] ?? null,
    packageJson: pkg.version ?? null,
    packageJsonExpected: loopVersionToSemver(versionMjs),
  };
}

export function assertVersionsSynced() {
  const versions = readSyncedVersions();
  const mismatches = [];

  if (versions.indexHtml !== versions.versionMjs) {
    mismatches.push(
      `public/loop/index.html (${versions.indexHtml}) !== ${versions.versionMjs}`,
    );
  }
  if (versions.loopJs !== versions.versionMjs) {
    mismatches.push(
      `public/loop/loop.js (${versions.loopJs}) !== ${versions.versionMjs}`,
    );
  }
  if (versions.packageJson !== versions.packageJsonExpected) {
    mismatches.push(
      `package.json (${versions.packageJson}) !== ${versions.packageJsonExpected}`,
    );
  }

  if (mismatches.length > 0) {
    throw new Error(
      `LOOP_APP_VERSION files out of sync with ${VERSION_MJS}:\n- ${mismatches.join("\n- ")}`,
    );
  }

  return versions.versionMjs;
}

export function applyLoopVersion(version) {
  updateVersionMjs(version);
  updateIndexHtml(version);
  updateLoopJs(version);
  updatePackageJson(version);
  return version;
}

export function bumpLoopVersion() {
  const current = readCurrentVersion();
  const next = nextLoopVersion(current);
  applyLoopVersion(next);
  return { previous: current, next };
}

function isMainModule() {
  const entry = process.argv[1];
  return entry && path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const argv = process.argv.slice(2);
  const args = new Set(argv);

  if (args.has("--print")) {
    console.log(readCurrentVersion());
    process.exit(0);
  }

  if (args.has("--check")) {
    const version = assertVersionsSynced();
    console.log(`[bump-loop-version] synced at ${version}`);
    process.exit(0);
  }

  const nextFlag = argv.find((arg) => arg === "--next");
  const nextIndex = nextFlag ? argv.indexOf("--next") : -1;
  if (nextIndex !== -1) {
    const base = argv[nextIndex + 1];
    if (!base) {
      throw new Error("--next requires a version argument");
    }
    console.log(nextLoopVersion(base));
    process.exit(0);
  }

  const setFlag = argv.find((arg) => arg === "--set");
  const setIndex = setFlag ? argv.indexOf("--set") : -1;
  if (setIndex !== -1) {
    const target = argv[setIndex + 1];
    if (!target) {
      throw new Error("--set requires a version argument");
    }
    const current = readCurrentVersion();
    applyLoopVersion(target);
    console.log(`[bump-loop-version] ${current} -> ${target}`);
    process.exit(0);
  }

  const { previous, next } = bumpLoopVersion();
  console.log(`[bump-loop-version] ${previous} -> ${next}`);
}
