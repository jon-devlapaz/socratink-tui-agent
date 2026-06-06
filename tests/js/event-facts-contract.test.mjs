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

import {
  EVENT_FACT_TYPES,
  eventDefinition,
} from "../../lib/seda/event-facts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const SEDA_ROOT = path.join(WORKSPACE_ROOT, "lib/seda");

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

const EXPECTED_APPEND_SITE_COUNTS = Object.freeze({
  "app.mjs": 1,
  "lib/loop-server/session.mjs": 1,
  "lib/seda/handlers/cold-attempt.mjs": 5,
  "lib/seda/handlers/delta.mjs": 5,
  "lib/seda/handlers/idle.mjs": 5,
  "lib/seda/handlers/ignition.mjs": 2,
  "lib/seda/handlers/model-bridge.mjs": 2,
  "lib/seda/handlers/post-bridge-transfer.mjs": 5,
  "lib/seda/handlers/repair-abandoned.mjs": 5,
  "lib/seda/handlers/repair-dialogue.mjs": 9,
  "lib/seda/handlers/repair-recovery.mjs": 8,
  "lib/seda/handlers/repair.mjs": 2,
  "lib/seda/handlers/route.mjs": 2,
  "lib/seda/handlers/spaced-redrill.mjs": 4,
  "lib/seda/handlers/spacing.mjs": 1,
  "lib/seda/handlers/strong-cold-path.mjs": 1,
  "lib/seda/handlers/substrate-gate.mjs": 8,
  "lib/seda/meta-command.mjs": 1,
  "lib/seda/route-generation.mjs": 1,
});

const RUNTIME_EVENT_TYPES = Object.freeze([
  "bridge_error",
  "cold_attempt",
  "cold_help_turn",
  "cold_support_exhausted",
  "evidence_hold_recorded",
  "gap_identified",
  "idle_exit",
  "idle_new_concept",
  "idle_redrill",
  "launch_attempt",
  "learner_goal_set",
  "meta_turn",
  "model_bridge",
  "post_bridge_transfer_check",
  "post_bridge_transfer_decision",
  "post_bridge_transfer_skipped",
  "repair",
  "repair_abandoned",
  "repair_cap_selected",
  "repair_dialogue_turn",
  "repair_hint_requested",
  "repair_recovery_closed",
  "repair_recovery_started",
  "repair_recovery_turn",
  "repair_state_bucketed",
  "route_generated",
  "route_retry",
  "spaced_redrill",
  "spacing_advanced",
  "strong_cold_path",
  "substrate_confirmed",
  "substrate_refinement",
  "substrate_seed_offered",
  "substrate_support_exhausted",
]);

const GRAPH_NEUTRAL_TYPES = Object.freeze([
  "bridge_error",
  "cold_help_turn",
  "cold_support_exhausted",
  "evidence_hold_recorded",
  "gap_identified",
  "meta_turn",
  "model_bridge",
  "post_bridge_transfer_check",
  "post_bridge_transfer_decision",
  "post_bridge_transfer_skipped",
  "repair",
  "repair_abandoned",
  "repair_cap_selected",
  "repair_dialogue_turn",
  "repair_hint_requested",
  "repair_recovery_closed",
  "repair_recovery_started",
  "repair_recovery_turn",
  "repair_state_bucketed",
  "route_retry",
  "strong_cold_path",
  "substrate_confirmed",
  "substrate_refinement",
  "substrate_seed_offered",
  "substrate_support_exhausted",
]);

const SCORE_ELIGIBLE_TYPES = Object.freeze([
  "cold_attempt",
  "spaced_redrill",
]);

const LEARNER_TEXT_TYPES = Object.freeze([
  "cold_attempt",
  "cold_help_turn",
  "launch_attempt",
  "post_bridge_transfer_check",
  "repair",
  "repair_dialogue_turn",
  "repair_hint_requested",
  "repair_recovery_turn",
  "spaced_redrill",
  "substrate_refinement",
]);

const ROUTING_FACT_TYPES = Object.freeze([
  "bridge_error",
  "cold_attempt",
  "cold_help_turn",
  "cold_support_exhausted",
  "evidence_hold_recorded",
  "gap_identified",
  "idle_exit",
  "idle_new_concept",
  "idle_redrill",
  "learner_goal_set",
  "model_bridge",
  "post_bridge_transfer_check",
  "post_bridge_transfer_decision",
  "post_bridge_transfer_skipped",
  "repair",
  "repair_abandoned",
  "repair_dialogue_turn",
  "repair_recovery_closed",
  "repair_recovery_turn",
  "route_generated",
  "route_retry",
  "spaced_redrill",
  "spacing_advanced",
  "strong_cold_path",
  "substrate_confirmed",
  "substrate_refinement",
  "substrate_seed_offered",
  "substrate_support_exhausted",
]);

const KC_REQUIRED_TYPES = Object.freeze([
  "cold_attempt",
  "post_bridge_transfer_check",
  "repair",
  "repair_dialogue_turn",
  "repair_hint_requested",
  "repair_recovery_turn",
  "spaced_redrill",
  "strong_cold_path",
]);

const HELPER_CONSTRUCTED_EVENTS = Object.freeze({
  "lib/bridge/client.mjs": [{ type: "route_retry", builder: "routeRetry" }],
  "lib/seda/bridge-fail-closed.mjs": [{ type: "bridge_error", builder: "bridgeError" }],
  "lib/seda/handlers/substrate-gate.mjs": [
    { type: "substrate_confirmed", builder: "substrateConfirmed" },
  ],
  "lib/seda/repair-dialogue-helpers.mjs": [
    { type: "repair_dialogue_turn", builder: "repairDialogueTurn" },
  ],
});

function readRepoFile(relativePath) {
  return readFileSync(path.join(WORKSPACE_ROOT, relativePath), "utf8");
}

function repoPath(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).split(path.sep).join("/");
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

function runtimeFiles() {
  return [
    "app.mjs",
    ...walkFiles(SEDA_ROOT, (file) => file.endsWith(".mjs")).map(repoPath),
    ...walkFiles(path.join(WORKSPACE_ROOT, "lib/loop-server"), (file) =>
      file.endsWith(".mjs"),
    ).map(repoPath),
  ];
}

function appendSiteCounts() {
  const counts = {};
  const pushPattern = /\b(?:events|session\.events)\s*\.\s*push\s*\(/g;
  for (const relativePath of runtimeFiles()) {
    const count = [...readRepoFile(relativePath).matchAll(pushPattern)].length;
    if (count > 0) counts[relativePath] = count;
  }
  return Object.fromEntries(Object.entries(counts).sort());
}

function eventTypesIn(relativePath) {
  return [
    ...new Set(
      [...readRepoFile(relativePath).matchAll(/\btype:\s*["']([a-z_]+)["']/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

function sorted(value) {
  return [...value].sort();
}

function assertSubset(name, subset, universe) {
  const missing = subset.filter((item) => !universe.includes(item));
  assert.deepEqual(missing, [], `${name} contains unknown event type(s)`);
}

test("runtime append-site inventory is explicit before event-fact migration", () => {
  assert.deepEqual(appendSiteCounts(), EXPECTED_APPEND_SITE_COUNTS);
});

test("event log writes stay append-only in characterized runtime source", () => {
  const violations = [];
  for (const relativePath of runtimeFiles()) {
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

test("current runtime event taxonomy separates graph, score, text, routing, and kc rules", () => {
  assert.deepEqual(sorted(new Set(RUNTIME_EVENT_TYPES)), RUNTIME_EVENT_TYPES);
  assert.deepEqual(EVENT_FACT_TYPES, RUNTIME_EVENT_TYPES);
  assertSubset("graph-neutral list", GRAPH_NEUTRAL_TYPES, RUNTIME_EVENT_TYPES);
  assertSubset("score-eligible list", SCORE_ELIGIBLE_TYPES, RUNTIME_EVENT_TYPES);
  assertSubset("learner-text list", LEARNER_TEXT_TYPES, RUNTIME_EVENT_TYPES);
  assertSubset("routing-fact list", ROUTING_FACT_TYPES, RUNTIME_EVENT_TYPES);
  assertSubset("kc-required list", KC_REQUIRED_TYPES, RUNTIME_EVENT_TYPES);

  assert.equal(
    SCORE_ELIGIBLE_TYPES.includes("strong_cold_path"),
    false,
    "strong_cold_path is graph-neutral routing telemetry, not score-eligible evidence",
  );
  assert.equal(GRAPH_NEUTRAL_TYPES.includes("strong_cold_path"), true);
});

test("helper-constructed event inventory names non-literal append inputs", () => {
  for (const [relativePath, helpers] of Object.entries(HELPER_CONSTRUCTED_EVENTS)) {
    assert.equal(existsSync(path.join(WORKSPACE_ROOT, relativePath)), true);
    const source = readRepoFile(relativePath);
    for (const { type, builder } of helpers) {
      assert.ok(
        eventTypesIn(relativePath).includes(type) ||
          source.includes(`eventBuilders.${builder}`),
        `${relativePath} should construct ${type}`,
      );
    }
  }
});

test("event-facts architecture note captures duplication inventory and destination rule", () => {
  const doc = readRepoFile("docs/architecture/seda-event-facts.md");
  for (const heading of [
    "## Runtime Event Rules",
    "## Append-Site Inventory",
    "## Event-Construction Helpers",
    "## Duplication Inventory",
    "## Destination Rule",
    "## Documented Exceptions",
  ]) {
    assert.match(doc, new RegExp(`^${heading}$`, "m"));
  }

  for (const requiredPhrase of [
    "routing stays in `lib/seda/next-phase.mjs`",
    "training derivation stays in the canon/training-store path",
    "canonical projection cardinality stays in `lib/seda/event-taxonomy.mjs`",
    "product metric formulas stay in `lib/observability/dashboard-metrics.mjs`",
  ]) {
    assert.match(doc, new RegExp(requiredPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("repair hint events persist command text when classified as learner text", () => {
  const definition = eventDefinition("repair_hint_requested");
  assert.equal(definition.learner_text, true);
  assert.ok(definition.persisted_fields.includes("text"));

  const source = readRepoFile("lib/seda/handlers/repair-dialogue.mjs");
  assert.match(
    source,
    /eventBuilders\.repairHintRequested\(\{[\s\S]*\btext:\s*repairInput\b/,
  );
});
