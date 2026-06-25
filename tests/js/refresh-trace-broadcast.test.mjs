import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scriptPath = path.resolve("scripts/refresh-trace-broadcast.mjs");

test("refresh trace broadcast dry-run dedupes cases and only writes product_loop", () => {
  const root = mkdtempSync(path.join(tmpdir(), "refresh-trace-broadcast-"));
  const sessionRel = "learning_cases/traces/case-a/session.json";
  const sessionPath = path.join(root, sessionRel);
  const events = [
    { type: "repair_abandoned", graph_neutral: true },
    {
      type: "repair_recovery_closed",
      graph_neutral: true,
      outcome: "idle_return",
    },
    { type: "idle_exit" },
  ];
  const session = { id: "case-a", events, product_loop: { stale: true } };

  try {
    mkdirSync(path.dirname(sessionPath), { recursive: true });
    writeFileSync(
      path.join(root, "learning_cases/cases.jsonl"),
      [
        JSON.stringify({ id: "one", session_log: sessionRel }),
        JSON.stringify({ id: "duplicate", session_log: sessionRel }),
        "",
      ].join("\n"),
    );
    writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`);

    const dryRun = spawnSync("node", [scriptPath, "--dry-run"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(
      (dryRun.stdout.match(/learning_cases\/traces\/case-a\/session\.json/g) || [])
        .length,
      1,
    );
    assert.deepEqual(JSON.parse(readFileSync(sessionPath, "utf8")), session);

    const write = spawnSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
    assert.equal(write.status, 0, write.stderr);
    const updated = JSON.parse(readFileSync(sessionPath, "utf8"));
    assert.deepEqual(updated.events, events);
    assert.equal(
      updated.product_loop.bridge_gate,
      "own-words hinge process must connect starting situation to outcome (bridge_ready gate)",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
