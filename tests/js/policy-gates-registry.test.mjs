import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registry } from "../../lib/bridge/registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

test("policy_gates modules exist on disk", () => {
  assert.ok(registry.policy_gates);
  for (const gate of Object.values(registry.policy_gates)) {
    const modulePath = path.join(WORKSPACE_ROOT, gate.module);
    assert.ok(existsSync(modulePath), `missing policy gate module: ${gate.module}`);
  }
});

test("cold_substantive gate exports isSubstantiveColdEvaluation", () => {
  const source = readFileSync(
    path.join(WORKSPACE_ROOT, "lib/seda/cold-gating.mjs"),
    "utf8",
  );
  assert.match(source, /export function isSubstantiveColdEvaluation/);
  const gate = registry.policy_gates.cold_substantive;
  assert.equal(gate.function, "isSubstantiveColdEvaluation");
});

test("repair_uncertainty gate lists repair-policy functions", () => {
  const source = readFileSync(
    path.join(WORKSPACE_ROOT, "lib/seda/repair-policy.mjs"),
    "utf8",
  );
  for (const fn of registry.policy_gates.repair_uncertainty.functions) {
    assert.match(source, new RegExp(`export function ${fn}`));
  }
});

test("post_call_hooks section present in registry", () => {
  assert.ok(registry.post_call_hooks);
  assert.ok(registry.post_call_hooks["repair-dialogue"]);
  assert.ok(registry.post_call_hooks["evaluate-attempt"]);
});
