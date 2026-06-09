import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DIRECT_PHASE, nextPhase } from "../../lib/seda/next-phase.mjs";
import { eventDefinition } from "../../lib/seda/event-facts.mjs";
import { HANDLERS } from "../../lib/seda/handlers/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const SEDA_ROOT = path.join(WORKSPACE_ROOT, "lib/seda");

const REVIEWED_SEDA_BOUNDARY_EDGES = new Set([
  // UI formatting helpers are still called by terminal-facing SEDA helpers.
  "lib/seda/handlers/route.mjs -> lib/ui/map-legend.mjs",
  "lib/seda/provisional-map.mjs -> lib/ui/map-legend.mjs",
  // Route retry classification is shared with the bridge transport adapter.
  "lib/seda/route-generation.mjs -> lib/bridge/client.mjs",
  // Idle help copy is shared between terminal and hosted loop surfaces.
  "lib/seda/handlers/idle.mjs -> lib/loop-server/prompt-help.mjs",
  // Idle owns command routing, but feedback delivery is implemented outside SEDA.
  "lib/seda/handlers/idle.mjs -> lib/feedback/handle.mjs",
]);

const EVENT_ARRAY_MUTATORS = [
  "copyWithin",
  "fill",
  "pop",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
];

function repoPath(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).split(path.sep).join("/");
}

function readRepoFile(relativePath) {
  return readFileSync(path.join(WORKSPACE_ROOT, relativePath), "utf8");
}

function walkFiles(root, predicate = () => true) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkFiles(fullPath, predicate));
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function importsFor(source) {
  const imports = [];
  for (const match of source.matchAll(/\bimport\b[\s\S]*?\bfrom\s+["']([^"']+)["'];/g)) {
    imports.push(match[1]);
  }
  for (const match of source.matchAll(/\bimport\s+["']([^"']+)["'];/g)) {
    imports.push(match[1]);
  }
  return imports;
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [resolved, `${resolved}.mjs`, `${resolved}.js`];
  return candidates.find((candidate) => existsSync(candidate)) || resolved;
}

function handlerPhaseNamesFromIndex() {
  const source = readRepoFile("lib/seda/handlers/index.mjs");
  const match = source.match(/export const HANDLERS = \{([\s\S]*?)\n\};/);
  assert.ok(match, "HANDLERS object export not found");
  return [...match[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).sort();
}

function directPhaseTargets() {
  return [
    ...new Set(
      Object.values(DIRECT_PHASE).filter((phase) => phase !== null),
    ),
  ].sort();
}

test("nextPhase stays a pure router with no imports", () => {
  const source = readRepoFile("lib/seda/next-phase.mjs");
  assert.doesNotMatch(source, /^\s*import\b/m);
  assert.doesNotMatch(source, /\brequire\s*\(/);
});

test("nextPhase routes from the last appended event only", () => {
  const source = readRepoFile("lib/seda/next-phase.mjs");
  assert.match(source, /const last = events\.at\(-1\)/);
  assert.equal(
    nextPhase([
      { type: "cold_attempt", evaluation: { classification: "shallow" } },
      { type: "gap_identified" },
    ]),
    "repair_dialogue",
    "must ignore earlier events when the last event drives routing",
  );
});

test("multi-push handlers append the routing fact last", () => {
  const handlerBody = (relativePath, exportName) => {
    const source = readRepoFile(relativePath);
    const start = source.indexOf(`export async function ${exportName}`);
    assert.ok(start >= 0, `${relativePath} missing ${exportName}`);
    return source.slice(start);
  };

  const lastPushMatches = (body, pattern) => {
    const pushes = [...body.matchAll(/events\.push\(/g)];
    assert.ok(pushes.length > 0, "expected at least one events.push");
    assert.match(body.slice(pushes.at(-1).index), pattern);
  };

  const coldAttempt = handlerBody(
    "lib/seda/handlers/cold-attempt.mjs",
    "handleColdAttempt",
  );
  const helpCapBlock = coldAttempt.slice(
    coldAttempt.indexOf("if (turnIndex >= MAX_COLD_HELP_TURNS)"),
    coldAttempt.indexOf("ctx.composerCta = {", coldAttempt.indexOf("if (turnIndex >= MAX_COLD_HELP_TURNS)")),
  );
  lastPushMatches(helpCapBlock, /coldSupportExhausted/);

  const helpTurnBlock = coldAttempt.slice(
    coldAttempt.indexOf("if (!isSubstantiveColdEvaluation(evaluation))"),
    coldAttempt.indexOf("if (turnIndex >= MAX_COLD_HELP_TURNS)"),
  );
  lastPushMatches(helpTurnBlock, /coldHelpTurn/);

  const substantiveBlock = coldAttempt.slice(
    coldAttempt.indexOf("await store.appendAttempt"),
  );
  lastPushMatches(substantiveBlock, /coldAttempt/);

  lastPushMatches(
    handlerBody("lib/seda/handlers/repair-abandoned.mjs", "handleRepairAbandoned"),
    /repairAbandoned/,
  );

  const spacedRedrill = handlerBody(
    "lib/seda/handlers/spaced-redrill.mjs",
    "handleSpacedRedrill",
  );
  const evidenceHoldBlock = spacedRedrill.slice(spacedRedrill.indexOf("if (evidenceHold)"));
  lastPushMatches(evidenceHoldBlock, /evidenceHoldRecorded/);

  const spacedHappyPath = spacedRedrill.slice(
    spacedRedrill.indexOf("await store.appendAttempt"),
    spacedRedrill.indexOf("if (evidenceHold)"),
  );
  lastPushMatches(spacedHappyPath, /spacedRedrill/);

  const postBridge = handlerBody(
    "lib/seda/handlers/post-bridge-transfer.mjs",
    "handlePostBridgeTransfer",
  );
  const skipBlock = postBridge.slice(
    postBridge.indexOf("if (!runGap)"),
    postBridge.indexOf("console.log(\"\")", postBridge.indexOf("if (!runGap)")),
  );
  lastPushMatches(skipBlock, /postBridgeTransferSkipped/);

  const postBridgeEnd = postBridge.indexOf("\nasync function resolveRunGapDecision");
  const handlePostBridge = postBridge.slice(0, postBridgeEnd);
  lastPushMatches(handlePostBridge, /postBridgeTransferCheck/);
});

test("SEDA authority separates evaluator, bridge readiness, and graph truth", () => {
  for (const type of [
    "repair",
    "model_bridge",
    "repair_dialogue_turn",
    "gap_identified",
    "strong_cold_path",
  ]) {
    const definition = eventDefinition(type);
    assert.equal(definition.graph_neutral, true, type);
    assert.equal(definition.score_eligible, false, type);
  }

  assert.equal(eventDefinition("cold_attempt").score_eligible, true);
  assert.equal(eventDefinition("spaced_redrill").score_eligible, true);

  assert.equal(
    nextPhase([
      { type: "route_generated" },
      { type: "cold_attempt", evaluation: { classification: "solid" } },
    ]),
    "strong_cold_path",
    "evaluator solid is a routing input, not graph solidified",
  );

  assert.equal(
    nextPhase([
      { type: "gap_identified" },
      {
        type: "repair_dialogue_turn",
        bridge_ready: true,
        turn_index: 1,
        next_dialogue_action: "commit_repair",
      },
    ]),
    "repair",
    "bridge_ready is procedural readiness into repair, not graph truth",
  );
});

test("SEDA files do not add unreviewed outward dependency edges", () => {
  const violations = [];
  for (const filePath of walkFiles(SEDA_ROOT, (file) => file.endsWith(".mjs"))) {
    const source = readFileSync(filePath, "utf8");
    for (const specifier of importsFor(source)) {
      const resolved = resolveRelativeImport(filePath, specifier);
      if (!resolved) continue;
      const target = repoPath(resolved);
      if (target.startsWith("lib/seda/")) continue;
      if (target.startsWith("lib/config/")) continue;

      const edge = `${repoPath(filePath)} -> ${target}`;
      if (!REVIEWED_SEDA_BOUNDARY_EDGES.has(edge)) {
        violations.push(edge);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("handler registry covers every routed phase target", () => {
  const handlerKeys = Object.keys(HANDLERS).sort();
  assert.deepEqual(handlerKeys, handlerPhaseNamesFromIndex());

  const missing = directPhaseTargets().filter((phase) => !HANDLERS[phase]);
  assert.deepEqual(missing, []);
});

test("event log writes stay append-only in runtime source", () => {
  const runtimeFiles = [
    "app.mjs",
    ...walkFiles(SEDA_ROOT, (file) => file.endsWith(".mjs")).map(repoPath),
    ...walkFiles(path.join(WORKSPACE_ROOT, "lib/loop-server"), (file) =>
      file.endsWith(".mjs"),
    ).map(repoPath),
    ...walkFiles(path.join(WORKSPACE_ROOT, "harness"), (file) =>
      file.endsWith(".mjs"),
    ).map(repoPath),
  ];

  const violations = [];
  for (const relativePath of runtimeFiles) {
    const source = readRepoFile(relativePath);
    for (const mutator of EVENT_ARRAY_MUTATORS) {
      const pattern = new RegExp(
        `\\b(?:events|session\\.events)\\s*\\.\\s*${mutator}\\s*\\(`,
        "g",
      );
      if (pattern.test(source)) {
        violations.push(`${relativePath}: ${mutator}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
