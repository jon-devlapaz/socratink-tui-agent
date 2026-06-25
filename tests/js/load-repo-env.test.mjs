import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRepoEnv } from "../../lib/lab/load-repo-env.mjs";

function withEnv(names, fn) {
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    return fn();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("loadRepoEnv fills missing keys without overwriting process env", () =>
  withEnv(["GEMINI_API_KEY", "LLM_MODEL", "EXISTING_KEY"], () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "socratink-env-"));
    try {
      const envFile = path.join(dir, ".env");
      fs.writeFileSync(
        envFile,
        [
          "GEMINI_API_KEY=\"from-file\"",
          "LLM_MODEL='quoted-model'",
          "EXISTING_KEY=from-file",
          "",
        ].join("\n"),
      );
      delete process.env.GEMINI_API_KEY;
      delete process.env.LLM_MODEL;
      process.env.EXISTING_KEY = "from-process";

      const result = loadRepoEnv(dir, { envFile });

      assert.deepEqual(result, { envFile, loaded: true });
      assert.equal(process.env.GEMINI_API_KEY, "from-file");
      assert.equal(process.env.LLM_MODEL, "quoted-model");
      assert.equal(process.env.EXISTING_KEY, "from-process");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }));

test("loadRepoEnv returns unloaded for missing env file", () =>
  withEnv(["SOCRATINK_TUI_ENV_FILE"], () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "socratink-env-"));
    try {
      const envFile = path.join(dir, "missing.env");
      const result = loadRepoEnv(dir, { envFile });
      assert.deepEqual(result, { envFile, loaded: false });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }));

test("loadRepoEnv honors SOCRATINK_TUI_ENV_FILE by default", () =>
  withEnv(["SOCRATINK_TUI_ENV_FILE", "GEMINI_API_KEY"], () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "socratink-env-"));
    try {
      const envFile = path.join(dir, "custom.env");
      fs.writeFileSync(envFile, "GEMINI_API_KEY=custom-key\n");
      process.env.SOCRATINK_TUI_ENV_FILE = envFile;
      delete process.env.GEMINI_API_KEY;

      const result = loadRepoEnv(dir);

      assert.deepEqual(result, { envFile, loaded: true });
      assert.equal(process.env.GEMINI_API_KEY, "custom-key");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }));

test("loadRepoEnv preserves fake LLM only when env file opts in", () =>
  withEnv(["SOCRATINK_TUI_FAKE_LLM"], () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "socratink-env-"));
    try {
      const liveEnvFile = path.join(dir, "live.env");
      fs.writeFileSync(liveEnvFile, "GEMINI_API_KEY=test\n");
      process.env.SOCRATINK_TUI_FAKE_LLM = "0";
      loadRepoEnv(dir, { envFile: liveEnvFile });
      assert.equal(process.env.SOCRATINK_TUI_FAKE_LLM, undefined);

      const fakeEnvFile = path.join(dir, "fake.env");
      fs.writeFileSync(fakeEnvFile, "SOCRATINK_TUI_FAKE_LLM=1\n");
      loadRepoEnv(dir, { envFile: fakeEnvFile });
      assert.equal(process.env.SOCRATINK_TUI_FAKE_LLM, "1");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }));
