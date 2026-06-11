import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  activeLlm,
  buildLlmOptions,
  isModelOverrideAllowed,
  llmEnvOverrides,
  validateLlmSelection,
} from "../../lib/loop-server/llm-options.mjs";
import { createBridgeClient } from "../../lib/bridge/client.mjs";

const LOOPBACK_REQ = { socket: { remoteAddress: "127.0.0.1" } };
const REMOTE_REQ = { socket: { remoteAddress: "203.0.113.7" } };

test("override gate requires env flag, loopback, and live mode", () => {
  const enabled = { SOCRATINK_LOOP_ALLOW_MODEL_OVERRIDE: "1" };
  assert.equal(isModelOverrideAllowed(LOOPBACK_REQ, enabled), true);
  assert.equal(isModelOverrideAllowed(REMOTE_REQ, enabled), false);
  assert.equal(isModelOverrideAllowed(LOOPBACK_REQ, {}), false);
  assert.equal(
    isModelOverrideAllowed(LOOPBACK_REQ, {
      ...enabled,
      SOCRATINK_TUI_FAKE_LLM: "1",
    }),
    false,
  );
});

test("catalog includes gemini models only when key configured", () => {
  const options = buildLlmOptions({ GEMINI_API_KEY: "k" });
  const geminiModels = options
    .filter((o) => o.provider === "gemini")
    .map((o) => o.model);
  assert.ok(geminiModels.includes("gemini-2.5-flash"));
  assert.ok(!options.some((o) => o.custom));
});

test("catalog includes local section plus custom row when base url set", () => {
  const options = buildLlmOptions({
    GEMINI_API_KEY: "k",
    LLM_BASE_URL: "http://127.0.0.1:1234/v1",
  });
  assert.ok(
    options.some(
      (o) =>
        o.provider === "openai_compatible" &&
        o.model === "google/gemma-4-12b" &&
        o.label === "LM Studio · google/gemma-4-12b",
    ),
  );
  assert.ok(options.some((o) => o.custom));
});

test("catalog always contains the active env model", () => {
  const env = {
    LLM_PROVIDER: "openai_compatible",
    LLM_MODEL: "qwen/qwen3-8b",
    LLM_BASE_URL: "http://127.0.0.1:1234/v1",
  };
  const active = activeLlm(env);
  const options = buildLlmOptions(env);
  assert.ok(
    options.some(
      (o) =>
        o.provider === active.provider &&
        o.model === active.model &&
        o.label === "LM Studio · qwen/qwen3-8b",
    ),
  );
});

test("selection validation enforces provider configuration", () => {
  const env = { GEMINI_API_KEY: "k", LLM_BASE_URL: "http://127.0.0.1:1234/v1" };
  assert.equal(
    validateLlmSelection({ provider: "gemini", model: "gemini-2.5-flash" }, env).ok,
    true,
  );
  assert.equal(
    validateLlmSelection({ provider: "gemini", model: "not-a-model" }, env).ok,
    false,
  );
  // free-text local model id allowed
  assert.equal(
    validateLlmSelection(
      { provider: "openai_compatible", model: "anything/loaded-in-lm-studio" },
      env,
    ).ok,
    true,
  );
  // local provider rejected without base url
  assert.equal(
    validateLlmSelection(
      { provider: "openai_compatible", model: "x" },
      { GEMINI_API_KEY: "k" },
    ).ok,
    false,
  );
  assert.equal(validateLlmSelection({ provider: "anthropic", model: "x" }, env).ok, false);
  assert.equal(validateLlmSelection(null, env).ok, false);
  assert.equal(
    validateLlmSelection({ provider: "gemini", model: "x".repeat(200) }, env).ok,
    false,
  );
});

test("llmEnvOverrides maps selection to bridge env vars", () => {
  assert.deepEqual(
    llmEnvOverrides({ provider: "openai_compatible", model: "google/gemma-4-12b" }),
    { LLM_PROVIDER: "openai_compatible", LLM_MODEL: "google/gemma-4-12b" },
  );
  assert.equal(llmEnvOverrides(null), null);
  assert.equal(llmEnvOverrides({ provider: "gemini" }), null);
});

test("bridge client merges envOverrides into subprocess env", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "socratink-bridge-env-"));
  const scriptPath = path.join(dir, "echo-env.mjs");
  await fs.writeFile(
    scriptPath,
    "console.log(JSON.stringify({ provider: process.env.LLM_PROVIDER || null, model: process.env.LLM_MODEL || null }));\n",
  );
  const { callBridge } = createBridgeClient({
    workspaceRoot: dir,
    bridgePath: scriptPath,
    python: process.execPath,
    envOverrides: {
      LLM_PROVIDER: "openai_compatible",
      LLM_MODEL: "google/gemma-4-12b",
    },
  });
  const result = callBridge("noop", {});
  assert.deepEqual(result, {
    provider: "openai_compatible",
    model: "google/gemma-4-12b",
  });
});
