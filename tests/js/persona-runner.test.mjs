import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCartridge,
  isContinueAwaiting,
  loadCartridges,
  scriptedInput,
  validateCartridge,
  writePersonaArtifacts,
} from "../../lib/lab/persona-runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

test("loadCartridges returns bundled founder cartridges", () => {
  const cartridges = loadCartridges(ROOT);
  assert.ok(cartridges.length >= 4);
  assert.ok(cartridges.some((c) => c.id === "jordan-ai"));
  assert.ok(cartridges.some((c) => c.id === "novice-immune-memory"));
});

test("getCartridge resolves matrix aliases", () => {
  const novice = getCartridge("novice", ROOT);
  assert.equal(novice.id, "novice-immune-memory");
  assert.match(novice.persona_hint, /Mia/);
});

test("validateCartridge rejects incomplete records", () => {
  assert.throws(
    () => validateCartridge({ id: "x", label: "x" }),
    /missing required field: concept/,
  );
});

test("persona runner core turn contract", () => {
  const text = readFileSync(path.join(ROOT, "lib/lab/persona-runner.mjs"), "utf8");
  assert.match(text, /isContinueAwaiting/);
  assert.match(text, /transport_continue/);
  assert.match(text, /JSON\.stringify\(body\)/);
  assert.match(text, /run_gap_drill/);
  assert.match(text, /persona_hint/);
  assert.match(text, /preflightPersonaRun/);
});

test("scriptedInput covers ignition and gap drill", () => {
  const profile = getCartridge("jordan-ai", ROOT);
  assert.equal(
    scriptedInput({ awaiting: { key: "concept" }, phase: "idle" }, profile),
    profile.concept,
  );
  assert.equal(scriptedInput({ awaiting: { key: "run_gap_drill" } }, profile), "y");
});

test("isContinueAwaiting detects transport continue", () => {
  assert.equal(isContinueAwaiting({ awaiting: { key: "continue" } }), true);
  assert.equal(isContinueAwaiting({ awaiting: { key: "cold_attempt" } }), false);
});

test("writePersonaArtifacts persists session.json when record is provided", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "persona-artifact-"));
  const profile = getCartridge("novice-immune-memory", ROOT);
  const sessionRecord = {
    events: [{ type: "spaced_redrill" }],
    derived: [{ event: "spaced_redrill", concept_status: { badge: "primed" } }],
  };
  const log = {
    brains: "tutor=live-gemini student=cloud:gemini allow_fake=false",
    turns: [],
    final: {
      complete: false,
      case_complete: true,
      hit_max_turns: false,
      phase: "idle",
      event_types: ["spaced_redrill"],
    },
  };
  const { sessionPath } = writePersonaArtifacts({
    log,
    health: { fake_llm: false },
    outDir,
    profile,
    sessionRecord,
  });
  assert.ok(sessionPath?.endsWith("session.json"));
  const written = JSON.parse(readFileSync(sessionPath, "utf8"));
  assert.deepEqual(written.derived.at(-1).concept_status.badge, "primed");
});
