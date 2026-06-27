#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const WORKSPACE_ROOT = process.cwd();
const TRACES_ROOT = path.join(WORKSPACE_ROOT, "learning_cases/traces");
const CASES_PATH = path.join(WORKSPACE_ROOT, "learning_cases/cases.jsonl");
const TUI = path.join(WORKSPACE_ROOT, "socratink-tui");
const PYTHON = path.join(WORKSPACE_ROOT, ".venv/bin/python");

/** @type {Array<{ case_id: string, fixture: string, env?: Record<string, string> }>} */
const CAPTURES = [
  {
    case_id: "evidence-hold-solid-spaced-primed-2026-05-26",
    fixture: "fixtures/source_less_script.json",
    env: { SOCRATINK_TUI_FAKE_SPACED_CLASSIFICATION: "solid" },
  },
  {
    case_id: "repair-abandoned-no-model-bridge-2026-05-26",
    fixture: "fixtures/blocked_repair_script.json",
  },
  {
    case_id: "strong-cold-skips-repair-until-spacing-2026-05-26",
    fixture: "fixtures/strong_cold_skip_repair_script.json",
    env: {
      SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION: "solid",
      SOCRATINK_TUI_FAKE_SPACED_CLASSIFICATION: "solid",
    },
  },
  {
    case_id: "inner-repair-dialogue-gates-model-bridge-2026-05-26",
    fixture: "fixtures/circular_repair_script.json",
    env: { SOCRATINK_TUI_FAKE_SPACED_CLASSIFICATION: "solid" },
  },
  {
    case_id: "cold-help-turn-routing-2026-05-28",
    fixture: "fixtures/cold_help_turn_routing_script.json",
  },
  {
    case_id: "recovery-close-idle-return-2026-05-28",
    fixture: "fixtures/recovery_close_idle_return_script.json",
  },
  {
    case_id: "recovery-success-routes-to-repair-2026-05-28",
    fixture: "fixtures/recovery_success_script.json",
    env: { SOCRATINK_TUI_ENABLE_RECOVERY_BRANCH: "1" },
  },
  {
    case_id: "correlation-edge-substantive-cold-2026-05-28",
    fixture: "fixtures/correlation_edge_substantive_cold.json",
    env: { SOCRATINK_TUI_FAKE_SPACED_CLASSIFICATION: "solid" },
  },
];

async function loadCases() {
  const raw = await fs.readFile(CASES_PATH, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

async function runCapture({ fixture, env = {} }) {
  const logRoot = path.join(TRACES_ROOT, ".capture-tmp");
  await fs.rm(logRoot, { recursive: true, force: true });
  await fs.mkdir(logRoot, { recursive: true });

  const mergedEnv = {
    ...process.env,
    SOCRATINK_TUI_FAKE_LLM: "1",
    SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION: "shallow",
    SOCRATINK_TUI_LOG_ROOT: logRoot,
    PYTHON,
    ...env,
  };

  const result = spawnSync(
    TUI,
    ["--scripted", fixture, "--color=never"],
    { cwd: WORKSPACE_ROOT, env: mergedEnv, encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(`${fixture} failed:\n${result.stderr || result.stdout}`);
  }

  const entries = await fs.readdir(logRoot);
  const stampDir = entries.find((name) => name.includes("T"));
  if (!stampDir) throw new Error(`no session log for ${fixture}`);
  return JSON.parse(
    await fs.readFile(path.join(logRoot, stampDir, "session.json"), "utf8"),
  );
}

function summarize(session) {
  const events = session.events || [];
  const dialogueTurns = events.filter((e) => e.type === "repair_dialogue_turn");
  const recoveryTurns = events.filter((e) => e.type === "repair_recovery_turn");
  const firstNodeId = session?.route?.first_node?.id;
  const finalNode = session.derived?.at(-1)?.nodes?.[firstNodeId] || {};
  const eventsByType = new Map(events.map((e) => [e.type, e]));
  const closed = events.findLast((e) => e.type === "repair_recovery_closed");
  return {
    event_order: events.map((e) => e.type),
    final_node_state: finalNode.state,
    cold_evaluator_classification:
      eventsByType.get("cold_attempt")?.evaluation?.classification ?? null,
    spaced_evaluator_classification:
      eventsByType.get("spaced_redrill")?.evaluation?.classification ?? null,
    repair_dialogue_turn_count: dialogueTurns.length,
    first_repair_dialogue_bridge_ready: dialogueTurns[0]?.bridge_ready ?? null,
    last_repair_dialogue_bridge_ready: dialogueTurns.at(-1)?.bridge_ready ?? null,
    evidence_hold_required:
      Array.isArray(session.evidence_holds) && session.evidence_holds.length > 0,
    repair_count: finalNode.repair_count ?? 0,
    repair_recovery_turn_count: recoveryTurns.length,
    recovery_closed_outcome: closed?.outcome ?? null,
  };
}

function syncInvariants(caseRecord, summary) {
  const invariants = { ...(caseRecord.expected_invariants || {}) };
  invariants.event_order = summary.event_order;
  invariants.final_node_state = summary.final_node_state;
  invariants.truth_source = "training_derivation";

  if (summary.cold_evaluator_classification) {
    invariants.cold_evaluator_classification = summary.cold_evaluator_classification;
  } else {
    delete invariants.cold_evaluator_classification;
  }
  if (summary.spaced_evaluator_classification) {
    invariants.spaced_evaluator_classification =
      summary.spaced_evaluator_classification;
  } else {
    delete invariants.spaced_evaluator_classification;
  }
  if (summary.repair_dialogue_turn_count > 0) {
    invariants.repair_dialogue_turn_count = summary.repair_dialogue_turn_count;
    invariants.first_repair_dialogue_bridge_ready =
      summary.first_repair_dialogue_bridge_ready;
    invariants.last_repair_dialogue_bridge_ready =
      summary.last_repair_dialogue_bridge_ready;
  } else {
    delete invariants.repair_dialogue_turn_count;
    delete invariants.first_repair_dialogue_bridge_ready;
    delete invariants.last_repair_dialogue_bridge_ready;
  }
  if (summary.evidence_hold_required) {
    invariants.evidence_hold_required = true;
  } else {
    delete invariants.evidence_hold_required;
  }
  if (Object.hasOwn(invariants, "repair_count")) {
    invariants.repair_count = summary.repair_count;
  }
  if (Object.hasOwn(caseRecord.expected_invariants || {}, "repair_recovery_turn_count")) {
    invariants.repair_recovery_turn_count = summary.repair_recovery_turn_count;
  }
  if (Object.hasOwn(caseRecord.expected_invariants || {}, "recovery_closed_outcome")) {
    invariants.recovery_closed_outcome = summary.recovery_closed_outcome;
  }
  if (eventsInclude(summary.event_order, "post_bridge_transfer_check")) {
    invariants.post_bridge_transfer_check_required = true;
    delete invariants.gap_drill;
  } else {
    delete invariants.post_bridge_transfer_check_required;
  }

  caseRecord.expected_invariants = invariants;
  caseRecord.checks = invariants;
}

function eventsInclude(eventOrder, type) {
  return eventOrder.includes(type);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cases = await loadCases();
  const caseById = new Map(cases.map((c) => [c.case_id, c]));

  for (const capture of CAPTURES) {
    const caseRecord = caseById.get(capture.case_id);
    if (!caseRecord) throw new Error(`missing case ${capture.case_id}`);

    const session = await runCapture(capture);
    const summary = summarize(session);

    console.log(`\n=== ${capture.case_id} ===`);
    console.log(`fixture: ${capture.fixture}`);
    console.log(`events: ${summary.event_order.join(" -> ")}`);
    console.log(`final: ${summary.final_node_state}`);

    syncInvariants(caseRecord, summary);

    if (!dryRun) {
      const outDir = path.join(TRACES_ROOT, capture.case_id);
      await fs.rm(path.join(outDir, ".capture-run"), { recursive: true, force: true });
      await fs.mkdir(outDir, { recursive: true });
      const outPath = path.join(outDir, "session.json");
      await fs.writeFile(outPath, `${JSON.stringify(session, null, 2)}\n`);
      caseRecord.session_log = path.relative(WORKSPACE_ROOT, outPath);
      caseRecord.trace = caseRecord.session_log;
      console.log(`wrote ${caseRecord.session_log}`);
    }
  }

  if (!dryRun) {
    await fs.writeFile(
      CASES_PATH,
      `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`,
    );
    console.log("\nUpdated learning_cases/cases.jsonl");

    const replay = spawnSync("./socratink-harness", ["replay"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    });
    console.log(replay.stdout);
    if (replay.status !== 0) {
      console.error(replay.stderr);
      process.exitCode = 1;
    }
  }
}

await main();
