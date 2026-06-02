import test from "node:test";
import assert from "node:assert/strict";

import { registry } from "../../lib/bridge/registry.mjs";
import { renderRegistrySummary } from "../../lib/bridge/render-registry-doc.mjs";

test("renderRegistrySummary includes scope covers text", () => {
  const md = renderRegistrySummary(registry);
  assert.match(md, new RegExp(registry.scope.covers.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("renderRegistrySummary table has six action rows", () => {
  const md = renderRegistrySummary(registry);
  const rows = md
    .split("\n")
    .filter((line) => line.startsWith("| `") && !line.startsWith("| Action"));
  assert.equal(rows.length, 6);
  assert.match(md, /`generate-route`/);
  assert.match(md, /`substrate-gate`/);
  assert.match(md, /`evaluate-attempt`/);
  assert.match(md, /`repair-scaffold`/);
  assert.match(md, /`socratic-repair-drill`/);
  assert.match(md, /`repair-dialogue`/);
});

test("renderRegistrySummary includes template versions from registry", () => {
  const md = renderRegistrySummary(registry);
  for (const action of Object.values(registry.actions)) {
    if (action.template_version) {
      assert.match(md, new RegExp(`\`${action.template_version}\``));
    }
  }
});
