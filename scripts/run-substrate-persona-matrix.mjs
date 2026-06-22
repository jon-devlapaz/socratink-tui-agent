#!/usr/bin/env node
/**
 * Three-learner substrate gate matrix (novice / middle / expert cartridges).
 *
 * Usage:
 *   node scripts/run-substrate-persona-matrix.mjs
 *   node scripts/run-substrate-persona-matrix.mjs --profile novice --student local --allow-fake
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  applyStudentProvider,
  bootstrapPersonaEnv,
  getCartridge,
  preflightPersonaRun,
  REPO_ROOT,
  runPersonaSession,
} from "../lib/lab/persona-runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATRIX_IDS = ["novice", "middle_schooler", "expert"];
const CASE_BOUNDARY_EVENTS = new Set(["spaced_redrill", "repair_abandoned"]);

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.SOCRATINK_LOOP_BASE_URL || "http://127.0.0.1:8787",
    maxTurns: 20,
    allowFake: false,
    profiles: null,
    student: null,
    outRoot: path.join(REPO_ROOT, ".qa-runs/substrate-persona-matrix"),
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
    else if (arg === "--student") options.student = args.shift();
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/run-substrate-persona-matrix.mjs [--profile novice] [--student local|cloud] [--allow-fake]",
      );
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function substrateMetrics(events) {
  const types = (events || []).map((e) => e.type);
  const idx = (t) => types.indexOf(t);
  const evidenceEvents = (events || [])
    .filter((event) => ["cold_attempt", "spaced_redrill"].includes(event.type))
    .map((event) => ({
      type: event.type,
      classification: event.evaluation?.classification || null,
      response: event.evaluation?.agent_response || null,
    }));
  const evidenceHolds = (events || [])
    .filter((event) => event.type === "evidence_hold_recorded")
    .map((event) => ({
      state: event.state || null,
      reason: event.reason || null,
    }));
  return {
    event_types: types,
    repair_turn_count: types.filter((type) => type === "repair_dialogue_turn").length,
    evidence_events: evidenceEvents,
    evidence_holds: evidenceHolds,
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

function collectFriction(profile, metrics) {
  const friction = [];
  if (profile.id === "novice-immune-memory") {
    if (!metrics.has_substrate_seed) friction.push("Expected substrate_seed_offered for novice — missing.");
    if (!metrics.seed_before_route) friction.push("Expected seed before route_generated — order wrong.");
    if (metrics.turn_count_at_first_awaiting_refinement == null) {
      friction.push("Never reached substrate_refinement awaiting state.");
    }
  }
  if (profile.id === "expert-immune-memory") {
    if (metrics.has_substrate_seed) {
      friction.push("Expert should fast-path without substrate_seed_offered.");
    }
    if (!metrics.confirmed_before_route) {
      friction.push("Expected substrate_confirmed before route.");
    }
  }
  return friction;
}

async function runProfile(profile, options, health) {
  const { log, session } = await runPersonaSession({
    profile,
    baseUrl: options.baseUrl,
    maxTurns: options.maxTurns,
    allowFake: options.allowFake,
    health,
    onTurn: (turn) => {
      console.log(
        `  [${profile.id} turn ${turn.n}] phase=${turn.phase} key=${turn.awaiting_key_before || "?"} » ${turn.display.slice(0, 90)}${turn.display.length > 90 ? "…" : ""}`,
      );
    },
    shouldStopAfterTurn: ({ eventsTail }) =>
      eventsTail.some((event) => CASE_BOUNDARY_EVENTS.has(event.type)),
  });

  const metrics = substrateMetrics(session.events);
  metrics.final_graph_badge = session.derived?.at?.(-1)?.concept_status?.badge || null;
  for (const turn of log.turns) {
    if (
      turn.awaiting_key_before !== "substrate_refinement" &&
      turn.awaiting?.key === "substrate_refinement"
    ) {
      metrics.turn_count_at_first_awaiting_refinement = turn.n;
    }
  }

  const friction = collectFriction(profile, metrics);
  const blockingFriction = [...friction];
  if (profile.id === "novice-immune-memory" && metrics.repair_turn_count > 2) {
    friction.push(`Repair load: ${metrics.repair_turn_count} repair turns before bridge.`);
  }
  return {
    profile: profile.id.replace(/-immune-memory$/, ""),
    label: profile.label,
    brains: log.brains,
    turns: log.turns,
    metrics,
    friction,
    blockingFriction,
    final: log.final,
  };
}

async function main() {
  bootstrapPersonaEnv(REPO_ROOT);
  const options = parseArgs(process.argv);
  if (options.student) applyStudentProvider(options.student);

  const stamp = new Date().toISOString().replaceAll(":", "T").slice(0, 19);
  const outDir = path.join(options.outRoot, stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const health = await preflightPersonaRun({
    baseUrl: options.baseUrl,
    allowFake: options.allowFake,
    student: options.student,
  });

  console.log(`[matrix] ${health.llm_mode} fake=${health.fake_llm} base=${options.baseUrl}`);

  const profileIds = options.profiles?.length ? options.profiles : MATRIX_IDS;
  const profiles = profileIds.map((id) => getCartridge(id));
  if (!profiles.length) throw new Error(`no profiles match: ${profileIds.join(", ")}`);

  const results = [];
  for (const profile of profiles) {
    console.log(`\n[matrix] === ${profile.label} ===`);
    const log = await runProfile(profile, options, health);
    results.push(log);
    const outPath = path.join(outDir, `${log.profile}.json`);
    fs.writeFileSync(outPath, JSON.stringify(log, null, 2));
    console.log(
      `[matrix] ${log.profile}: brains=${log.brains} events=${log.metrics.event_types.length} friction=${log.friction.length} case_complete=${log.final.case_complete}`,
    );
  }

  const summaryPath = path.join(outDir, "SUMMARY.md");
  const lines = [
    `# Substrate persona matrix (${health.fake_llm ? "fake" : "live"})`,
    "",
    `| Profile | Brains | Seed | Confirmed→Route | Case complete | Friction |`,
    `|---------|--------|------|-----------------|---------------|----------|`,
  ];
  for (const log of results) {
    const m = log.metrics;
    lines.push(
      `| ${log.profile} | ${log.brains} | ${m.has_substrate_seed ? "yes" : "no"} | ${m.confirmed_before_route ? "yes" : "no"} | ${log.final.case_complete ? "yes" : "no"} | ${log.friction.length ? log.friction.join("; ") : "—"} |`,
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
  const anyFriction = results.some((r) => r.blockingFriction.length);
  process.exit(anyFriction ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
