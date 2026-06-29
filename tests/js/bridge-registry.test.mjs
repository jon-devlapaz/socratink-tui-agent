import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bridgeActionIds,
  getBridgeAction,
  registry,
  templateKeysInRegistry,
} from "../../lib/bridge/registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

/** PYTHON env, else .venv when bootstrapped, else CI/setup-python interpreter. */
function resolveBridgePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const venvPython = path.join(WORKSPACE_ROOT, ".venv/bin/python");
  if (existsSync(venvPython)) return venvPython;
  return "python3";
}

function promptTemplateVersions() {
  const python = resolveBridgePython();
  const script = `
import json
from prompt_templates import TEMPLATES
print(json.dumps({k: v["version"] for k, v in TEMPLATES.items()}))
`;
  const out = execFileSync(python, ["-c", script], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
  });
  return JSON.parse(out.trim());
}

function bridgeCliActions() {
  const bridgePath = path.join(WORKSPACE_ROOT, "bridge.py");
  const source = readFileSync(bridgePath, "utf8");
  const matches = [
    ...source.matchAll(/sys\.argv\[1\] == "([a-z-]+)"/g),
  ].map((m) => m[1]);
  return [...new Set(matches)].sort();
}

test("registry lists all bridge.py CLI actions", () => {
  assert.deepEqual(bridgeActionIds().sort(), bridgeCliActions());
});

test("registry template versions match prompt_templates.py", () => {
  const live = promptTemplateVersions();
  for (const actionId of bridgeActionIds()) {
    const action = getBridgeAction(actionId);
    if (!action.template_key) continue;
    assert.equal(
      action.template_version,
      live[action.template_key],
      `${actionId} template_version drift for key ${action.template_key}`,
    );
  }
});

test("every template key in registry exists in prompt_templates.py", () => {
  const live = promptTemplateVersions();
  for (const key of templateKeysInRegistry()) {
    assert.ok(live[key], `missing prompt_templates.TEMPLATES[${JSON.stringify(key)}]`);
  }
});

test("each action documents callers or modes and routing", () => {
  for (const actionId of bridgeActionIds()) {
    const action = getBridgeAction(actionId);
    const hasCallers = Array.isArray(action.callers) && action.callers.length > 0;
    const hasModes = action.modes && Object.keys(action.modes).length > 0;
    assert.ok(hasCallers || hasModes, `${actionId}: callers or modes required`);
    if (action.graph_role) {
      assert.ok(action.graph_role, actionId);
    } else if (hasModes) {
      for (const mode of Object.values(action.modes)) {
        assert.ok(mode.graph_role, `${actionId} mode graph_role`);
      }
    }
    const hasRouting =
      action.next_phase_routing ||
      hasModes ||
      (Array.isArray(action.emitted_events) && action.emitted_events.length > 0);
    assert.ok(hasRouting, `${actionId} must document routing or emitted events`);
  }
});

test("repair-scaffold documents mechanism-first scaffold fields", () => {
  const action = getBridgeAction("repair-scaffold");
  const fields = action.response.repair_scaffold_fields;
  assert.ok(fields.includes("hinge_focus"));
  assert.ok(fields.includes("contrast_prompt"));
});

test("socratic-repair-drill request accepts hinge and contrast slots", () => {
  const action = getBridgeAction("socratic-repair-drill");
  assert.ok(action.request.optional.includes("hinge_focus"));
  assert.ok(action.request.optional.includes("contrast_prompt"));
});

test("evaluate-attempt modes define per-drill contracts", () => {
  const action = getBridgeAction("evaluate-attempt");
  assert.ok(action.request.optional.includes("evidence_goal"));
  assert.ok(action.response.evaluation_fields.includes("required_ideas_present"));
  assert.ok(action.response.evaluation_fields.includes("required_ideas_missing"));
  assert.ok(action.modes);
  assert.deepEqual(Object.keys(action.modes).sort(), [
    "cold_attempt",
    "gap_drill",
    "spaced_redrill",
  ]);
  assert.deepEqual(action.modes.gap_drill.next_phase_routing_fields, []);
  assert.deepEqual(action.modes.spaced_redrill.next_phase_routing_fields, []);
  assert.ok(
    action.modes.cold_attempt.next_phase_routing_fields.includes(
      "evaluation.classification",
    ),
  );
});

test("registry transport points at bridge client", () => {
  assert.equal(registry.transport.client, "lib/bridge/client.mjs");
  assert.equal(registry.transport.entry, "bridge.py");
});
