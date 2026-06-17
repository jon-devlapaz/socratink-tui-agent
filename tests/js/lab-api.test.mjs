import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";

import { isLabEnabled, isLoopbackRequest, labAccessAllowed } from "../../lib/lab/lab-access.mjs";
import { handleLabApi } from "../../lib/lab/lab-api.mjs";
import {
  appendLabProgressToLedger,
  emptyLabEventLedger,
  projectLabBatchSnapshot,
} from "../../lib/lab/lab-event-ledger.mjs";
import {
  appendDialogueProgress,
  emptyLabDialogue,
} from "../../lib/lab/lab-dialogue.mjs";
import { EVENT_FACT_TYPES } from "../../lib/seda/event-facts.mjs";

function mockReq({ remoteAddress = "127.0.0.1", method = "GET", body = null } = {}) {
  const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
  return {
    method,
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function mockRes() {
  return {
    status: null,
    body: "",
    writeHead(status) {
      this.status = status;
    },
    end(payload) {
      this.body = payload || "";
    },
  };
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("lab access helpers", () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";
  assert.equal(isLabEnabled(), true);
  assert.equal(isLoopbackRequest({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(isLoopbackRequest({ socket: { remoteAddress: "10.0.0.1" } }), false);
  assert.equal(labAccessAllowed({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(labAccessAllowed({ socket: { remoteAddress: "10.0.0.1" } }), false);
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api gate returns 404 when disabled", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  delete process.env.SOCRATINK_LAB_ENABLED;
  const req = mockReq();
  const res = mockRes();
  await handleLabApi(req, res, "/api/lab/cartridges");
  assert.equal(res.status, 404);
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api gate returns 403 for non-loopback", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";
  const req = mockReq({ remoteAddress: "10.0.0.5" });
  const res = mockRes();
  await handleLabApi(req, res, "/api/lab/cartridges");
  assert.equal(res.status, 403);
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api lists cartridges when enabled", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";
  const req = mockReq();
  const res = mockRes();
  await handleLabApi(req, res, "/api/lab/cartridges");
  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.ok(Array.isArray(payload.cartridges));
  assert.ok(payload.cartridges.some((c) => c.id === "jordan-ai"));
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api returns canonical gate map for every event fact", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";
  const req = mockReq();
  const res = mockRes();
  await handleLabApi(req, res, "/api/lab/gates", { skipGate: true });

  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.version, "canonical-gates-v1");
  assert.deepEqual(
    [...new Set(payload.events.map((event) => event.type))].sort(),
    [...EVENT_FACT_TYPES].sort(),
  );
  assert.equal(payload.events.length, EVENT_FACT_TYPES.length);
  assert.ok(payload.groups.some((group) => group.id === "substrate"));
  assert.ok(payload.groups.some((group) => group.id === "failure"));
  assert.ok(payload.doctrine.includes("Context is not evidence."));
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("canonical gate map preserves evidence and graph-neutral boundaries", async () => {
  const res = mockRes();
  await handleLabApi(mockReq(), res, "/api/lab/gates", { skipGate: true });
  const payload = JSON.parse(res.body);
  const byType = Object.fromEntries(payload.events.map((event) => [event.type, event]));
  const evidenceTypes = payload.events
    .filter((event) => event.score_eligible)
    .map((event) => event.type)
    .sort();

  assert.deepEqual(evidenceTypes, ["cold_attempt", "spaced_redrill"]);
  assert.equal(byType.substrate_confirmed.graph_neutral, true);
  assert.equal(byType.repair_dialogue_turn.graph_neutral, true);
  assert.equal(byType.model_bridge.graph_neutral, true);
  assert.equal(byType.bridge_error.group, "failure");
  assert.equal(byType.bridge_error.graph_neutral, true);
  assert.match(byType.cold_attempt.next_phase, /solid -> strong_cold_path/);
  assert.match(byType.repair_dialogue_turn.next_phase, /bridge_ready -> repair/);
  assert.equal(byType.route_generated.next_phase, "cold_attempt");
});

test("lab event ledger preserves ordered bursts with canonical roles", () => {
  let ledger = emptyLabEventLedger();
  ledger = appendLabProgressToLedger(ledger, {
    activeRun: 1,
    turn: 1,
    phase: "cold_attempt",
    stage: "cold",
    state: "turn complete",
    eventsTail: [
      "learner_goal_set",
      "substrate_confirmed",
      "route_generated",
      "cold_attempt",
    ],
  });
  ledger = appendLabProgressToLedger(ledger, {
    activeRun: 1,
    turn: 2,
    phase: "repair_dialogue",
    stage: "repair",
    state: "turn complete",
    eventsTail: [
      "learner_goal_set",
      "substrate_confirmed",
      "route_generated",
      "cold_attempt",
      "gap_identified",
      "repair_dialogue_turn",
    ],
  });

  assert.deepEqual(
    ledger.timeline.map((entry) => [entry.seq, entry.type]),
    [
      [1, "learner_goal_set"],
      [2, "substrate_confirmed"],
      [3, "route_generated"],
      [4, "cold_attempt"],
      [5, "gap_identified"],
      [6, "repair_dialogue_turn"],
    ],
  );
  assert.equal(ledger.timeline.find((entry) => entry.type === "cold_attempt").role, "evidence_candidate");
  assert.equal(ledger.timeline.find((entry) => entry.type === "route_generated").routing_fact, true);
  assert.equal(ledger.timeline.find((entry) => entry.type === "repair_dialogue_turn").graph_neutral, true);
});

test("lab event ledger carries compact bridge timeout diagnostics", () => {
  let ledger = emptyLabEventLedger();
  ledger = appendLabProgressToLedger(ledger, {
    activeRun: 1,
    turn: 3,
    phase: "socratic_repair_drill",
    stage: "repair",
    state: "turn complete",
    eventsTail: [
      "cold_attempt",
      {
        type: "bridge_error",
        action: "socratic-repair-drill",
        error: "BridgeTimeout",
        message: "bridge subprocess timed out after 45000ms",
        duration_ms: 45012,
        timeout_ms: 45000,
        diagnostic: "/tmp/bridge-diagnostics/bridge-error.json",
        stderr: "secret local stack detail",
      },
    ],
  });

  const bridgeEntry = ledger.timeline.find((entry) => entry.type === "bridge_error");
  assert.equal(bridgeEntry.group, "failure");
  assert.equal(bridgeEntry.action, "socratic-repair-drill");
  assert.equal(bridgeEntry.error, "BridgeTimeout");
  assert.equal(bridgeEntry.message, "bridge subprocess timed out after 45000ms");
  assert.equal(bridgeEntry.duration_ms, 45012);
  assert.equal(bridgeEntry.timeout_ms, 45000);
  assert.equal(Object.hasOwn(bridgeEntry, "diagnostic"), false);
  assert.equal(Object.hasOwn(bridgeEntry, "stderr"), false);
});

test("lab batch projection preserves latest meaningful event and judgment policy", () => {
  let eventLedger = emptyLabEventLedger();
  let dialogue = emptyLabDialogue();
  eventLedger = appendLabProgressToLedger(eventLedger, {
    activeRun: 1,
    turn: 1,
    phase: "spaced_redrill",
    stage: "redrill",
    state: "turn complete",
    eventsTail: ["cold_attempt", "spaced_redrill", "idle_exit"],
  });
  dialogue = appendDialogueProgress(dialogue, {
    activeRun: 1,
    dialogueTurn: {
      turnRecord: {
        n: 1,
        phase: "cold_attempt",
        awaiting_key_before: "cold_attempt",
        input: "I think memory B cells keep a faster blueprint.",
      },
      transcript_delta: [{ text: "[Cold Attempt]" }, { text: "Try that in your own words." }],
    },
  });
  const snapshot = projectLabBatchSnapshot({
    batchId: "batch-1",
    status: "done",
    monitor: {
      state: "done",
      latestEvent: null,
    },
    eventLedger,
    dialogue,
  });

  assert.equal(snapshot.timeline.length, 3);
  assert.equal(snapshot.latestMeaningfulEvent, "idle_exit");
  assert.equal(snapshot.monitor.latestEvent, "idle_exit");
  assert.equal(Object.hasOwn(snapshot, "eventLedger"), false);
  assert.deepEqual(snapshot.judgment.score_eligible_types, ["cold_attempt", "spaced_redrill"]);
  assert.equal(snapshot.judgment.score_eligible_events, 2);
  assert.match(snapshot.judgment.evidence_policy, /Only cold_attempt and spaced_redrill/);
  assert.equal(snapshot.dialogue.version, "lab-dialogue-v1");
  assert.equal(snapshot.dialogue.runs[0].turn_count, 1);
  assert.equal(snapshot.dialogue.runs[0].turns[0].student, "I think memory B cells keep a faster blueprint.");
  assert.deepEqual(snapshot.dialogue.runs[0].turns[0].lines, [
    "[Cold Attempt]",
    "Try that in your own words.",
  ]);
});

test("lab browser timeline renders compact bridge timeout facts", () => {
  const script = readFileSync(new URL("../../public/lab/lab.js", import.meta.url), "utf8");
  assert.match(script, /function timelineNoteText/);
  assert.match(script, /entry\.action/);
  assert.match(script, /entry\.error/);
  assert.match(script, /entry\.timeout_ms/);
  assert.match(script, /entry\.duration_ms/);
  assert.match(script, /formatDurationMs/);
});

test("lab browser runs view stays decision-oriented", () => {
  const script = readFileSync(new URL("../../public/lab/lab.js", import.meta.url), "utf8");
  assert.match(script, /function runDecision/);
  assert.match(script, /Patch candidate/);
  assert.match(script, /Rerun live tutor/);
  assert.match(script, /run\.evidence === "accepted"/);
  assert.match(script, /Compare runs/);
  assert.match(script, /function renderRunsSummary/);
  assert.match(script, /function runSortScore/);
  assert.match(script, /row\.tabIndex = run\.dialogueId \? 0 : -1/);
});

test("lab browser selected run renders Thurman workbench", () => {
  const html = readFileSync(new URL("../../public/lab/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../../public/lab/lab.js", import.meta.url), "utf8");
  assert.match(html, /id="thurman-workbench"/);
  assert.match(script, /function thurmanDeliverable/);
  assert.match(script, /Prompt\/output patch proposal/);
  assert.match(script, /Comparison recommendation/);
  assert.match(script, /Preserve SEDA graph-truth boundaries/);
  assert.match(script, /Do not apply patches/);
});

test("lab browser does not create patch prompts from debug runs", () => {
  const script = readFileSync(new URL("../../public/lab/lab.js", import.meta.url), "utf8");
  assert.match(script, /run\.source !== "founder-batch"/);
  assert.match(script, /No patch prompt/);
  assert.match(script, /debug\/persona run/);
});

test("lab browser gates view stays decision-oriented", () => {
  const script = readFileSync(new URL("../../public/lab/lab.js", import.meta.url), "utf8");
  assert.match(script, /function gateDecision/);
  assert.match(script, /Prepare patch/);
  assert.match(script, /Compare runs/);
  assert.match(script, /function renderGateDecision/);
});

test("lab browser run view stays decision-oriented", () => {
  const script = readFileSync(new URL("../../public/lab/lab.js", import.meta.url), "utf8");
  assert.match(script, /function renderRunDecision/);
  assert.match(script, /Report \+ comparison/);
  assert.match(script, /Model endpoint missing/);
});

test("canonical gate map links bridge-owned events to registry actions", async () => {
  const res = mockRes();
  await handleLabApi(mockReq(), res, "/api/lab/gates", { skipGate: true });
  const payload = JSON.parse(res.body);
  const byType = Object.fromEntries(payload.events.map((event) => [event.type, event]));

  assert.deepEqual(byType.substrate_confirmed.bridge_actions, ["substrate-gate"]);
  assert.ok(byType.cold_attempt.bridge_actions.includes("evaluate-attempt"));
  assert.ok(byType.gap_identified.bridge_actions.includes("repair-scaffold"));
  assert.ok(byType.repair_dialogue_turn.bridge_actions.includes("repair-dialogue"));
  assert.ok(byType.route_generated.docs.includes("lib/bridge/registry.json"));
});

test("lab status returns founder-facing config summary", async () => {
  const prev = {
    lab: process.env.SOCRATINK_LAB_ENABLED,
    gemini: process.env.GEMINI_API_KEY,
    personaBase: process.env.PERSONA_LLM_BASE_URL,
    personaModel: process.env.PERSONA_LLM_MODEL,
  };
  process.env.SOCRATINK_LAB_ENABLED = "1";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.PERSONA_LLM_MODEL = "local-student";

  const probeServer = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({
        status: "ok",
        fake_llm: false,
        llm_provider: "gemini",
        llm_model: "gemini-2.5-flash",
      }));
      return;
    }
    if (req.url === "/models") {
      res.end(JSON.stringify({ data: [{ id: "local-student" }] }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  const baseUrl = await listen(probeServer);
  process.env.PERSONA_LLM_BASE_URL = baseUrl;

  try {
    const res = mockRes();
    await handleLabApi(mockReq(), res, "/api/lab/status", {
      baseUrl,
      skipGate: true,
    });
    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.config.founder_controls.length, 3);
    assert.equal(payload.endpoints.router.label, "FreeLLMAPI");
    assert.equal(payload.endpoints.router.env_var, "LLM_ROUTER_BASE_URL");
    assert.equal(payload.endpoints.router.configured, false);
    assert.equal(payload.endpoints.lmstudio.env_var, "LM_STUDIO_BASE_URL");
    assert.deepEqual(
      payload.config.founder_controls.map((item) => item.label),
      ["Tutor", "Student", "Evidence mode"],
    );
    assert.ok(payload.config.hidden_env.includes("PORT"));
    assert.equal(payload.config.setup_status.find((item) => item.id === "gemini").status, "ready");
  } finally {
    await close(probeServer);
    restoreEnv("SOCRATINK_LAB_ENABLED", prev.lab);
    restoreEnv("GEMINI_API_KEY", prev.gemini);
    restoreEnv("PERSONA_LLM_BASE_URL", prev.personaBase);
    restoreEnv("PERSONA_LLM_MODEL", prev.personaModel);
  }
});

test("lab model-test probes OpenAI-compatible router models", async () => {
  const prev = {
    routerBase: process.env.LLM_ROUTER_BASE_URL,
    routerKey: process.env.LLM_ROUTER_API_KEY,
  };
  let requestBody = null;
  let authorization = null;
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.statusCode = 404;
      res.end("{}");
      return;
    }
    authorization = req.headers.authorization;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      id: "probe",
      choices: [{ message: { content: "OK" } }],
    }));
  });
  const baseUrl = await listen(server);
  process.env.LLM_ROUTER_BASE_URL = `${baseUrl}/v1`;
  process.env.LLM_ROUTER_API_KEY = "router-test-key";

  try {
    const req = mockReq({
      method: "POST",
      body: { role: "tutor", provider: "router", model: "auto" },
    });
    const res = mockRes();
    await handleLabApi(req, res, "/api/lab/model-test", { skipGate: true });

    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.provider, "router");
    assert.equal(payload.model, "auto");
    assert.match(payload.message, /responded/);
    assert.equal(requestBody.model, "auto");
    assert.equal(authorization, "Bearer router-test-key");
  } finally {
    await close(server);
    restoreEnv("LLM_ROUTER_BASE_URL", prev.routerBase);
    restoreEnv("LLM_ROUTER_API_KEY", prev.routerKey);
  }
});

test("lab model-test rejects stale persona endpoint for FreeLLMAPI", async () => {
  const prev = {
    personaBase: process.env.PERSONA_LLM_BASE_URL,
    personaKey: process.env.PERSONA_LLM_API_KEY,
    routerBase: process.env.LLM_ROUTER_BASE_URL,
    routerKey: process.env.LLM_ROUTER_API_KEY,
  };
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.statusCode = 404;
      res.end("{}");
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
  });
  const baseUrl = await listen(server);
  process.env.PERSONA_LLM_BASE_URL = `${baseUrl}/v1`;
  process.env.PERSONA_LLM_API_KEY = "persona-key";
  delete process.env.LLM_ROUTER_BASE_URL;
  delete process.env.LLM_ROUTER_API_KEY;

  try {
    const req = mockReq({
      method: "POST",
      body: { role: "student", provider: "router", model: "student-auto" },
    });
    const res = mockRes();
    await handleLabApi(req, res, "/api/lab/model-test", { skipGate: true });

    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.ok, false);
    assert.match(payload.message, /FreeLLMAPI base URL is not configured/);
    assert.match(payload.message, /LLM_ROUTER_BASE_URL/);
  } finally {
    await close(server);
    restoreEnv("PERSONA_LLM_BASE_URL", prev.personaBase);
    restoreEnv("PERSONA_LLM_API_KEY", prev.personaKey);
    restoreEnv("LLM_ROUTER_BASE_URL", prev.routerBase);
    restoreEnv("LLM_ROUTER_API_KEY", prev.routerKey);
  }
});

test("lab model-test reports missing Gemini key without a live run", async () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const req = mockReq({
      method: "POST",
      body: { provider: "gemini", model: "gemini-2.5-flash" },
    });
    const res = mockRes();
    await handleLabApi(req, res, "/api/lab/model-test", { skipGate: true });

    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.ok, false);
    assert.match(payload.message, /missing/);
  } finally {
    restoreEnv("GEMINI_API_KEY", prev);
  }
});

test("lab api run lifecycle with mocked runner", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";

  const runs = new Map();
  const runStore = {
    startLabRun({ cartridgeId, student, allowFake }) {
      const runId = "test-run-1";
      runs.set(runId, {
        runId,
        status: "running",
        busy: true,
        busyLabel: "turn 1: tutor working (route)…",
        cartridgeId,
        student,
        allowFake,
        log: {
          brains: "tutor=sandbox student=compatible allow_fake=true",
          turns: [
            {
              n: 1,
              display: "Immune memory",
              transcript_delta: [{ text: "[Route]" }],
            },
          ],
        },
        updatedAt: Date.now(),
      });
      setTimeout(() => {
        const run = runs.get(runId);
        run.status = "done";
        run.busy = false;
        run.log.final = { case_complete: true, hit_max_turns: false };
        run.outDir = "/tmp/fake-run";
      }, 50);
      return runId;
    },
    getLabRunSnapshot(runId) {
      const run = runs.get(runId);
      if (!run) return null;
      return {
        runId: run.runId,
        status: run.status,
        busy: run.busy,
        busyLabel: run.busyLabel,
        error: null,
        outDir: run.outDir || null,
        reportPath: null,
        brains: run.log?.brains || null,
        cartridgeId: run.cartridgeId,
        student: run.student,
        allowFake: run.allowFake,
        log: run.log,
        updatedAt: run.updatedAt,
      };
    },
    cancelLabRun(runId) {
      const run = runs.get(runId);
      if (!run || run.status === "done") return false;
      run.status = "cancelled";
      return true;
    },
  };

  const createReq = mockReq({
    method: "POST",
    body: { cartridgeId: "jordan-ai", student: "compatible", allowFake: true },
  });
  const createRes = mockRes();
  await handleLabApi(createReq, createRes, "/api/lab/runs", { runStore, skipGate: true });
  assert.equal(createRes.status, 201);
  const { runId } = JSON.parse(createRes.body);
  assert.equal(runId, "test-run-1");

  const pollRes = mockRes();
  await handleLabApi(mockReq(), pollRes, `/api/lab/runs/${runId}`, {
    runStore,
    skipGate: true,
  });
  assert.equal(pollRes.status, 200);
  const snapshot = JSON.parse(pollRes.body);
  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.log.turns.length, 1);

  await new Promise((r) => setTimeout(r, 80));
  const doneRes = mockRes();
  await handleLabApi(mockReq(), doneRes, `/api/lab/runs/${runId}`, {
    runStore,
    skipGate: true,
  });
  const done = JSON.parse(doneRes.body);
  assert.equal(done.status, "done");
  assert.equal(done.log.final.case_complete, true);

  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api returns dialogue for a listed run", async () => {
  const runStore = {
    listLabRuns() {
      return [{ dialogueId: "dialogue-1", source: "persona" }];
    },
    getLabRunDialogue(dialogueId) {
      if (dialogueId !== "dialogue-1") return null;
      return {
        id: dialogueId,
        source: "persona",
        dialogue: {
          version: "lab-dialogue-v1",
          runs: [
            {
              index: 1,
              turn_count: 1,
              turns: [{ n: 1, student: "Learner answer", lines: ["Teacher response"] }],
            },
          ],
        },
      };
    },
  };

  const res = mockRes();
  await handleLabApi(mockReq(), res, "/api/lab/runs/dialogue-1/dialogue", {
    runStore,
    skipGate: true,
  });

  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.dialogue.runs[0].turns[0].student, "Learner answer");
  assert.deepEqual(payload.dialogue.runs[0].turns[0].lines, ["Teacher response"]);
});

test("lab api starts and polls founder console batch", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";

  const batches = new Map();
  const batchStore = {
    startLabBatch({
      cartridgeId,
      runs,
      tutor,
      tutorModel,
      student,
      studentModel,
      concept,
      learnerGoal,
    }) {
      const batchId = "batch-1";
      let eventLedger = emptyLabEventLedger();
      eventLedger = appendLabProgressToLedger(eventLedger, {
        activeRun: 1,
        turn: 1,
        phase: "cold_attempt",
        stage: "cold",
        state: "turn complete",
        eventsTail: ["substrate_confirmed", "route_generated", "cold_attempt"],
      });
      batches.set(batchId, {
        batchId,
        status: "done",
        busy: false,
        cartridgeId,
        runs,
        tutor,
        tutorModel,
        student,
        studentModel,
        concept,
        learnerGoal,
        batchDir: "/tmp/founder-batch",
        reportPath: "/tmp/founder-batch/REPORT.md",
        eventLedger,
        dialogue: appendDialogueProgress(emptyLabDialogue(), {
          activeRun: 1,
          dialogueTurn: {
            turnRecord: {
              n: 1,
              phase: "cold_attempt",
              awaiting_key_before: "cold_attempt",
              input: "Fluency can still be wrong.",
            },
            transcript_delta: [{ text: "[Cold Attempt]" }],
          },
        }),
        monitor: {
          state: "done",
          latestEvent: null,
        },
        report: {
          run_count: runs,
          evidence_status: "caveated",
          recommendation: "Confirm this pattern with a live Gemini tutor.",
        },
      });
      return batchId;
    },
    getLabBatchSnapshot(batchId) {
      return batches.get(batchId) || null;
    },
  };

  const createReq = mockReq({
    method: "POST",
    body: {
      cartridgeId: "novice-immune-memory",
      runs: 3,
      tutor: "router",
      tutorModel: "router-tutor",
      student: "cloud",
      studentModel: "gemini-student",
      concept: "Hallucination",
      learnerGoal: "Explain why fluent output can still be wrong.",
    },
  });
  const createRes = mockRes();
  await handleLabApi(createReq, createRes, "/api/lab/batches", {
    batchStore,
    skipGate: true,
  });
  assert.equal(createRes.status, 201);
  const { batchId } = JSON.parse(createRes.body);

  const pollRes = mockRes();
  await handleLabApi(mockReq(), pollRes, `/api/lab/batches/${batchId}`, {
    batchStore,
    skipGate: true,
  });
  assert.equal(pollRes.status, 200);
  const snapshot = JSON.parse(pollRes.body);
  assert.equal(snapshot.runs, 3);
  assert.equal(snapshot.tutor, "router");
  assert.equal(snapshot.tutorModel, "router-tutor");
  assert.equal(snapshot.studentModel, "gemini-student");
  assert.equal(snapshot.concept, "Hallucination");
  assert.equal(snapshot.learnerGoal, "Explain why fluent output can still be wrong.");
  assert.equal(snapshot.report.evidence_status, "caveated");
  assert.equal(snapshot.timeline.length, 3);
  assert.equal(Object.hasOwn(snapshot, "eventLedger"), false);
  assert.equal(snapshot.timeline[2].seq, 3);
  assert.equal(snapshot.timeline[2].type, "cold_attempt");
  assert.equal(snapshot.timeline[2].role, "evidence_candidate");
  assert.equal(snapshot.latestMeaningfulEvent, "cold_attempt");
  assert.equal(snapshot.monitor.latestEvent, "cold_attempt");
  assert.equal(snapshot.judgment.score_eligible_events, 1);
  assert.equal(snapshot.dialogue.runs[0].turns[0].student, "Fluency can still be wrong.");
  assert.deepEqual(snapshot.dialogue.runs[0].turns[0].lines, ["[Cold Attempt]"]);

  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api reveal opens founder batch folder", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";

  let revealed = null;
  const batchStore = {
    getLabBatchSnapshot(batchId) {
      return {
        batchId,
        batchDir: "/tmp/founder-batch",
        status: "done",
      };
    },
  };

  const res = mockRes();
  await handleLabApi(mockReq({ method: "POST" }), res, "/api/lab/batches/batch-1/reveal", {
    batchStore,
    skipGate: true,
    revealPathInOs: async (path) => {
      revealed = path;
    },
  });

  assert.equal(res.status, 200);
  assert.equal(revealed, "/tmp/founder-batch");

  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("lab api reveal opens run folder via injected helper", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";

  let revealed = null;
  const runStore = {
    getLabRunSnapshot(runId) {
      return {
        runId,
        outDir: "/tmp/fake-persona-run",
        status: "done",
      };
    },
  };

  const res = mockRes();
  await handleLabApi(mockReq({ method: "POST" }), res, "/api/lab/runs/test-run/reveal", {
    runStore,
    skipGate: true,
    revealPathInOs: async (path) => {
      revealed = path;
    },
  });
  assert.equal(res.status, 200);
  assert.equal(revealed, "/tmp/fake-persona-run");

  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("HTTP /lab static is 404 when lab disabled", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  delete process.env.SOCRATINK_LAB_ENABLED;
  const { createLoopServerWithStore } = await import("../../lib/loop-server/http-server.mjs");
  const { createFileSessionStore } = await import("../../lib/loop-server/session-store.mjs");
  const server = createLoopServerWithStore({
    sessionStore: createFileSessionStore({ rootDir: "/tmp/unused" }),
  });
  const baseUrl = await listen(server);
  try {
    const res = await fetch(`${baseUrl}/lab`);
    assert.equal(res.status, 404);
  } finally {
    await close(server);
  }
  process.env.SOCRATINK_LAB_ENABLED = prev;
});

test("HTTP /lab static loads when lab enabled on loopback", async () => {
  const prev = process.env.SOCRATINK_LAB_ENABLED;
  process.env.SOCRATINK_LAB_ENABLED = "1";
  const { createLoopServerWithStore } = await import("../../lib/loop-server/http-server.mjs");
  const { createFileSessionStore } = await import("../../lib/loop-server/session-store.mjs");
  const server = createLoopServerWithStore({
    sessionStore: createFileSessionStore({ rootDir: "/tmp/unused-lab" }),
  });
  const baseUrl = await listen(server);
  try {
    const res = await fetch(`${baseUrl}/lab`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /founder console/i);
    assert.match(html, /Founder signal first/i);
    assert.match(html, /role="tablist"/i);
    assert.match(html, /id="tab-run"/i);
    assert.match(html, /id="tab-dialogue"/i);
    assert.match(html, /id="tab-gates"/i);
    assert.match(html, /id="panel-dialogue"[^>]+hidden/i);
    assert.match(html, /id="panel-gates"[^>]+hidden/i);
    assert.match(html, /id="tutor-endpoint-status"/i);
    assert.match(html, /id="student-endpoint-status"/i);
    assert.match(html, /Breakage watch/i);
    assert.match(html, /id="gate-timeline"/i);
    assert.match(html, /id="gate-timeline-lanes"/i);
    assert.match(html, /id="gate-timeline-events"/i);
    assert.match(html, /Live timeline/i);
    assert.match(html, /id="gate-status-strip"/i);
    assert.match(html, /id="gate-pipeline-stages"/i);
    assert.match(html, /id="gate-inspector-details"/i);
    assert.match(html, /id="gate-judgment-metrics"/i);
    assert.match(html, /id="gate-comparison-metrics"/i);
    assert.match(html, /id="gate-comparison-runs"/i);
    assert.match(html, /SEDA pipeline/i);
    assert.match(html, /Founder judgment/i);
    assert.match(html, /Run comparison/i);
    assert.match(html, /Context is not evidence|canonical-gates-doctrine/i);
    const gatesStart = html.indexOf('id="canonical-gates"');
    const mainEnd = html.indexOf("</main>");
    const gatesHtml = html.slice(gatesStart, mainEnd);
    const timelineStart = html.indexOf('id="gate-timeline"');
    const timelineEnd = html.indexOf('id="canonical-gates-doctrine"');
    const timelineHtml = html.slice(timelineStart, timelineEnd);
    assert.ok(gatesStart > 0);
    assert.ok(mainEnd > gatesStart);
    assert.ok(timelineStart > gatesStart);
    assert.ok(timelineEnd > timelineStart);
    assert.doesNotMatch(gatesHtml, /<button/i);
    assert.doesNotMatch(gatesHtml, /<input|<select|<textarea/i);
    assert.doesNotMatch(timelineHtml, /<button|<input|<select|<textarea/i);
    assert.doesNotMatch(html, /FreeLLMAPI \(Pi\)/i);
    assert.doesNotMatch(html, /Allow sandbox tutor stubs/i);
  } finally {
    await close(server);
  }
  process.env.SOCRATINK_LAB_ENABLED = prev;
});
