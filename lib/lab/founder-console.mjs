import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import {
  applyStudentProvider,
  bootstrapPersonaEnv,
  compatibleDefaultModel,
  compatibleTargetForChoice,
  fetchJson,
  getCartridge,
  isOpenAiCompatibleMode,
  lmStudioDefaultModel,
  preflightPersonaRun,
  REPO_ROOT,
  runPersonaSession,
  writePersonaArtifacts,
} from "./persona-runner.mjs";
import {
  compareRunSignatures,
  summarizeRunSignature,
} from "./lab-event-ledger.mjs";

const DEFAULT_PORT = 8787;
const DEFAULT_TUTOR_MODEL = "gemini-2.5-flash";
const DEFAULT_OUT_ROOT = path.join(REPO_ROOT, ".qa-runs/founder-console");

const AXIS_PRIORITY = [
  "model_reliability",
  "substrate_viability",
  "generation_before_recognition",
  "repair_load",
  "evidence_progression",
];

export function usage() {
  return [
    "Usage:",
    "  ./socratink start [--port 8787] [--no-open]",
    "  ./socratink run --cartridge novice-immune-memory --runs 3 [--concept \"Immune memory\"] [--goal \"Explain why vaccines work\"]",
    "    [--tutor gemini|lmstudio|router] [--student cloud|lmstudio|router]",
    "",
    "OpenAI-compatible tutor requires explicit opt-in:",
    "  ./socratink run --cartridge novice-immune-memory --runs 3 --tutor router --tutor-model auto",
  ].join("\n");
}

function normalizeProviderChoice(value, { cloudValue }) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "local" || mode === "lmstudio" || mode === "lm_studio") return "lmstudio";
  if (mode === "compatible" || mode === "router" || mode === "openai_compatible") {
    return "router";
  }
  return value === cloudValue ? cloudValue : value;
}

export function parseFounderArgs(argv) {
  const args = [...argv];
  const command = args.shift() || "help";
  const options = {
    command,
    port: Number(process.env.PORT || DEFAULT_PORT),
    baseUrl: process.env.SOCRATINK_LOOP_BASE_URL || null,
    open: true,
    runs: 1,
    cartridgeId: "jordan-ai",
    student: "cloud",
    tutor: "gemini",
    tutorModel: null,
    studentModel: null,
    concept: null,
    learnerGoal: null,
    launchAttempt: null,
    maxTurns: 24,
    allowFake: false,
    outRoot: DEFAULT_OUT_ROOT,
  };

  if (command === "--help" || command === "-h") {
    options.command = "help";
    return options;
  }

  while (args.length) {
    const arg = args.shift();
    if (arg === "--port") options.port = Number(args.shift());
    else if (arg === "--base-url") options.baseUrl = args.shift()?.replace(/\/$/, "");
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--runs") options.runs = Number(args.shift());
    else if (arg === "--cartridge") options.cartridgeId = args.shift();
    else if (arg === "--student") options.student = args.shift();
    else if (arg === "--tutor") options.tutor = args.shift();
    else if (arg === "--tutor-model") options.tutorModel = args.shift();
    else if (arg === "--student-model") options.studentModel = args.shift();
    else if (arg === "--concept") options.concept = args.shift();
    else if (arg === "--goal") options.learnerGoal = args.shift();
    else if (arg === "--launch") options.launchAttempt = args.shift();
    else if (arg === "--max-turns") options.maxTurns = Number(args.shift());
    else if (arg === "--allow-fake") options.allowFake = true;
    else if (arg === "--out") options.outRoot = path.resolve(args.shift());
    else if (arg === "--help" || arg === "-h") options.command = "help";
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error("--port must be a positive integer");
  }
  if (!Number.isInteger(options.runs) || options.runs <= 0) {
    throw new Error("--runs must be a positive integer");
  }
  if (!Number.isInteger(options.maxTurns) || options.maxTurns <= 0) {
    throw new Error("--max-turns must be a positive integer");
  }
  if (!["help", "start", "run"].includes(options.command)) {
    throw new Error(`unknown command: ${options.command}`);
  }
  options.student = normalizeProviderChoice(options.student, { cloudValue: "cloud" });
  options.tutor = normalizeProviderChoice(options.tutor, { cloudValue: "gemini" });
  if (!["cloud", "lmstudio", "router"].includes(options.student)) {
    throw new Error("--student must be cloud, lmstudio, or router");
  }
  if (!["gemini", "lmstudio", "router"].includes(options.tutor)) {
    throw new Error("--tutor must be gemini, lmstudio, or router");
  }
  return options;
}

export function buildTutorSelection(options, env = process.env) {
  if (options.tutor === "gemini") {
    return {
      provider: "gemini",
      model:
        options.tutorModel ||
        (env.LLM_PROVIDER === "gemini" ? env.LLM_MODEL : "") ||
        DEFAULT_TUTOR_MODEL,
      evidenceMode: "cloud",
    };
  }

  const target = compatibleTargetForChoice(options.tutor);
  const model =
    options.tutorModel ||
    (target === "lmstudio" ? lmStudioDefaultModel(env) : compatibleDefaultModel(env));
  if (!model) {
    throw new Error("--tutor router requires --tutor-model or LLM_OPENAI_COMPAT_MODEL");
  }
  if (target === "router" && !(env.LLM_ROUTER_BASE_URL || "").trim()) {
    throw new Error("--tutor router requires LLM_ROUTER_BASE_URL");
  }
  return {
    provider: "openai_compatible",
    target,
    model,
    evidenceMode: target,
  };
}

export function applyStudentModel(options, env = process.env) {
  if (!options.studentModel) return;
  if (isOpenAiCompatibleMode(options.student)) {
    env.PERSONA_LLM_MODEL = options.studentModel;
  } else {
    env.PERSONA_GEMINI_MODEL = options.studentModel;
  }
}

export function modelReceipt({ tutor, student, health }) {
  const studentProvider = (process.env.PERSONA_LLM_PROVIDER || "gemini").trim();
  const studentModel =
    studentProvider === "openai_compatible"
      ? process.env.PERSONA_LLM_MODEL || compatibleDefaultModel()
      : process.env.PERSONA_GEMINI_MODEL || "gemini-2.5-flash";
  return {
    tutor: {
      provider: tutor.provider,
      model: tutor.model,
      mode: health?.fake_llm ? "fake" : tutor.evidenceMode,
    },
    student: {
      provider: studentProvider,
      model: studentModel,
      mode: student,
    },
  };
}

async function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function waitForHealth(baseUrl, { timeoutMs = 15_000 } = {}) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      return await fetchJson(`${baseUrl}/health`, {}, { timeoutMs: 1_500 });
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`loop server did not become healthy: ${lastError?.message || "timeout"}`);
}

export async function ensureLoopServer({
  port,
  baseUrl = null,
  open = false,
  spawnChild = spawn,
  opener = openUrl,
  env = process.env,
} = {}) {
  const resolvedBaseUrl = baseUrl || `http://127.0.0.1:${port || DEFAULT_PORT}`;
  try {
    const health = await fetchJson(`${resolvedBaseUrl}/health`, {}, { timeoutMs: 1_500 });
    if (open) await opener(`${resolvedBaseUrl}/lab`);
    return { baseUrl: resolvedBaseUrl, health, child: null, reused: true };
  } catch {
    // Start a local loop server below.
  }

  const serverPort = port || Number(new URL(resolvedBaseUrl).port || DEFAULT_PORT);
  if (!(await isPortAvailable(serverPort))) {
    throw new Error(`port ${serverPort} is occupied by a non-Socratink process`);
  }

  const child = spawnChild(process.execPath, ["loop-server.mjs"], {
    cwd: REPO_ROOT,
    env: {
      ...env,
      PORT: String(serverPort),
      HOST: "127.0.0.1",
      SOCRATINK_LAB_ENABLED: "1",
      SOCRATINK_LOOP_ALLOW_MODEL_OVERRIDE: "1",
    },
    stdio: "inherit",
  });
  const health = await waitForHealth(resolvedBaseUrl);
  if (open) await opener(`${resolvedBaseUrl}/lab`);
  return { baseUrl: resolvedBaseUrl, health, child, reused: false };
}

export function openUrl(url) {
  if (process.platform !== "darwin") return;
  const child = spawn("open", [url], { stdio: "ignore", detached: true });
  child.unref();
}

function runDir(root, index) {
  const suffix = Math.random().toString(16).slice(2, 8);
  return path.join(root, `run-${String(index).padStart(3, "0")}-${suffix}`);
}

function loadRunRubric(outDir) {
  const filePath = path.join(outDir, "loop-rubric.json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function latestGraphBadge(sessionRecord) {
  const derived = Array.isArray(sessionRecord?.derived) ? sessionRecord.derived : [];
  const latest = derived.at(-1);
  return latest?.concept_status?.badge || latest?.concept_status?.state || null;
}

function latestSpacedClassification(sessionRecord) {
  const events = Array.isArray(sessionRecord?.events) ? sessionRecord.events : [];
  const spaced = events.filter((event) => event.type === "spaced_redrill").at(-1);
  return spaced?.evaluation?.classification || null;
}

export function aggregateFounderReport({ runs, receipt }) {
  const axisCounts = {};
  for (const run of runs) {
    for (const [axis, result] of Object.entries(run.rubric?.axes || {})) {
      axisCounts[axis] ||= { pass: 0, watch: 0, fail: 0 };
      axisCounts[axis][result.score] += 1;
    }
  }

  const modelScores = runs
    .map((run) => run.rubric?.axes?.model_reliability?.score)
    .filter(Boolean);
  const blockedByModel = modelScores.some((score) => score !== "pass");
  const missingRubric = runs.some((run) => !run.rubric);
  const failedOverall = runs.some((run) => (run.rubric?.overall || "fail") === "fail");
  const watchedOverall = runs.some((run) => run.rubric?.overall === "watch");
  const failedAxis = AXIS_PRIORITY.find((axis) => (axisCounts[axis]?.fail || 0) > 0);
  const watchedAxis = AXIS_PRIORITY.find((axis) => (axisCounts[axis]?.watch || 0) > 0);
  const fakeTutor = receipt?.tutor?.mode === "fake";
  let evidenceStatus = "accepted";
  let recommendation = "No prompt change indicated; use this batch as a control trace.";

  if (fakeTutor) {
    evidenceStatus = "rejected";
    recommendation = "Rerun with a live tutor model before making product or prompt changes.";
  } else if (missingRubric) {
    evidenceStatus = "rejected";
    recommendation = "Collect a complete rubric trace before using this batch as product evidence.";
  } else if (failedOverall) {
    evidenceStatus = "rejected";
    recommendation = failedAxis
      ? recommendationForAxis(failedAxis)
      : "Inspect the failed run before changing prompts.";
  } else if (failedAxis) {
    evidenceStatus = "rejected";
    recommendation = recommendationForAxis(failedAxis);
  } else if (blockedByModel) {
    evidenceStatus = "caveated";
    recommendation = "Confirm this pattern with a live Gemini tutor before changing prompts.";
  } else if (watchedOverall) {
    evidenceStatus = "caveated";
    recommendation = watchedAxis
      ? recommendationForAxis(watchedAxis)
      : "Compare this watch batch with another run before changing prompts.";
  } else if (watchedAxis) {
    evidenceStatus = "caveated";
    recommendation = recommendationForAxis(watchedAxis);
  }

  const signatures = runs.map((run) =>
    summarizeRunSignature({
      index: run.index,
      outDir: run.outDir,
      log: run.log,
      sessionRecord: run.sessionRecord,
      rubric: run.rubric,
    }),
  );
  const comparison = compareRunSignatures(signatures);

  return {
    report_version: "founder-console-v1",
    run_count: runs.length,
    evidence_status: evidenceStatus,
    model_receipt: receipt,
    axis_counts: axisCounts,
    recommendation,
    comparison,
    signatures,
    runs: runs.map((run, index) => ({
      index: run.index,
      out_dir: run.outDir,
      overall: run.rubric?.overall || "fail",
      evaluator_spaced_classification: latestSpacedClassification(run.sessionRecord),
      graph_badge: latestGraphBadge(run.sessionRecord),
      final: run.log?.final || null,
      signature: signatures[index],
    })),
  };
}

function recommendationForAxis(axis) {
  if (axis === "substrate_viability") {
    return "Inspect substrate gate prompt or cartridge substrate setup.";
  }
  if (axis === "generation_before_recognition") {
    return "Inspect launch copy and substrate confirmation before changing evaluator prompts.";
  }
  if (axis === "repair_load") {
    return "Inspect Delta scaffold and repair-dialogue judge for excess repair load.";
  }
  if (axis === "evidence_progression") {
    return "Inspect transfer check and spaced re-drill prompt.";
  }
  if (axis === "model_reliability") {
    return "Fix provider reliability before using this batch as pedagogy evidence.";
  }
  return "Inspect the highest-frequency failed rubric axis before changing prompts.";
}

export function renderFounderReportMarkdown(report) {
  const axes = Object.entries(report.axis_counts || {});
  return [
    "# Founder Console report",
    "",
    `- Runs: ${report.run_count}`,
    `- Evidence status: ${report.evidence_status}`,
    `- Tutor: ${report.model_receipt?.tutor?.provider}/${report.model_receipt?.tutor?.model} (${report.model_receipt?.tutor?.mode})`,
    `- Student: ${report.model_receipt?.student?.provider}/${report.model_receipt?.student?.model} (${report.model_receipt?.student?.mode})`,
    `- Recommendation: ${report.recommendation}`,
    "",
    "## Rubric summary",
    "",
    "| Axis | Pass | Watch | Fail |",
    "| --- | ---: | ---: | ---: |",
    ...axes.map(
      ([axis, counts]) => `| ${axis} | ${counts.pass || 0} | ${counts.watch || 0} | ${counts.fail || 0} |`,
    ),
    "",
    "## Runs",
    "",
    "| Run | Overall | Evaluator spaced | Graph badge | Folder |",
    "| ---: | --- | --- | --- | --- |",
    ...report.runs.map(
      (run) =>
        `| ${run.index} | ${run.overall} | ${run.evaluator_spaced_classification || "n/a"} | ${run.graph_badge || "n/a"} | ${run.out_dir} |`,
    ),
    "",
    "## Run comparison",
    "",
    `- Signature variants: ${report.comparison?.signature_variants ?? 0}`,
    `- Divergent: ${report.comparison?.divergent ? "yes" : "no"}`,
    `- Evidence range: ${report.comparison?.evidence_range?.min ?? 0}–${report.comparison?.evidence_range?.max ?? 0}`,
    `- Failure runs: ${(report.comparison?.failure_runs || []).join(", ") || "none"}`,
    "",
  ].join("\n");
}

export function pedagogicalStageFromTrace({ phase = "", eventsTail = [] } = {}) {
  const events = Array.isArray(eventsTail) ? eventsTail.toReversed() : [];
  for (const event of events) {
    const type = String(typeof event === "string" ? event : event?.type || "");
    if (type === "idle_exit") return "report";
    if (type === "spaced_redrill") return "redrill";
    if (type === "post_bridge_transfer_check") return "transfer";
    if (type === "model_bridge") return "bridge";
    if (type === "repair_dialogue_turn" || type === "repair") return "repair";
    if (type === "cold_attempt") return "cold";
    if (type === "route_generated") return "route";
    if (type.startsWith("substrate_")) return "substrate";
  }

  const normalized = String(phase || "").toLowerCase();
  if (normalized.includes("spaced")) return "redrill";
  if (normalized.includes("post_bridge") || normalized.includes("transfer")) return "transfer";
  if (normalized.includes("bridge")) return "bridge";
  if (normalized.includes("repair")) return "repair";
  if (normalized.includes("cold")) return "cold";
  if (normalized.includes("route")) return "route";
  if (normalized.includes("substrate") || normalized.includes("ignition")) return "substrate";
  return "substrate";
}

export async function runFounderBatch(options) {
  bootstrapPersonaEnv(REPO_ROOT);
  applyStudentProvider(options.student);
  applyStudentModel(options);
  const tutor = buildTutorSelection(options);
  const server = await ensureLoopServer({
    port: options.port,
    baseUrl: options.baseUrl,
    open: false,
  });
  const health = await preflightPersonaRun({
    baseUrl: server.baseUrl,
    allowFake: options.allowFake,
    student: options.student,
  });
  const serverTutor = {
    provider: health.llm_provider || "gemini",
    target: health.llm_target || null,
    model: health.llm_model || DEFAULT_TUTOR_MODEL,
  };
  const tutorMatchesServer =
    serverTutor.provider === tutor.provider &&
    serverTutor.model === tutor.model &&
    (tutor.provider !== "openai_compatible" || serverTutor.target === tutor.target);
  if (!health.llm_override_allowed && !tutorMatchesServer) {
    throw new Error(
      "existing loop server does not allow tutor override; restart with ./socratink start",
    );
  }
  const receipt = modelReceipt({ tutor, student: options.student, health });
  const batchId = new Date().toISOString().replaceAll(":", "-");
  const batchDir = path.join(options.outRoot, batchId);
  fs.mkdirSync(batchDir, { recursive: true });

  const profile = getCartridge(options.cartridgeId);
  const baseConcept = profile.concept;
  const baseLearnerGoal = profile.learner_goal;
  const conceptOverride = String(options.concept || "").trim();
  const learnerGoalOverride = String(options.learnerGoal || "").trim();
  const launchOverride = String(options.launchAttempt || "").trim();
  const customContext =
    (conceptOverride && conceptOverride !== baseConcept) ||
    (learnerGoalOverride && learnerGoalOverride !== baseLearnerGoal);
  if (conceptOverride) profile.concept = conceptOverride;
  if (learnerGoalOverride) profile.learner_goal = learnerGoalOverride;
  if (launchOverride) profile.launch_attempt = launchOverride;
  else if (customContext) profile.launch_attempt = "";
  const runs = [];
  options.onProgress?.({
    total: options.runs,
    completed: 0,
    activeRun: null,
    stage: "substrate",
    state: "starting",
    label: "starting batch",
  });
  for (let i = 1; i <= options.runs; i += 1) {
    const outDir = runDir(batchDir, i);
    options.onProgress?.({
      total: options.runs,
      completed: i - 1,
      activeRun: i,
      stage: "substrate",
      state: "running",
      label: `run ${i}: starting`,
    });
    const { log, session } = await runPersonaSession({
      profile,
      baseUrl: server.baseUrl,
      maxTurns: options.maxTurns,
      allowFake: options.allowFake,
      health,
      llm: health.llm_override_allowed
        ? { provider: tutor.provider, target: tutor.target, model: tutor.model }
        : null,
      onPhaseStart: ({ n, phase, kind }) => {
        const stage = pedagogicalStageFromTrace({ phase });
        options.onProgress?.({
          total: options.runs,
          completed: i - 1,
          activeRun: i,
          turn: n,
          phase,
          stage,
          state: kind === "persona" ? "student thinking" : "scripted input",
          label: `run ${i}, turn ${n}: ${stage}`,
        });
      },
      onHttpWait: ({ n, phase }) => {
        const stage = pedagogicalStageFromTrace({ phase });
        options.onProgress?.({
          total: options.runs,
          completed: i - 1,
          activeRun: i,
          turn: n,
          phase,
          stage,
          state: "tutor working",
          label: `run ${i}, turn ${n}: tutor working`,
        });
      },
      onTurnComplete: ({ turnRecord, events_tail }) => {
        const latestEvent = events_tail?.at?.(-1);
        const latestEventType =
          typeof latestEvent === "string" ? latestEvent : latestEvent?.type || null;
        const stage = pedagogicalStageFromTrace({
          phase: turnRecord?.phase,
          eventsTail: events_tail,
        });
        options.onProgress?.({
          total: options.runs,
          completed: i - 1,
          activeRun: i,
          turn: turnRecord?.n || null,
          phase: turnRecord?.phase || null,
          stage,
          state: "turn complete",
          label: `run ${i}: ${stage}`,
          latestEvent: latestEventType,
          eventsTail: events_tail || [],
        });
      },
    });
    writePersonaArtifacts({
      log,
      health,
      outDir,
      profile,
      sessionRecord: session?.record ?? null,
    });
    runs.push({
      index: i,
      outDir,
      log,
      sessionRecord: session?.record ?? null,
      rubric: loadRunRubric(outDir),
    });
    options.onProgress?.({
      total: options.runs,
      completed: i,
      activeRun: i < options.runs ? i + 1 : null,
      stage: i < options.runs ? "substrate" : "report",
      state: i < options.runs ? "queued next run" : "reporting",
      label: i < options.runs ? `run ${i} complete` : "building report",
    });
  }

  const report = aggregateFounderReport({ runs, receipt });
  const reportJsonPath = path.join(batchDir, "founder-report.json");
  const reportMdPath = path.join(batchDir, "REPORT.md");
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportMdPath, renderFounderReportMarkdown(report));
  return { batchDir, reportJsonPath, reportMdPath, report, server };
}
