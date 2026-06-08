import fs from "node:fs";
import path from "node:path";

/**
 * Load repo-root .env into process.env (fill missing keys only).
 * Persona runners should call this before spawning Python or reading GEMINI_API_KEY.
 */
export function loadRepoEnv(repoRoot, {
  envFile = process.env.SOCRATINK_TUI_ENV_FILE || path.join(repoRoot, ".env"),
} = {}) {
  if (!fs.existsSync(envFile)) return { envFile, loaded: false };
  const text = fs.readFileSync(envFile, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  return { envFile, loaded: true };
}
