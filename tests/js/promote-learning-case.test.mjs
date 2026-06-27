import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scriptPath = path.resolve("scripts/promote-learning-case.mjs");
const fixtureSession = path.resolve(
  "learning_cases/traces/inner-repair-dialogue-gates-model-bridge-2026-05-26/session.json",
);

function makeWorkspace() {
  const root = mkdtempSync(path.join(tmpdir(), "promote-learning-case-"));
  mkdirSync(path.join(root, "learning_cases"), { recursive: true });
  mkdirSync(path.join(root, ".qa-runs/run-a"), { recursive: true });
  writeFileSync(path.join(root, "learning_cases/cases.jsonl"), "");
  copyFileSync(fixtureSession, path.join(root, ".qa-runs/run-a/session.json"));
  return root;
}

function promoteArgs(extra = []) {
  return [
    scriptPath,
    ".qa-runs/run-a/session.json",
    "--case-id",
    "inner-repair-dialogue-2026-06-27",
    "--case-type",
    "regression",
    "--case-source",
    "regression_trace",
    "--product-question",
    "Does circular repair stay graph-neutral until bridge-ready?",
    "--observed-failure",
    "Vague repair could reveal the model bridge too early.",
    "--expected-invariant",
    "Repair dialogue stays graph-neutral and final graph truth comes from derivation.",
    ...extra,
  ];
}

test("promote learning case dry-run prints row and writes nothing", () => {
  const root = makeWorkspace();
  try {
    const result = spawnSync("node", promoteArgs(["--dry-run"]), {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"case_id": "inner-repair-dialogue-2026-06-27"/);
    assert.match(result.stdout, /"claim": "Repair dialogue stays graph-neutral/);
    assert.match(result.stdout, /"trace": "learning_cases\/traces\/inner-repair-dialogue-2026-06-27\/session.json"/);
    assert.match(result.stdout, /"truth_source": "training_derivation"/);
    assert.equal(readFileSync(path.join(root, "learning_cases/cases.jsonl"), "utf8"), "");
    assert.equal(
      existsSync(path.join(root, "learning_cases/traces/inner-repair-dialogue-2026-06-27")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("promote learning case writes trace, appends row, and runs gates", () => {
  const root = makeWorkspace();
  try {
    const result = spawnSync("node", promoteArgs(), {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /promoted inner-repair-dialogue-2026-06-27/);
    assert.match(result.stdout, /Socratink Harness/);
    assert.match(result.stdout, /routing proof/);

    const outPath = path.join(
      root,
      "learning_cases/traces/inner-repair-dialogue-2026-06-27/session.json",
    );
    assert.equal(readFileSync(outPath, "utf8"), readFileSync(fixtureSession, "utf8"));

    const [row] = readFileSync(path.join(root, "learning_cases/cases.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(row.promotion_status, "active_regression");
    assert.equal(row.status, "active");
    assert.equal(row.kind, "regression");
    assert.equal(row.source, "regression_trace");
    assert.equal(
      row.claim,
      "Repair dialogue stays graph-neutral and final graph truth comes from derivation.",
    );
    assert.equal(row.risk, "Vague repair could reveal the model bridge too early.");
    assert.equal(row.trace, "learning_cases/traces/inner-repair-dialogue-2026-06-27/session.json");
    assert.equal(
      row.session_log,
      "learning_cases/traces/inner-repair-dialogue-2026-06-27/session.json",
    );
    assert.deepEqual(row.checks, row.expected_invariants);
    assert.deepEqual(row.expected_invariants.event_order, [
      "idle_new_concept",
      "launch_attempt",
      "route_generated",
      "cold_attempt",
      "gap_identified",
      "repair_dialogue_turn",
      "repair_dialogue_turn",
      "repair",
      "model_bridge",
      "post_bridge_transfer_check",
      "spacing_advanced",
      "spaced_redrill",
      "idle_exit",
    ]);
    assert.equal(row.expected_invariants.final_node_state, "primed");
    assert.equal(row.expected_invariants.cold_evaluator_classification, "shallow");
    assert.equal(row.expected_invariants.spaced_evaluator_classification, "solid");
    assert.equal(row.expected_invariants.evidence_hold_required, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("promote learning case rejects duplicate case ids", () => {
  const root = makeWorkspace();
  try {
    writeFileSync(
      path.join(root, "learning_cases/cases.jsonl"),
      `${JSON.stringify({ case_id: "inner-repair-dialogue-2026-06-27" })}\n`,
    );
    const result = spawnSync("node", promoteArgs(), { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /case already exists/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("promote learning case rejects non qa-runs input", () => {
  const root = makeWorkspace();
  try {
    mkdirSync(path.join(root, "tmp"), { recursive: true });
    copyFileSync(fixtureSession, path.join(root, "tmp/session.json"));
    const args = promoteArgs();
    args[1] = "tmp/session.json";
    const result = spawnSync("node", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /input must live under \.qa-runs\//);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
