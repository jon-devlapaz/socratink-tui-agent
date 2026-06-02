/** @typedef {import("./registry.mjs").registry} Registry */

const START_MARKER = "<!-- registry:summary:start -->";
const END_MARKER = "<!-- registry:summary:end -->";

function handlerPhases(action) {
  if (action.modes) {
    return [...new Set(Object.values(action.modes).map((m) => m.handler_phase))].join(
      ", ",
    );
  }
  return (action.callers || [])
    .map((c) => c.handler_phase)
    .filter(Boolean)
    .join(", ");
}

function graphRole(action) {
  if (action.modes) {
    return [...new Set(Object.values(action.modes).map((m) => m.graph_role))].join(
      " / ",
    );
  }
  return action.graph_role || "—";
}

function emittedEvents(action) {
  if (action.modes) {
    const events = new Set();
    for (const mode of Object.values(action.modes)) {
      for (const event of mode.emitted_events || []) events.add(event);
    }
    return [...events].join(", ");
  }
  return (action.emitted_events || []).join(", ");
}

function nextPhaseReads(actionId, action) {
  if (actionId === "evaluate-attempt") {
    return "See [evaluator routing](#evaluate-attempt)";
  }
  if (actionId === "repair-dialogue") {
    return "See [repair dialogue routing](#repair-dialogue)";
  }
  if (actionId === "socratic-repair-drill") {
    return "—";
  }
  const routing = action.next_phase_routing;
  if (Array.isArray(routing)) {
    return routing.map((r) => r.event_type).join("; ");
  }
  if (routing?.event_type && routing?.next_phase) {
    return `\`${routing.event_type}\` → \`${routing.next_phase}\` (coarse)`;
  }
  if (routing?.note) return routing.note;
  return "—";
}

function responseSchema(action) {
  if (action.response_schema) return action.response_schema;
  if (action.response_schema_note) {
    const note = action.response_schema_note;
    if (note.includes("ProvisionalMap")) return "`ProvisionalMap` + `first_node`";
    return note.split(";")[0];
  }
  return "—";
}

function templateCell(actionId, action) {
  if (!action.template_key) return "—";
  if (actionId === "generate-route") return `\`${action.template_key}\`¹`;
  return `\`${action.template_key}\``;
}

/**
 * @param {Registry} reg
 * @returns {string}
 */
export function renderRegistrySummary(reg) {
  const lines = [];
  lines.push("## Scope");
  lines.push("");
  lines.push(`**Covers:** ${reg.scope.covers}`);
  lines.push(
    `**Excludes:** ${reg.scope.excludes.map((item) => `\`${item}\``).join(", ")}`,
  );
  lines.push(
    `**See also:** ${reg.scope.see_also.map((item) => `\`${item}\``).join(", ")}`,
  );
  if (reg.policy_gates) {
    lines.push(
      "**Policy gates:** documented in `registry.json` → `policy_gates` (not subprocess wire).",
    );
  }
  lines.push("");
  lines.push("## Summary table");
  lines.push("");
  lines.push(
    "| Action | Template | Version | Response schema | Handler phase | Emitted event(s) | `nextPhase` reads |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");

  for (const [actionId, action] of Object.entries(reg.actions)) {
    lines.push(
      `| ${[
        `\`${actionId}\``,
        templateCell(actionId, action),
        action.template_version ? `\`${action.template_version}\`` : "—",
        responseSchema(action),
        handlerPhases(action) || "—",
        emittedEvents(action) || "—",
        nextPhaseReads(actionId, action),
      ].join(" | ")} |`,
    );
  }

  lines.push("");
  lines.push(
    "¹ **Route template pin:** `prompt_templates.TEMPLATES[\"route\"]` is the versioned",
  );
  lines.push(
    "contract (validated by `tests/test_prompt_template.py`). The live prompt is",
  );
  lines.push(
    "`ai_service.generate_smallest_provisional_map` in `vendor/python/` — not",
  );
  lines.push(
    "`build_prompt()` in `bridge.py`. Bump the route template version when the route *contract*",
  );
  lines.push(
    "changes; bump `route_runtime.prompt_sha256` when the runtime prompt file changes.",
  );
  lines.push("");
  lines.push(
    "Regenerate this block: `node scripts/refresh-bridge-registry-doc.mjs`",
  );

  return lines.join("\n");
}

/**
 * @param {string} markdown
 * @returns {string}
 */
export function extractGeneratedSummary(markdown) {
  const start = markdown.indexOf(START_MARKER);
  const end = markdown.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("registry summary markers missing from HARNESS-BRIDGE-REGISTRY.md");
  }
  return markdown.slice(start + START_MARKER.length, end).trim();
}

/**
 * @param {string} markdown
 * @param {string} summary
 * @returns {string}
 */
export function spliceGeneratedSummary(markdown, summary) {
  const start = markdown.indexOf(START_MARKER);
  const end = markdown.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("registry summary markers missing from HARNESS-BRIDGE-REGISTRY.md");
  }
  return (
    markdown.slice(0, start + START_MARKER.length) +
    "\n" +
    summary +
    "\n" +
    markdown.slice(end)
  );
}

export { START_MARKER, END_MARKER };
