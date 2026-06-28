#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { registry } from "../lib/bridge/registry.mjs";
import { proveRoutingChain } from "../lib/seda/routing-proofs.mjs";

const WORKSPACE_ROOT = process.cwd();
const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const CASES_PATH = path.join(WORKSPACE_ROOT, "learning_cases/cases.jsonl");
const TYPE_TO_STATUS = {
  regression: "active_regression",
  golden: "active_golden",
  research: "research_only",
};
const CASE_SOURCES = new Set([
  "human_dogfood",
  "scripted_fixture",
  "simulated_learner",
  "regression_trace",
]);
const FINAL_STATES = new Set(["primed", "needs repair", "solidified"]);

function usage() {
  return [
    "Usage:",
    "  node scripts/promote-learning-case.mjs .qa-runs/.../session.json \\",
    "    --case-id <slug> --case-type regression --case-source regression_trace \\",
    '    --product-question "..." --observed-failure "..." --expected-invariant "..."',
    "",
    "Promotes one raw .qa-runs session trace into learning_cases.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  const options = {
    sessionPath: null,
    caseId: null,
    caseType: "regression",
    caseSource: "regression_trace",
    productQuestion: null,
    observedFailure: null,
    expectedInvariant: null,
    testAdded: null,
    agentContractVersion: null,
    dryRun: false,
  };
  const args = [...argv.slice(2)];
  options.sessionPath = args.shift();
  while (args.length) {
    const arg = args.shift();
    if (arg === "--case-id") options.caseId = args.shift();
    else if (arg === "--case-type") options.caseType = args.shift();
    else if (arg === "--case-source") options.caseSource = args.shift();
    else if (arg === "--product-question") options.productQuestion = args.shift();
    else if (arg === "--observed-failure") options.observedFailure = args.shift();
    else if (arg === "--expected-invariant") options.expectedInvariant = args.shift();
    else if (arg === "--test-added") options.testAdded = args.shift();
    else if (arg === "--agent-contract-version") options.agentContractVersion = args.shift();
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function loadCases() {
  const raw = await fs.readFile(CASES_PATH, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

function requireText(value, name) {
  if (!String(value || "").trim()) throw new Error(`${name} is required`);
}

function validateOptions(options, cases) {
  requireText(options.sessionPath, "session path");
  requireText(options.caseId, "--case-id");
  requireText(options.productQuestion, "--product-question");
  requireText(options.observedFailure, "--observed-failure");
  requireText(options.expectedInvariant, "--expected-invariant");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.caseId)) {
    throw new Error("--case-id must be a lowercase slug");
  }
  if (!Object.hasOwn(TYPE_TO_STATUS, options.caseType)) {
    throw new Error(`unknown --case-type: ${options.caseType}`);
  }
  if (!CASE_SOURCES.has(options.caseSource)) {
    throw new Error(`unknown --case-source: ${options.caseSource}`);
  }
  if (cases.some((caseRecord) => caseRecord.case_id === options.caseId)) {
    throw new Error(`case already exists: ${options.caseId}`);
  }
}

function validateInputPath(inputPath) {
  if (path.basename(inputPath) !== "session.json") {
    throw new Error("input must be a session.json file");
  }
  const rel = path.relative(WORKSPACE_ROOT, inputPath);
  if (rel.startsWith("..") || path.isAbsolute(rel) || !rel.startsWith(".qa-runs/")) {
    throw new Error("input must live under .qa-runs/");
  }
}

function getFinalNode(session, caseId) {
  const firstNodeId = session?.route?.first_node?.id;
  if (!firstNodeId) throw new Error(`${caseId}: first-node-id-required`);
  const finalNode = session?.derived?.at(-1)?.nodes?.[firstNodeId];
  if (!finalNode?.state) throw new Error(`${caseId}: final-node-state-required`);
  if (!FINAL_STATES.has(finalNode.state)) {
    throw new Error(`${caseId}: unknown final node state: ${finalNode.state}`);
  }
  return finalNode;
}

function buildCaseRecord(options, session) {
  if (!String(session.concept || "").trim()) throw new Error("session.concept is required");
  if (!Array.isArray(session.events) || !session.events.length) {
    throw new Error("session.events must be a non-empty array");
  }
  if (session.events.some((event) => !event?.type)) {
    throw new Error("every session event must have a type");
  }

  const proof = proveRoutingChain(session.events, registry);
  if (!proof.ok) {
    throw new Error(`routing proof failed: ${(proof.failures || [proof.error]).join("; ")}`);
  }

  const finalNode = getFinalNode(session, options.caseId);
  const eventsByType = new Map(session.events.map((event) => [event.type, event]));
  const expectedInvariants = {
    event_order: session.events.map((event) => event.type),
    final_node_state: finalNode.state,
    truth_source: "training_derivation",
  };
  const cold = eventsByType.get("cold_attempt")?.evaluation?.classification;
  const spaced = eventsByType.get("spaced_redrill")?.evaluation?.classification;
  if (cold) expectedInvariants.cold_evaluator_classification = cold;
  if (spaced) expectedInvariants.spaced_evaluator_classification = spaced;
  expectedInvariants.evidence_hold_required =
    Array.isArray(session.evidence_holds) && session.evidence_holds.length > 0;

  const caseRecord = {
    case_id: options.caseId,
    status: TYPE_TO_STATUS[options.caseType] === "research_only" ? "research_only" : "active",
    kind: options.caseType,
    source: options.caseSource,
    claim: options.expectedInvariant,
    risk: options.observedFailure,
    trace: `learning_cases/traces/${options.caseId}/session.json`,
    checks: expectedInvariants,
    case_type: options.caseType,
    case_source: options.caseSource,
    promotion_status: TYPE_TO_STATUS[options.caseType],
    session_log: `learning_cases/traces/${options.caseId}/session.json`,
    concept: session.concept,
    product_question: options.productQuestion,
    observed_failure: options.observedFailure,
    expected_invariant: options.expectedInvariant,
    expected_invariants: expectedInvariants,
  };
  if (options.agentContractVersion) {
    caseRecord.agent_contract_version = options.agentContractVersion;
  }
  if (options.testAdded) caseRecord.test_added = options.testAdded;
  return caseRecord;
}

function runHarness(command) {
  const result = spawnSync("node", [path.join(SCRIPT_ROOT, "..", "harness", "replay.mjs"), command], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`socratink-harness ${command} failed`);
}

async function main() {
  const options = parseArgs(process.argv);
  const cases = await loadCases();
  validateOptions(options, cases);
  const inputPath = path.resolve(WORKSPACE_ROOT, options.sessionPath);
  validateInputPath(inputPath);
  await fs.stat(inputPath);
  const session = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const caseRecord = buildCaseRecord(options, session);
  const outPath = path.join(WORKSPACE_ROOT, caseRecord.session_log);

  try {
    await fs.stat(path.dirname(outPath));
    throw new Error(`destination already exists: ${path.dirname(outPath)}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (options.dryRun) {
    console.log(JSON.stringify(caseRecord, null, 2));
    console.log(`would copy ${path.relative(WORKSPACE_ROOT, inputPath)} -> ${caseRecord.session_log}`);
    return;
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.copyFile(inputPath, outPath);
  await fs.writeFile(CASES_PATH, `${[...cases, caseRecord].map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(`promoted ${caseRecord.case_id}`);
  console.log(`wrote ${caseRecord.session_log}`);
  runHarness("replay");
  runHarness("routing-proof");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
