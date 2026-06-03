#!/usr/bin/env node
/**
 * Three-learner persona matrix for substrate gate (live Gemini on loop API).
 *
 * Profiles:
 *   1. novice     — blank launch → substrate seed → refinement (slow path)
 *   2. middle     — thin generative launch (middle-school voice)
 *   3. expert     — process-rich launch (fast path, no seed)
 *
 * Prerequisites:
 *   GEMINI_API_KEY in .env (or env)
 *   ./socratink-loop-server  (unset SOCRATINK_TUI_FAKE_LLM for live)
 *
 * Usage:
 *   node scripts/run-substrate-persona-matrix.mjs
 *   node scripts/run-substrate-persona-matrix.mjs --allow-fake
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MAIN_VENV_PYTHON =
  "/Users/jondev/dev/socratink/prod/socratink-tui-agent/.venv/bin/python";

function resolvePersonaPython() {
  if (process.env.SOCRATINK_PERSONA_PYTHON) {
    return process.env.SOCRATINK_PERSONA_PYTHON;
  }
  const candidates = [
    path.join(ROOT, ".venv/bin/python"),
    MAIN_VENV_PYTHON,
  ].filter((p) => fs.existsSync(p));
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "from google import genai"], {
      encoding: "utf8",
    });
    if (probe.status === 0) return candidate;
  }
  return candidates[0] || MAIN_VENV_PYTHON;
}

const PYTHON = resolvePersonaPython();
const PERSONA_SCRIPT = path.join(ROOT, "scripts/loop_persona_turn.py");

const PROFILES = [
  {
    id: "novice",
    label: "Novice (explicit unknown)",
    concept: "Immune memory",
    learner_goal: "I want to explain why vaccines work, but I am starting from scratch.",
    launch_attempt: "I don't know.",
    substrate_refinement:
      "Vaccines give the body a safe preview so it can learn before a real infection.",
    persona_hint: "You are Mia, a true beginner. You needed the seed. Keep answers short.",
  },
  {
    id: "middle_schooler",
    label: "Middle schooler (thin but trying)",
    concept: "Immune memory",
    learner_goal: "I want to understand how vaccines help my body fight germs.",
    launch_attempt:
      "Vaccines put a little bit of the germ in you so your body learns how to fight it.",
    substrate_refinement: null,
    persona_hint:
      "You are Sam, grade 7. You try with simple words; your ideas are incomplete but genuine.",
  },
  {
    id: "expert",
    label: "PhD systems researcher (fast substrate)",
    concept: "Immune memory",
    learner_goal:
      "Map vaccine priming to a durable, faster secondary response.",
    launch_attempt:
      "A vaccine is a controlled, attenuated exposure: the immune system runs a training pass on antigen shape without paying the full pathogenic cost, so a later real infection can short-circuit to a faster effector response.",
    substrate_refinement: null,
    persona_hint:
      "You are Dr. Chen. Precise mechanism language; you reconstruct causal chains.",
  },
];

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.SOCRATINK_LOOP_BASE_URL || "http://127.0.0.1:8787",
    maxTurns: 20,
    allowFake: false,
    profiles: null,
    outRoot: path.join(ROOT, ".qa-runs/substrate-persona-matrix"),
  };
  const args = [...argv.slice(2)];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--base-url") options.baseUrl = args.shift().replace(/\/$/, "");
    else if (arg === "--max-turns") options.maxTurns = Number(args.shift());
    else if (arg === "--profile") {
      options.profiles = options.profiles || [];
      options.profiles.push(args.shift());
    } else if (arg === "--allow-fake") options.allowFake = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/run-substrate-persona-matrix.mjs [--profile id] [--allow-fake]",
      );
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText || `HTTP ${res.status}`);
    return body;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`request timed out after 300s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function transcriptText(lines) {
  return (lines || []).map((line) => line.text || "").join("\n");
}

function isContinueAwaiting(session) {
  return session.awaiting?.key === "continue";
}

function scriptedInput(session, profile) {
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

function fakeFallback(session) {
  const key = session.awaiting?.key;
  if (key === "substrate_refinement") {
    return "Vaccines give the body a safe preview so it can respond faster later.";
  }
  if (key === "cold_attempt" || key === "spaced_attempt" || key === "gap_attempt") {
    return "A vaccine presents antigen safely; memory cells make the next response faster.";
  }
  return null;
}

function personaTurn(profile, session) {
  const result = spawnSync(PYTHON, [PERSONA_SCRIPT], {
    cwd: ROOT,
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

function substrateMetrics(events) {
  const types = (events || []).map((e) => e.type);
  const idx = (t) => types.indexOf(t);
  return {
    event_types: types,
    has_substrate_seed: types.includes("substrate_seed_offered"),
    has_substrate_refinement: types.includes("substrate_refinement"),
    has_substrate_confirmed: types.includes("substrate_confirmed"),
    has_route: types.includes("route_generated"),
    seed_before_route:
      idx("substrate_seed_offered") >= 0 &&
      idx("route_generated") >= 0 &&
      idx("substrate_seed_offered") < idx("route_generated"),
    confirmed_before_route:
      idx("substrate_confirmed") >= 0 &&
      idx("route_generated") >= 0 &&
      idx("substrate_confirmed") < idx("route_generated"),
    substrate_confirmed: (events || []).find((e) => e.type === "substrate_confirmed"),
    turn_count_at_first_awaiting_refinement: null,
  };
}

async function runProfile(profile, options, health) {
  const log = {
    profile: profile.id,
    label: profile.label,
    concept: profile.concept,
    learner_goal: profile.learner_goal,
    launch_attempt: profile.launch_attempt,
    turns: [],
    metrics: null,
    friction: [],
  };

  let session = await fetchJson(`${options.baseUrl}/api/session`, { method: "POST" });
  let turns = 0;

  while (!session.complete && !session.caseComplete && turns < options.maxTurns) {
    const beforeKey = session.awaiting?.key;
    const transportContinue = isContinueAwaiting(session);
    let text = transportContinue ? "" : scriptedInput(session, profile);
    if (!transportContinue && !text && options.allowFake && health.fake_llm) {
      text = fakeFallback(session);
    }
    if (!transportContinue && !text) {
      text = personaTurn(profile, session);
    }
    const body = transportContinue ? {} : { text };
    const displayText = transportContinue ? "[continue]" : text;

    console.log(
      `  [${profile.id} turn ${turns + 1}] phase=${session.phase} key=${beforeKey || "?"} » ${displayText.slice(0, 90)}${displayText.length > 90 ? "…" : ""}`,
    );

    session = await fetchJson(
      `${options.baseUrl}/api/session/${session.sessionId}/turn`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (
      beforeKey !== "substrate_refinement" &&
      session.awaiting?.key === "substrate_refinement"
    ) {
      log.metrics = log.metrics || {};
      log.metrics.turn_count_at_first_awaiting_refinement = turns + 1;
    }

    log.turns.push({
      input: transportContinue ? null : text,
      transport_continue: transportContinue,
      phase: session.phase,
      status: session.status,
      awaiting: session.awaiting,
      transcript_delta: session.transcript,
    });
    turns += 1;
  }

  log.metrics = { ...substrateMetrics(session.events), ...log.metrics };
  log.final = {
    status: session.status,
    phase: session.phase,
    complete: session.complete,
    case_complete: session.caseComplete,
  };

  if (profile.id === "novice") {
    if (!log.metrics.has_substrate_seed) {
      log.friction.push("Expected substrate_seed_offered for novice — missing.");
    }
    if (!log.metrics.seed_before_route) {
      log.friction.push("Expected seed before route_generated — order wrong.");
    }
    if (log.metrics.turn_count_at_first_awaiting_refinement == null) {
      log.friction.push("Never reached substrate_refinement awaiting state.");
    }
  }
  if (profile.id === "expert") {
    if (log.metrics.has_substrate_seed) {
      log.friction.push("Expert should fast-path without substrate_seed_offered.");
    }
    if (!log.metrics.confirmed_before_route) {
      log.friction.push("Expected substrate_confirmed before route.");
    }
  }

  return log;
}

async function main() {
  const options = parseArgs(process.argv);
  const stamp = new Date().toISOString().replaceAll(":", "T").slice(0, 19);
  const outDir = path.join(options.outRoot, stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const health = await fetchJson(`${options.baseUrl}/health`);
  if (health.fake_llm && !options.allowFake) {
    console.error(
      "Server is FAKE_LLM. Restart without SOCRATINK_TUI_FAKE_LLM or pass --allow-fake.",
    );
    process.exit(1);
  }

  console.log(
    `[matrix] mode=${health.llm_mode} fake=${health.fake_llm} base=${options.baseUrl}`,
  );

  const profileList = options.profiles?.length
    ? PROFILES.filter((p) => options.profiles.includes(p.id))
    : PROFILES;
  if (!profileList.length) {
    throw new Error(`no profiles match: ${options.profiles?.join(", ")}`);
  }

  const results = [];
  for (const profile of profileList) {
    console.log(`\n[matrix] === ${profile.label} ===`);
    const log = await runProfile(profile, options, health);
    results.push(log);
    const outPath = path.join(outDir, `${profile.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(log, null, 2));
    console.log(
      `[matrix] ${profile.id}: events=${log.metrics.event_types.length} friction=${log.friction.length} case_complete=${log.final.case_complete}`,
    );
  }

  const summaryPath = path.join(outDir, "SUMMARY.md");
  const lines = [
    `# Substrate persona matrix (${health.fake_llm ? "fake" : "live"})`,
    "",
    `| Profile | Seed | Confirmed→Route | Case complete | Friction |`,
    `|---------|------|-----------------|---------------|----------|`,
  ];
  for (const log of results) {
    const m = log.metrics;
    lines.push(
      `| ${log.profile} | ${m.has_substrate_seed ? "yes" : "no"} | ${m.confirmed_before_route ? "yes" : "no"} | ${log.final.case_complete ? "yes" : "no"} | ${log.friction.length ? log.friction.join("; ") : "—"} |`,
    );
    lines.push("");
    lines.push(`### ${log.profile} event order`);
    lines.push("");
    lines.push(m.event_types.map((t) => `- ${t}`).join("\n"));
    lines.push("");
  }
  fs.writeFileSync(summaryPath, lines.join("\n"));
  fs.writeFileSync(path.join(outDir, "matrix.json"), JSON.stringify(results, null, 2));

  console.log(`\n[matrix] wrote ${outDir}`);
  const anyFriction = results.some((r) => r.friction.length);
  process.exit(anyFriction ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
