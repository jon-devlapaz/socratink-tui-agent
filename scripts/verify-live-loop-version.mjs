#!/usr/bin/env node

import { LOOP_APP_VERSION_DEFAULT } from "../lib/loop-server/version.mjs";

const expectedVersion =
  (process.env.LOOP_EXPECTED_VERSION || "").trim() || LOOP_APP_VERSION_DEFAULT;

const targets = [
  {
    label: "railway",
    url: (process.env.RAILWAY_LOOP_HEALTH_URL || "").trim(),
  },
  {
    label: "app",
    url:
      (process.env.APP_LOOP_HEALTH_URL || "").trim() ||
      "https://app.socratink.ai/health",
  },
].filter((target) => target.url);

if (targets.length === 0) {
  console.error("No health endpoints configured for live loop verification.");
  process.exit(1);
}

const attempts = Number.parseInt(
  process.env.LOOP_VERSION_VERIFY_ATTEMPTS || "24",
  10,
);
const delayMs = Number.parseInt(
  process.env.LOOP_VERSION_VERIFY_DELAY_MS || "10000",
  10,
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readHealth(target) {
  const response = await fetch(target.url, {
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    body: json,
    text,
  };
}

let finalErrors = [];

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  finalErrors = [];

  for (const target of targets) {
    try {
      const result = await readHealth(target);
      if (!result.ok) {
        finalErrors.push(
          `${target.label}: HTTP ${result.status} from ${target.url}`,
        );
        continue;
      }

      if (!result.body || typeof result.body.app_version !== "string") {
        finalErrors.push(
          `${target.label}: missing app_version in response from ${target.url}: ${result.text.slice(0, 200)}`,
        );
        continue;
      }

      if (result.body.app_version !== expectedVersion) {
        finalErrors.push(
          `${target.label}: expected ${expectedVersion} but got ${result.body.app_version} from ${target.url}`,
        );
      } else {
        console.log(
          `[verify-live-loop-version] ${target.label} ok: ${result.body.app_version} (${target.url})`,
        );
      }
    } catch (error) {
      finalErrors.push(
        `${target.label}: request failed for ${target.url}: ${error.message}`,
      );
    }
  }

  if (finalErrors.length === 0) {
    process.exit(0);
  }

  if (attempt < attempts) {
    console.log(
      `[verify-live-loop-version] waiting for ${expectedVersion} (${attempt}/${attempts}): ${finalErrors.join(" | ")}`,
    );
    await sleep(delayMs);
  }
}

for (const error of finalErrors) {
  console.error(`[verify-live-loop-version] ${error}`);
}
process.exit(1);
