import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { handleIgnition } from "../../lib/seda/handlers/ignition.mjs";
import { handleRoute } from "../../lib/seda/handlers/route.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

const REQUIRED_LAUNCH_ATTEMPT_FIELDS = [
  "concept",
  "concept_id",
  "learner_goal",
  "text",
];

const REQUIRED_ROUTE_GENERATED_FIELDS = [
  "first_node",
  "node_ids",
  "provisional_map",
  "map_displayed",
  "substrate_adequacy",
  "retry_count",
  "retry_reasons",
];

function readRepoFile(relativePath) {
  return readFileSync(path.join(WORKSPACE_ROOT, relativePath), "utf8");
}

function missingFields(event, requiredFields) {
  return requiredFields.filter((field) => !(field in event));
}

function walkFiles(root, predicate = () => true) {
  if (!existsSync(root)) return [];
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

test("launch_attempt persistence contract rejects legacy text-only facts", () => {
  assert.deepEqual(missingFields({ type: "launch_attempt", text: "rough sketch" }, REQUIRED_LAUNCH_ATTEMPT_FIELDS), [
    "concept",
    "concept_id",
    "learner_goal",
  ]);

  assert.deepEqual(
    missingFields(
      {
        type: "launch_attempt",
        concept: "Photosynthesis",
        concept_id: "photosynthesis",
        learner_goal: "Explain energy conversion",
        text: "Plants use light to make sugar.",
      },
      REQUIRED_LAUNCH_ATTEMPT_FIELDS,
    ),
    [],
  );
});

test("route_generated persistence contract rejects ctx-only route facts", () => {
  assert.deepEqual(
    missingFields(
      { type: "route_generated", substrate_adequacy: "adequate" },
      REQUIRED_ROUTE_GENERATED_FIELDS,
    ),
    [
      "first_node",
      "node_ids",
      "provisional_map",
      "map_displayed",
      "retry_count",
      "retry_reasons",
    ],
  );

  assert.deepEqual(
    missingFields(
      {
        type: "route_generated",
        first_node: {
          id: "kc-1",
          kc_id: "kc-1",
          label: "Energy conversion",
          mechanism: "Light energy drives sugar formation.",
        },
        node_ids: ["kc-1"],
        provisional_map: { nodes: [{ id: "kc-1" }], edges: [] },
        map_displayed: { nodes: [{ id: "kc-1" }], edges: [] },
        substrate_adequacy: "adequate",
        retry_count: 0,
        retry_reasons: [],
      },
      REQUIRED_ROUTE_GENERATED_FIELDS,
    ),
    [],
  );
});

test("ignition emits self-sufficient launch_attempt facts", async () => {
  const events = [];
  const writes = [];
  const ctx = {
    concept: "Photosynthesis",
    conceptId: "",
    learnerGoal: "Explain how light becomes sugar",
    launchAttempt: "Light helps plants make sugar.",
    section: (_kind, label) => `[${label}]`,
  };

  await handleIgnition({
    events,
    store: {
      setProvenance: async (...args) => writes.push(["provenance", ...args]),
      setSketch: async (...args) => writes.push(["sketch", ...args]),
    },
    prompt: {
      ask: async () => {
        throw new Error("prompt should not be needed");
      },
    },
    ctx,
  });

  assert.deepEqual(events.at(-1), {
    type: "launch_attempt",
    concept: "Photosynthesis",
    concept_id: "photosynthesis",
    learner_goal: "Explain how light becomes sugar",
    text: "Light helps plants make sugar.",
  });
  assert.equal(writes.length, 2);
});

test("route emits reconstructable route_generated facts", async () => {
  const events = [{ type: "substrate_confirmed", adequacy: "minimal" }];
  const firstNode = {
    id: "photo-1",
    kc_id: "photo-1",
    label: "Light energy conversion",
    mechanism: "Chlorophyll captures light energy to drive sugar formation.",
    learner_prompt: "Explain how light energy changes into stored sugar.",
  };
  const provisionalMap = { nodes: [firstNode], edges: [] };
  const ctx = {
    concept: "Photosynthesis",
    learnerGoal: "Explain energy conversion",
    launchAttempt: "Plants use light to make sugar.",
    firstNode: null,
    nodeIds: [],
    route: null,
    composerCta: null,
    colorEnabled: false,
    section: (_kind, label) => `[${label}]`,
    agentLookup: new Map([
      ["route_designer", { id: "route_designer" }],
      ["route", { id: "route_designer" }],
      ["cold_attempt", { id: "cold_attempt" }],
    ]),
  };

  await handleRoute({
    events,
    bridge: {
      callBridgeResult: () => ({
        ok: true,
        payload: {
          first_node: firstNode,
          provisional_map: provisionalMap,
          llm_call: { provider: "fake", model: "route", latency_ms: 0 },
        },
      }),
    },
    options: { logRawLlm: false, loopUi: true },
    ctx,
  });

  const event = events.at(-1);
  assert.equal(event.type, "route_generated");
  assert.equal(event.first_node, firstNode);
  assert.deepEqual(event.node_ids, ["photo-1"]);
  assert.equal(event.provisional_map, provisionalMap);
  assert.equal(event.substrate_adequacy, "minimal");
  assert.equal(event.retry_count, 0);
  assert.deepEqual(event.retry_reasons, []);
  assert.ok(event.map_displayed);
});

test("loop-server persistence modules do not import nextPhase directly", () => {
  const loopFiles = walkFiles(
    path.join(WORKSPACE_ROOT, "lib/loop-server"),
    (file) => file.endsWith(".mjs"),
  );
  const violations = [];
  for (const filePath of loopFiles) {
    const relativePath = path.relative(WORKSPACE_ROOT, filePath).split(path.sep).join("/");
    if (relativePath === "lib/loop-server/session.mjs") continue;
    const imports = importsFor(readFileSync(filePath, "utf8"));
    if (imports.some((specifier) => specifier.includes("next-phase"))) {
      violations.push(relativePath);
    }
  }
  assert.deepEqual(violations, []);
});
