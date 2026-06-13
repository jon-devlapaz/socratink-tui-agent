import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyStudentProvider,
  compatibleDefaultModel,
  compatibleStudentModel,
  compactLabEventTail,
  fakeFallback,
  getCartridge,
  isContinueAwaiting,
  loadCartridges,
  probeLmStudio,
  scriptedInput,
  validateCartridge,
  writePersonaArtifacts,
} from "../../lib/lab/persona-runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

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

test("compactLabEventTail preserves timeout facts without local diagnostics", () => {
  const tail = compactLabEventTail([
    { type: "cold_attempt", response: "I think..." },
    {
      type: "bridge_error",
      action: "socratic-repair-drill",
      error: "BridgeTimeout",
      message: "bridge subprocess timed out after 45000ms",
      duration_ms: 45014,
      timeout_ms: 45000,
      diagnostic_path: "/tmp/bridge-diagnostics/bridge-error.json",
      stderr: "local stderr detail",
    },
  ]);

  assert.deepEqual(tail, [
    { type: "cold_attempt" },
    {
      type: "bridge_error",
      action: "socratic-repair-drill",
      error: "BridgeTimeout",
      message: "bridge subprocess timed out after 45000ms",
      duration_ms: 45014,
      timeout_ms: 45000,
    },
  ]);
});

test("scriptedInput covers ignition and gap drill", () => {
  const profile = getCartridge("jordan-ai", ROOT);
  assert.equal(
    scriptedInput({ awaiting: { key: "concept" }, phase: "idle" }, profile),
    profile.concept,
  );
  assert.equal(scriptedInput({ awaiting: { key: "run_gap_drill" } }, profile), "y");
});

test("compatible student inherits unified OpenAI-compatible router env", () => {
  const prev = {
    provider: process.env.PERSONA_LLM_PROVIDER,
    target: process.env.PERSONA_LLM_TARGET,
    personaBase: process.env.PERSONA_LLM_BASE_URL,
    personaKey: process.env.PERSONA_LLM_API_KEY,
    personaModel: process.env.PERSONA_LLM_MODEL,
    base: process.env.LLM_BASE_URL,
    key: process.env.LLM_API_KEY,
    routerBase: process.env.LLM_ROUTER_BASE_URL,
    routerKey: process.env.LLM_ROUTER_API_KEY,
    model: process.env.LLM_OPENAI_COMPAT_MODEL,
  };
  process.env.LLM_ROUTER_BASE_URL = "http://openai-router.test/v1";
  process.env.LLM_ROUTER_API_KEY = "test-router-key";
  process.env.LLM_OPENAI_COMPAT_MODEL = "auto";
  delete process.env.PERSONA_LLM_BASE_URL;
  delete process.env.PERSONA_LLM_API_KEY;
  delete process.env.PERSONA_LLM_MODEL;

  try {
    applyStudentProvider("router");
    assert.equal(process.env.PERSONA_LLM_PROVIDER, "openai_compatible");
    assert.equal(process.env.PERSONA_LLM_TARGET, "router");
    assert.equal(process.env.PERSONA_LLM_BASE_URL, "http://openai-router.test/v1");
    assert.equal(process.env.PERSONA_LLM_API_KEY, "test-router-key");
    assert.equal(process.env.PERSONA_LLM_MODEL, "auto");
    assert.equal(compatibleDefaultModel(), "auto");
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      const envName = {
        provider: "PERSONA_LLM_PROVIDER",
        target: "PERSONA_LLM_TARGET",
        personaBase: "PERSONA_LLM_BASE_URL",
        personaKey: "PERSONA_LLM_API_KEY",
        personaModel: "PERSONA_LLM_MODEL",
        base: "LLM_BASE_URL",
        key: "LLM_API_KEY",
        routerBase: "LLM_ROUTER_BASE_URL",
        routerKey: "LLM_ROUTER_API_KEY",
        model: "LLM_OPENAI_COMPAT_MODEL",
      }[key];
      if (value === undefined) delete process.env[envName];
      else process.env[envName] = value;
    }
  }
});

test("router student ignores stale model without matching target", () => {
  const prev = {
    target: process.env.PERSONA_LLM_TARGET,
    personaModel: process.env.PERSONA_LLM_MODEL,
    routerModel: process.env.LLM_OPENAI_COMPAT_MODEL,
  };
  delete process.env.PERSONA_LLM_TARGET;
  process.env.PERSONA_LLM_MODEL = "google/gemma-4-12b";
  process.env.LLM_OPENAI_COMPAT_MODEL = "auto";

  try {
    assert.equal(compatibleStudentModel(), "auto");
  } finally {
    const restore = {
      PERSONA_LLM_TARGET: prev.target,
      PERSONA_LLM_MODEL: prev.personaModel,
      LLM_OPENAI_COMPAT_MODEL: prev.routerModel,
    };
    for (const [key, value] of Object.entries(restore)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("lmstudio student keeps local endpoint defaults", () => {
  const prev = {
    provider: process.env.PERSONA_LLM_PROVIDER,
    target: process.env.PERSONA_LLM_TARGET,
    personaBase: process.env.PERSONA_LLM_BASE_URL,
    personaKey: process.env.PERSONA_LLM_API_KEY,
    personaModel: process.env.PERSONA_LLM_MODEL,
    lmBase: process.env.LM_STUDIO_BASE_URL,
    lmKey: process.env.LM_STUDIO_API_KEY,
    lmModel: process.env.LM_STUDIO_MODEL,
  };
  delete process.env.PERSONA_LLM_BASE_URL;
  delete process.env.PERSONA_LLM_API_KEY;
  delete process.env.PERSONA_LLM_MODEL;
  process.env.LM_STUDIO_MODEL = "local-gemma";

  try {
    applyStudentProvider("local");
    assert.equal(process.env.PERSONA_LLM_PROVIDER, "openai_compatible");
    assert.equal(process.env.PERSONA_LLM_TARGET, "lmstudio");
    assert.equal(process.env.PERSONA_LLM_BASE_URL, "http://127.0.0.1:1234/v1");
    assert.equal(process.env.PERSONA_LLM_API_KEY, "lm-studio");
    assert.equal(process.env.PERSONA_LLM_MODEL, "local-gemma");
  } finally {
    const restore = {
      PERSONA_LLM_PROVIDER: prev.provider,
      PERSONA_LLM_TARGET: prev.target,
      PERSONA_LLM_BASE_URL: prev.personaBase,
      PERSONA_LLM_API_KEY: prev.personaKey,
      PERSONA_LLM_MODEL: prev.personaModel,
      LM_STUDIO_BASE_URL: prev.lmBase,
      LM_STUDIO_API_KEY: prev.lmKey,
      LM_STUDIO_MODEL: prev.lmModel,
    };
    for (const [key, value] of Object.entries(restore)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("explicit lmstudio student ignores stale persona router endpoint", () => {
  const prev = {
    provider: process.env.PERSONA_LLM_PROVIDER,
    target: process.env.PERSONA_LLM_TARGET,
    personaBase: process.env.PERSONA_LLM_BASE_URL,
    personaKey: process.env.PERSONA_LLM_API_KEY,
    personaModel: process.env.PERSONA_LLM_MODEL,
    lmBase: process.env.LM_STUDIO_BASE_URL,
    lmKey: process.env.LM_STUDIO_API_KEY,
    lmModel: process.env.LM_STUDIO_MODEL,
  };
  process.env.PERSONA_LLM_BASE_URL = "http://stale-router.test/v1";
  process.env.PERSONA_LLM_API_KEY = "stale-router-key";
  process.env.LM_STUDIO_BASE_URL = "http://127.0.0.1:1234/v1";
  process.env.LM_STUDIO_API_KEY = "lm-key";
  process.env.LM_STUDIO_MODEL = "local-gemma";
  delete process.env.PERSONA_LLM_MODEL;

  try {
    applyStudentProvider("lmstudio");
    assert.equal(process.env.PERSONA_LLM_PROVIDER, "openai_compatible");
    assert.equal(process.env.PERSONA_LLM_TARGET, "lmstudio");
    assert.equal(process.env.PERSONA_LLM_BASE_URL, "http://127.0.0.1:1234/v1");
    assert.equal(process.env.PERSONA_LLM_API_KEY, "lm-key");
    assert.equal(process.env.PERSONA_LLM_MODEL, "local-gemma");
  } finally {
    const restore = {
      PERSONA_LLM_PROVIDER: prev.provider,
      PERSONA_LLM_TARGET: prev.target,
      PERSONA_LLM_BASE_URL: prev.personaBase,
      PERSONA_LLM_API_KEY: prev.personaKey,
      PERSONA_LLM_MODEL: prev.personaModel,
      LM_STUDIO_BASE_URL: prev.lmBase,
      LM_STUDIO_API_KEY: prev.lmKey,
      LM_STUDIO_MODEL: prev.lmModel,
    };
    for (const [key, value] of Object.entries(restore)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("FreeLLMAPI model probe sends endpoint authorization", async () => {
  let authorization = null;
  const server = http.createServer((req, res) => {
    authorization = req.headers.authorization;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [{ id: "auto" }] }));
  });
  const baseUrl = await listen(server);
  try {
    const probe = await probeLmStudio({
      target: "router",
      baseUrl,
      apiKey: "freellm-key",
      model: "auto",
    });
    assert.equal(authorization, "Bearer freellm-key");
    assert.deepEqual(probe.models, ["auto"]);
  } finally {
    await close(server);
  }
});

test("fakeFallback uses immune-themed cold text for immune-memory cartridges", () => {
  const profile = getCartridge("novice-immune-memory", ROOT);
  const health = { fake_llm: true };
  const immuneCold = fakeFallback(
    { awaiting: { key: "cold_attempt" } },
    { allowFake: true, health, profile },
  );
  assert.match(immuneCold, /memory cells/i);
  assert.doesNotMatch(immuneCold, /cache hit/i);

  const cacheProfile = { concept: "Caching in Redis" };
  const cacheCold = fakeFallback(
    { awaiting: { key: "cold_attempt" } },
    { allowFake: true, health, profile: cacheProfile },
  );
  assert.match(cacheCold, /cache/i);
});

test("isContinueAwaiting detects transport continue", () => {
  assert.equal(isContinueAwaiting({ awaiting: { key: "continue" } }), true);
  assert.equal(isContinueAwaiting({ awaiting: { key: "cold_attempt" } }), false);
});

test("writePersonaArtifacts persists session.json when record is provided", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "persona-artifact-"));
  const profile = getCartridge("novice-immune-memory", ROOT);
  const sessionRecord = {
    events: [
      { type: "substrate_seed_offered" },
      { type: "substrate_confirmed" },
      { type: "route_generated" },
      { type: "cold_attempt", evaluation: { classification: "shallow" } },
      { type: "repair_dialogue_turn" },
      { type: "repair" },
      { type: "spacing" },
      { type: "spaced_redrill", evaluation: { classification: "solid" } },
    ],
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
  const { mdPath, rubricPath, sessionPath } = writePersonaArtifacts({
    log,
    health: { fake_llm: false, llm_provider: "gemini", llm_model: "gemini-2.5-flash" },
    outDir,
    profile,
    sessionRecord,
  });
  assert.ok(sessionPath?.endsWith("session.json"));
  assert.ok(rubricPath?.endsWith("loop-rubric.json"));
  assert.ok(existsSync(rubricPath));
  const written = JSON.parse(readFileSync(sessionPath, "utf8"));
  assert.deepEqual(written.derived.at(-1).concept_status.badge, "primed");
  const rubric = JSON.parse(readFileSync(rubricPath, "utf8"));
  assert.equal(rubric.rubric_version, "loop-v1");
  assert.equal(rubric.axes.evidence_progression.score, "pass");
  assert.match(readFileSync(mdPath, "utf8"), /## Loop rubric/);
});
