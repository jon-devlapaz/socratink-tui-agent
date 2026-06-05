import test from "node:test";
import assert from "node:assert/strict";
import {
  idleStartupLine,
  printIdleHelp,
  printPromptHelp,
} from "../../lib/loop-server/prompt-help.mjs";

test("idle startup line hides default-off meta command", () => {
  const line = idleStartupLine({ env: {} });
  assert.match(line, /concept/i);
  assert.match(line, /\/help/);
  assert.doesNotMatch(line, /\/meta/);
  assert.match(line, /\/feedback/);
  assert.match(line, /\/exit/);
});

test("idle startup line can expose meta when feature flag is enabled", () => {
  const line = idleStartupLine({ env: { SOCRATINK_TUI_META_COMMAND: "1" } });
  assert.match(line, /\/meta/);
});

test("printIdleHelp emits path and default commands without insider jargon", () => {
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    printIdleHelp({ env: {} });
  } finally {
    console.log = log;
  }
  assert.equal(lines.length, 2);
  assert.match(lines[0], /draft map/i);
  assert.doesNotMatch(lines.join(" "), /graph evidence|graph-neutral|solidified/i);
  assert.match(lines[1], /\/hint.*repair/i);
  assert.doesNotMatch(lines[1], /\/meta/);
});

test("step help uses plain language", () => {
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    printPromptHelp("cold_attempt");
  } finally {
    console.log = log;
  }
  assert.match(lines[0], /Cold attempt/);
  assert.match(lines[0], /from memory/i);
  assert.doesNotMatch(lines[0], /node from memory/i);
});
