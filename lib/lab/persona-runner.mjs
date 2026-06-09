import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoEnv } from "./load-repo-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../..");
export const CARTRIDGES_DIR = path.join(REPO_ROOT, "pedagogical_agents/cartridges");
export const PERSONA_SCRIPT = path.join(REPO_ROOT, "scripts/loop_persona_turn.py");

const MATRIX_ALIASES = {
  novice: "novice-immune-memory",
  middle_schooler: "middle-schooler-immune-memory",
  expert: "expert-immune-memory",
};

const REQUIRED_CARTRIDGE_FIELDS = [
  "id",
  "label",
  "concept",
  "learner_goal",
  "launch_attempt",
];

export function resolvePersonaPython(repoRoot = REPO_ROOT) {
  if (process.env.SOCRATINK_PERSONA_PYTHON) {
    return process.env.SOCRATINK_PERSONA_PYTHON;
  }
  const candidate = path.join(repoRoot, ".venv/bin/python");
  if (fs.existsSync(candidate)) return candidate;
  throw new Error(
    `Python venv not found at ${candidate}. Run ./scripts/bootstrap-python.sh or set SOCRATINK_PERSONA_PYTHON.`,
  );
}

export function validateCartridge(raw) {
  for (const field of REQUIRED_CARTRIDGE_FIELDS) {
    if (!String(raw?.[field] ?? "").trim()) {
      throw new Error(`cartridge ${raw?.id || "(unknown)"} missing required field: ${field}`);
    }
  }
  return {
    id: String(raw.id).trim(),
    label: String(raw.label).trim(),
    concept: String(raw.concept).trim(),
    learner_goal: String(raw.learner_goal).trim(),
    launch_attempt: String(raw.launch_attempt).trim(),
    substrate_refinement: raw.substrate_refinement ?? null,
    persona_hint: String(raw.persona_hint || "").trim() || null,
  };
}

export function loadCartridges(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, "pedagogical_agents/cartridges");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => validateCartridge(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getCartridge(id, repoRoot = REPO_ROOT) {
  const resolved = MATRIX_ALIASES[id] || id;
  const filePath = path.join(repoRoot, "pedagogical_agents/cartridges", `${resolved}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`cartridge not found: ${id} (looked for ${filePath})`);
  }
  return validateCartridge(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function studentProviderLabel() {
  const provider = (process.env.PERSONA_LLM_PROVIDER || "gemini").trim().toLowerCase();
  if (provider === "openai_compatible") {
    const model = process.env.PERSONA_LLM_MODEL || "google/gemma-4-12b";
    return `local:${model}`;
  }
  return "cloud:gemini";
}

export function applyStudentProvider(student) {
  if (student === "local") {
    process.env.PERSONA_LLM_PROVIDER = "openai_compatible";
    process.env.PERSONA_LLM_BASE_URL =
      process.env.PERSONA_LLM_BASE_URL || "http://127.0.0.1:1234/v1";
    process.env.PERSONA_LLM_MODEL =
      process.env.PERSONA_LLM_MODEL || "google/gemma-4-12b";
    process.env.PERSONA_LLM_API_KEY = process.env.PERSONA_LLM_API_KEY || "lm-studio";
    return;
  }
  if (student === "cloud") {
    delete process.env.PERSONA_LLM_PROVIDER;
    delete process.env.PERSONA_LLM_BASE_URL;
    delete process.env.PERSONA_LLM_MODEL;
    delete process.env.PERSONA_LLM_API_KEY;
    return;
  }
  throw new Error(`student provider must be "local" or "cloud", got: ${student}`);
}

export async function fetchJson(url, init = {}, { timeoutMs = 300_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || res.statusText || `HTTP ${res.status}`);
    }
    return body;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Network blips while loop-server blocks on spawnSync bridge calls (see public/lab/lab.js). */
export function isTransientFetchError(err) {
  const msg = String(err?.message || err?.cause?.message || "");
  const code = String(err?.cause?.code || "");
  return (
    msg === "fetch failed" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    /socket hang up/i.test(msg)
  );
}

export async function fetchJsonWithRetry(
  url,
  init = {},
  {
    timeoutMs = 300_000,
    maxAttempts = 120,
    retryDelayMs = 1_000,
    shouldRetry = isTransientFetchError,
    onRetry,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchJson(url, init, { timeoutMs });
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !shouldRetry(err)) throw err;
      onRetry?.({ attempt, error: err, url });
      await sleep(retryDelayMs);
    }
  }
  throw lastErr;
}

export async function probeLmStudio({
  baseUrl = process.env.PERSONA_LLM_BASE_URL || "http://127.0.0.1:1234/v1",
  model = process.env.PERSONA_LLM_MODEL || "google/gemma-4-12b",
} = {}) {
  const payload = await fetchJson(`${baseUrl.replace(/\/$/, "")}/models`, {}, { timeoutMs: 5_000 });
  const ids = (payload.data || []).map((entry) => entry.id);
  if (!ids.some((id) => id === model || id.includes(model) || model.includes(id))) {
    throw new Error(
      `LM Studio is up but model "${model}" not listed. Available: ${ids.join(", ") || "(none)"}`,
    );
  }
  return { baseUrl, model, models: ids };
}

export async function preflightPersonaRun({
  baseUrl,
  allowFake = false,
  student = null,
} = {}) {
  const health = await fetchJson(`${baseUrl.replace(/\/$/, "")}/health`, {}, { timeoutMs: 10_000 });
  if (health.fake_llm && !allowFake) {
    throw new Error(
      "Loop server is in FAKE_LLM mode. Restart without SOCRATINK_TUI_FAKE_LLM or pass --allow-fake.",
    );
  }

  const provider = (process.env.PERSONA_LLM_PROVIDER || "gemini").trim().toLowerCase();
  if (provider === "openai_compatible" || student === "local") {
    await probeLmStudio();
  } else if (!(process.env.GEMINI_API_KEY || "").trim()) {
    throw new Error(
      "Cloud student brain requires GEMINI_API_KEY in .env or shell (or use --student local).",
    );
  }

  return health;
}

export function transcriptText(lines) {
  return (lines || []).map((line) => line.text || "").join("\n");
}

export function isContinueAwaiting(session) {
  return session.awaiting?.key === "continue";
}

export function scriptedInput(session, profile) {
  const key = session.awaiting?.key;
  if (key === "concept" || (key === "cmd" && session.phase === "idle")) {
    return profile.concept;
  }
  if (key === "learner_goal") return profile.learner_goal;
  if (key === "launch_attempt") return profile.launch_attempt;
  if (key === "substrate_refinement" && profile.substrate_refinement) {
    return profile.substrate_refinement;
  }
  if (key === "run_gap_drill") return "y";
  return null;
}

export function fakeFallback(session, { allowFake, health }) {
  if (!allowFake || !health.fake_llm) return null;
  const key = session.awaiting?.key;
  if (key === "substrate_refinement") {
    return "Vaccines give the body a safe preview so it can respond faster later.";
  }
  if (key === "cold_attempt" || key === "spaced_attempt" || key === "gap_attempt") {
    return "On the first request it computes and stores the result, so a later identical request reads from cache instead of recomputing.";
  }
  return null;
}

export function personaTurn(profile, session, { repoRoot = REPO_ROOT } = {}) {
  const python = resolvePersonaPython(repoRoot);
  const result = spawnSync(python, [PERSONA_SCRIPT], {
    cwd: repoRoot,
    input: JSON.stringify({
      concept: profile.concept,
      learner_goal: profile.learner_goal,
      phase: session.phase,
      awaiting_label: session.awaiting?.label || session.awaiting?.key || "",
      transcript_text: transcriptText(session.transcript),
      persona_hint: profile.persona_hint,
    }),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "persona turn failed");
  }
  return result.stdout.trim();
}

function brainBanner(health, { allowFake }) {
  const tutor = health.fake_llm ? "sandbox" : "live-gemini";
  const student = studentProviderLabel();
  return `tutor=${tutor} student=${student} allow_fake=${allowFake}`;
}

export async function runPersonaSession({
  profile,
  baseUrl,
  maxTurns = 24,
  allowFake = false,
  health,
  onTurn,
  onPhaseStart,
  onHttpWait,
  onTurnComplete,
  shouldCancel,
  repoRoot = REPO_ROOT,
}) {
  let session = await fetchJson(`${baseUrl}/api/session`, { method: "POST" });
  const log = {
    cartridge_id: profile.id,
    label: profile.label,
    concept: profile.concept,
    learner_goal: profile.learner_goal,
    launch_attempt: profile.launch_attempt,
    persona_hint: profile.persona_hint,
    brains: brainBanner(health, { allowFake }),
    llm_mode: health.llm_mode,
    turns: [],
  };

  let turns = 0;
  while (!session.complete && !session.caseComplete && turns < maxTurns) {
    if (shouldCancel?.()) {
      log.final = {
        status: session.status,
        phase: session.phase,
        complete: session.complete,
        case_complete: session.caseComplete,
        event_types: (session.events || []).map((e) => e.type),
        hit_max_turns: false,
        cancelled: true,
      };
      return { log, session, cancelled: true };
    }

    const transportContinue = isContinueAwaiting(session);
    let kind = "continue";
    let text = "";

    if (transportContinue) {
      kind = "continue";
    } else {
      text = scriptedInput(session, profile);
      if (text) {
        kind = "scripted";
      } else {
        text = fakeFallback(session, { allowFake, health });
        if (text) kind = "fake";
      }
    }

    if (!transportContinue && !text) {
      kind = "persona";
      onPhaseStart?.({
        n: turns + 1,
        phase: session.phase,
        awaiting_key: session.awaiting?.key || null,
        kind,
      });
      text = personaTurn(profile, session, { repoRoot });
    } else {
      onPhaseStart?.({
        n: turns + 1,
        phase: session.phase,
        awaiting_key: session.awaiting?.key || null,
        kind,
      });
    }

    const body = transportContinue ? {} : { text };
    const displayText = transportContinue ? "[continue]" : text;

    const turnRecord = {
      n: turns + 1,
      input: transportContinue ? null : text,
      transport_continue: transportContinue,
      phase: session.phase,
      awaiting_key_before: session.awaiting?.key || null,
      display: displayText,
      kind,
    };

    if (onTurn) onTurn(turnRecord);

    onHttpWait?.({ n: turns + 1, phase: session.phase });

    session = await fetchJsonWithRetry(
      `${baseUrl}/api/session/${session.sessionId}/turn`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      {
        onRetry: ({ attempt }) => {
          onHttpWait?.({
            n: turns + 1,
            phase: session.phase,
            attempt,
            waiting: true,
          });
        },
      },
    );

    const eventsTail = (session.events || []).map((e) => e.type);
    onTurnComplete?.({
      turnRecord,
      transcript_delta: session.transcript,
      events_tail: eventsTail,
    });

    log.turns.push({
      ...turnRecord,
      status: session.status,
      awaiting: session.awaiting,
      transcript_delta: session.transcript,
    });
    turns += 1;
  }

  log.final = {
    status: session.status,
    phase: session.phase,
    complete: session.complete,
    case_complete: session.caseComplete,
    event_types: (session.events || []).map((e) => e.type),
    hit_max_turns: turns >= maxTurns && !session.caseComplete && !session.complete,
    cancelled: false,
  };

  return { log, session, cancelled: false };
}

export function writePersonaArtifacts({
  log,
  health,
  outDir,
  profile,
  sessionRecord = null,
}) {
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "persona-run.json");
  fs.writeFileSync(reportPath, JSON.stringify(log, null, 2));

  let sessionPath = null;
  if (sessionRecord) {
    sessionPath = path.join(outDir, "session.json");
    fs.writeFileSync(sessionPath, JSON.stringify(sessionRecord, null, 2));
  }

  const mdPath = path.join(outDir, "REPORT.md");
  fs.writeFileSync(
    mdPath,
    [
      `# Loop persona run (${health.fake_llm ? "fake bridge" : "live Gemini"})`,
      "",
      `- Cartridge: ${profile.label} (${profile.id})`,
      `- Brains: ${log.brains}`,
      `- Concept: ${profile.concept}`,
      `- Goal: ${profile.learner_goal}`,
      `- Turns: ${log.turns.length}`,
      `- Complete: ${log.final.complete}`,
      `- Case complete: ${log.final.case_complete}`,
      `- Hit max turns: ${log.final.hit_max_turns}`,
      `- Final phase: ${log.final.phase}`,
      ...(sessionPath ? [`- Session record: ${path.basename(sessionPath)}`] : []),
      "",
      "## Event types",
      "",
      log.final.event_types.map((t) => `- ${t}`).join("\n"),
      "",
      "## Friction prompts (for founder)",
      "",
      "1. Where did the learner hesitate or need `/help`?",
      "2. Did the hypothesis map match the concept?",
      "3. Did repair dialogue feel like guessing keywords?",
      "4. Any copy that broke graph honesty?",
      "",
    ].join("\n"),
  );

  return { reportPath, mdPath, sessionPath };
}

export function bootstrapPersonaEnv(repoRoot = REPO_ROOT) {
  return loadRepoEnv(repoRoot);
}
