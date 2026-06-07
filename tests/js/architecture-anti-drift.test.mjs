import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sessionResponse } from "../../lib/loop-server/session.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

function readRepoFile(relativePath) {
  return readFileSync(path.join(WORKSPACE_ROOT, relativePath), "utf8");
}

test("canonical docs do not make repair an evidence candidate", () => {
  const files = [
    "AGENTS.md",
    "HARNESS.md",
    "CONTEXT.md",
    "README.md",
    "docs/greenfield-ai-native-implementation-plan.md",
  ];
  const repairAsEvidence = /\brepairs?\b[^.\n|;]*\bevidence candidates?\b|\bevidence candidates?\b[^.\n|;]*\brepairs?\b/i;

  const violations = files
    .map((file) => ({
      file,
      line: readRepoFile(file)
        .split("\n")
        .find((text) => repairAsEvidence.test(text)),
    }))
    .filter((entry) => entry.line);

  assert.deepEqual(violations, []);
});

test("session response keeps caseComplete distinct from hosted complete", () => {
  const baseSession = {
    id: "session-1",
    status: "awaiting_input",
    phase: "idle",
    awaiting: null,
    transcript: [],
    ctx: {},
    llmCalls: [],
  };

  const caseDone = sessionResponse(
    { ...baseSession, events: [{ type: "spaced_redrill" }] },
    [],
  );
  assert.equal(caseDone.caseComplete, true);
  assert.equal(caseDone.complete, false);

  const sessionDone = sessionResponse(
    {
      ...baseSession,
      status: "complete",
      phase: null,
      events: [{ type: "idle_exit" }],
    },
    [],
  );
  assert.equal(sessionDone.caseComplete, false);
  assert.equal(sessionDone.complete, true);
});
