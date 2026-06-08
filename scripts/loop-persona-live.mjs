#!/usr/bin/env node
/**
 * Live loop persona walkthrough against /loop API.
 *
 * Usage:
 *   node scripts/loop-persona-live.mjs
 *   node scripts/loop-persona-live.mjs --cartridge jordan-ai
 *   node scripts/loop-persona-live.mjs --student local --allow-fake
 *   node scripts/loop-persona-live.mjs --out .qa-runs/loop-persona/run-id
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
  studentProviderLabel,
  writePersonaArtifacts,
} from "../lib/lab/persona-runner.mjs";
import { isLabCancelRequested, writeLabProgress } from "../lib/lab/lab-progress.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.SOCRATINK_LOOP_BASE_URL || "http://127.0.0.1:8787",
    cartridgeId: "jordan-ai",
    concept: null,
    learnerGoal: null,
    launchAttempt: null,
    maxTurns: 24,
    out: null,
    allowFake: false,
    student: null,
    progressFile: null,
    cancelFile: null,
  };
  const args = [...argv.slice(2)];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--base-url") options.baseUrl = args.shift().replace(/\/$/, "");
    else if (arg === "--cartridge") options.cartridgeId = args.shift();
    else if (arg === "--concept") options.concept = args.shift();
    else if (arg === "--goal") options.learnerGoal = args.shift();
    else if (arg === "--launch") options.launchAttempt = args.shift();
    else if (arg === "--max-turns") options.maxTurns = Number(args.shift());
    else if (arg === "--out") options.out = path.resolve(args.shift());
    else if (arg === "--allow-fake") options.allowFake = true;
    else if (arg === "--student") options.student = args.shift();
    else if (arg === "--progress-file") options.progressFile = path.resolve(args.shift());
    else if (arg === "--cancel-file") options.cancelFile = path.resolve(args.shift());
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/loop-persona-live.mjs [--cartridge jordan-ai] [--student local|cloud] [--allow-fake] [--out dir]",
      );
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function brainsString(health, allowFake) {
  const tutor = health.fake_llm ? "sandbox" : "live-gemini";
  return `tutor=${tutor} student=${studentProviderLabel()} allow_fake=${allowFake}`;
}

async function main() {
  bootstrapPersonaEnv(REPO_ROOT);
  const options = parseArgs(process.argv);
  if (options.student) applyStudentProvider(options.student);

  const profile = getCartridge(options.cartridgeId);
  if (options.concept) profile.concept = options.concept;
  if (options.learnerGoal) profile.learner_goal = options.learnerGoal;
  if (options.launchAttempt) profile.launch_attempt = options.launchAttempt;

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outDir = options.out || path.join(REPO_ROOT, ".qa-runs/loop-persona", stamp);
  const progressOutDir = options.out ? outDir : null;
  const progressEnabled = Boolean(progressOutDir);

  const pushProgress = (partial) => {
    if (!progressEnabled) return;
    writeLabProgress(progressOutDir, partial);
  };

  const shouldCancel = () => {
    if (options.cancelFile && fs.existsSync(options.cancelFile)) return true;
    if (progressOutDir && isLabCancelRequested(progressOutDir)) return true;
    return false;
  };

  pushProgress({ status: "preflight", busy: true, busyLabel: "preflight", error: null, log: null });

  const health = await preflightPersonaRun({
    baseUrl: options.baseUrl,
    allowFake: options.allowFake,
    student: options.student,
  });

  console.log(`[loop-persona] ${profile.label} · concept="${profile.concept}"`);
  console.log(`[loop-persona] server=${options.baseUrl} brains=pending`);

  const progressLog = {
    cartridge_id: profile.id,
    label: profile.label,
    concept: profile.concept,
    learner_goal: profile.learner_goal,
    launch_attempt: profile.launch_attempt,
    persona_hint: profile.persona_hint,
    brains: brainsString(health, options.allowFake),
    llm_mode: health.llm_mode,
    turns: [],
  };

  pushProgress({
    status: "running",
    busy: true,
    busyLabel: "starting session",
    brains: progressLog.brains,
    log: progressLog,
  });

  try {
    const { log, cancelled } = await runPersonaSession({
      profile,
      baseUrl: options.baseUrl,
      maxTurns: options.maxTurns,
      allowFake: options.allowFake,
      health,
      shouldCancel,
      onPhaseStart: ({ n, phase, kind }) => {
        pushProgress({
          busy: true,
          busyLabel:
            kind === "persona"
              ? `turn ${n}: student thinking (${phase})`
              : kind === "continue"
                ? `turn ${n}: continuing (${phase})`
                : `turn ${n}: ${kind} input (${phase})`,
        });
      },
      onHttpWait: ({ n, phase }) => {
        pushProgress({
          busy: true,
          busyLabel: `turn ${n}: tutor working (${phase})…`,
        });
      },
      onTurnComplete: ({ turnRecord, transcript_delta, events_tail }) => {
        progressLog.turns.push({
          ...turnRecord,
          transcript_delta,
          events_tail,
        });
        pushProgress({
          busy: false,
          busyLabel: null,
          brains: progressLog.brains,
          log: { ...progressLog, turns: [...progressLog.turns] },
        });
      },
      onTurn: (turn) => {
        console.log(
          `\n[turn ${turn.n}] phase=${turn.phase} » ${turn.display.slice(0, 120)}${turn.display.length > 120 ? "…" : ""}`,
        );
      },
    });

    if (cancelled || shouldCancel()) {
      pushProgress({
        status: "cancelled",
        busy: false,
        busyLabel: null,
        brains: log.brains,
        log,
      });
      return;
    }

    const { reportPath, mdPath } = writePersonaArtifacts({ log, health, outDir, profile });

    pushProgress({
      status: "done",
      busy: false,
      busyLabel: null,
      error: null,
      brains: log.brains,
      log,
      reportPath,
    });

    console.log(`\n[loop-persona] ${log.brains}`);
    console.log(
      `[loop-persona] done complete=${log.final.complete} case_complete=${log.final.case_complete} hit_max_turns=${log.final.hit_max_turns} events=${log.final.event_types.length}`,
    );
    console.log(`[loop-persona] wrote ${reportPath}`);
    console.log(`[loop-persona] wrote ${mdPath}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pushProgress({
      status: "error",
      busy: false,
      busyLabel: null,
      error: message,
    });
    throw err;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
