import test from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_STARTUP_LINE,
  printIdleHelp,
  printPromptHelp,
} from "../../lib/loop-server/prompt-help.mjs";

test("idle startup line lists core commands", () => {
  assert.match(IDLE_STARTUP_LINE, /concept/i);
  assert.match(IDLE_STARTUP_LINE, /\/help/);
  assert.match(IDLE_STARTUP_LINE, /\/meta/);
  assert.match(IDLE_STARTUP_LINE, /\/feedback/);
  assert.match(IDLE_STARTUP_LINE, /\/exit/);
});

test("printIdleHelp emits path and commands without insider jargon", () => {
  const lines = [];
  const log = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    printIdleHelp();
  } finally {
    console.log = log;
  }
  assert.equal(lines.length, 2);
  assert.match(lines[0], /draft map/i);
  assert.doesNotMatch(lines.join(" "), /graph evidence|graph-neutral|solidified/i);
  assert.match(lines[1], /\/hint.*repair/i);
  assert.match(lines[1], /\/meta.*why this step/i);
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
