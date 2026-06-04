import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HANDLERS } from "../../lib/seda/handlers/index.mjs";
import { advanceSession } from "../../lib/loop-server/session.mjs";
import { LOOP_APP_VERSION_DEFAULT } from "../../lib/loop-server/version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BASE = process.env.SOCRATINK_LOOP_BASE_URL || "http://127.0.0.1:8787";
const FAST_LAUNCH =
  "Caching stores a result so later matching requests can reuse it faster.";
const SHALLOW_COLD =
  "Caching improves performance by storing earlier work for faster retrieval.";
const READY_REPAIR =
  "Memory cells form and stay ready, so the next exposure gets a faster response.";

function makeAgent(id, name = id) {
  return {
    id,
    name,
    job: `${name} job`,
    required_outputs: [],
    may_propose_events: [],
    truth_permission: "none",
    failure_mode_to_guard: "fixture guard",
  };
}

function makeLoopSessionForSubstrateTest() {
  const agentLookup = new Map([
    ["substrate_gate", makeAgent("substrate_gate", "Substrate Gate Agent")],
    ["route", makeAgent("route", "Route Agent")],
    ["cold_attempt", makeAgent("cold_attempt", "Cold Attempt Agent")],
  ]);
  return {
    id: "substrate-loop-test",
    phase: "idle",
    events: [],
    derived: [],
    evidenceHolds: [],
    llmCalls: [],
    transcript: [],
    status: "active",
    pendingInput: null,
    ctx: {
      concept: "",
      conceptId: "",
      learnerGoal: null,
      launchAttempt: null,
      firstNode: null,
      nodeIds: [],
      route: null,
      coldEval: null,
      coldAttemptText: "",
      zeroSchemaCold: false,
      isMisconception: false,
      repairScaffold: null,
      postBridgeTransfer: null,
      gapId: "",
      repairState: null,
      evidenceHolds: [],
      scripted: null,
      agentLookup,
      agentContracts: {},
      section: (_kind, label) => `[${label}]`,
      colorEnabled: false,
      logDir: null,
    },
    store: {
      setProvenance: async () => {},
      setSketch: async () => {},
      loadTraining: async () => null,
    },
    bridge: {
      callBridge: (action, payload) => {
        assert.equal(action, "substrate-gate");
        const hasRefinement = Boolean(
          String(payload.substrate_refinement || "").trim(),
        );
        return {
          substrate_gate: {
            contract_version: "substrate-gate-v1",
            classification: hasRefinement ? "fast" : "slow",
            substrate_adequate: hasRefinement,
            seed_text:
              "A safe preview lets the body notice a pattern without the full illness.",
            refinement_prompt:
              "Add one starting link in your own words: what changes after that preview?",
            judge_reason: "fixture",
            graph_neutral: true,
            score_eligible: false,
          },
          llm_call: {
            provider: "fake",
            model: "fake-substrate-gate",
            latency_ms: 0,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        };
      },
      callBridgeResult: (action) => {
        assert.equal(action, "generate-route");
        return {
          ok: true,
          payload: {
            provisional_map: {
              metadata: {
                core_thesis: "Immune memory uses a safe preview to prepare later response.",
              },
              backbone: [
                {
                  id: "b1",
                  principle: "Safe preview creates durable response memory.",
                  dependent_clusters: ["c1"],
                },
              ],
              clusters: [
                {
                  id: "c1",
                  label: "Immune bridge",
                  subnodes: [
                    {
                      id: "c1_s1",
                      label: "Immune memory",
                      learner_scaffold: {
                        task_label: "Explain the immune memory bridge",
                      },
                    },
                  ],
                },
              ],
            },
            first_node: {
              id: "c1_s1",
              learner_prompt:
                "In your own words, why does a safe preview make the later response faster?",
            },
            llm_call: {
              provider: "fake",
              model: "fake-route",
              latency_ms: 0,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          },
        };
      },
    },
    handlers: HANDLERS,
    options: {
      color: "never",
      logRawLlm: false,
      loopUi: true,
      loopUiPacing: "one_beat",
    },
  };
}

async function createApiSession() {
  const create = await fetch(`${BASE}/api/session`, { method: "POST" });
  assert.equal(create.status, 201);
  const created = await create.json();
  const post = async (text) => {
    const body = text === undefined ? {} : { text };
    const turn = await fetch(`${BASE}/api/session/${created.sessionId}/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(turn.status, 200);
    return turn.json();
  };
  return { ...created, post };
}

function transcriptText(body) {
  return (body.transcript || []).map((line) => line.text || "").join("\n");
}

async function advanceToColdAttempt() {
  const session = await createApiSession();
  await session.post("Caching");
  await session.post("Explain why caching makes repeat requests faster");
  const routeTurn = await session.post(FAST_LAUNCH);
  assert.equal(routeTurn.status, "awaiting_input");
  assert.equal(routeTurn.awaiting?.key, "cold_attempt");
  return { session, routeTurn };
}

async function advanceToColdPacingStop() {
  const { session } = await advanceToColdAttempt();
  const coldTurn = await session.post(SHALLOW_COLD);
  assert.equal(coldTurn.status, "awaiting_input");
  assert.equal(coldTurn.awaiting?.key, "continue");
  return { session, coldTurn };
}

async function advanceToDeltaPacingStop() {
  const { session } = await advanceToColdPacingStop();
  const deltaTurn = await session.post();
  assert.equal(deltaTurn.status, "awaiting_input");
  assert.equal(deltaTurn.awaiting?.key, "repair");
  return { session, deltaTurn };
}

test("loop static assets use terminal chrome and phase styling", () => {
  const html = readFileSync(path.join(ROOT, "public/loop/index.html"), "utf8");
  const js = readFileSync(path.join(ROOT, "public/loop/loop.js"), "utf8");
  const css = readFileSync(path.join(ROOT, "public/loop/loop.css"), "utf8");
  assert.doesNotMatch(html, /id="status"/);
  assert.match(html, /id="phase-pill"/);
  assert.match(html, /id="version-pill"/);
  assert.match(html, /id="llm-pill"/);
  assert.match(js, /refreshHealth/);
  assert.match(js, /setVersionPillFromHealth/);
  assert.match(js, /appendLlmReceipt/);
  assert.match(js, /substrate_gate/);
  assert.match(js, /isContinueAwaiting/);
  assert.match(js, /sendContinueTurn/);
  assert.match(js, /appendUser:\s*false/);
  assert.match(js, /awaitingBeforeSubmit/);
  assert.match(js, /showAwaitingPrompt\(awaitingBeforeSubmit\)/);
  assert.match(js, /clean === ">/);
  assert.match(html, /\/meta/);
  assert.match(js, /\/meta/);
  assert.match(html, /id="composer-busy"/);
  assert.match(html, /id="composer-cta"/);
  assert.match(html, /aria-busy/);
  assert.match(html, /class="terminal"/);
  assert.match(js, /THINKING_COPY/);
  assert.match(js, /isRecentDuplicate/);
  assert.doesNotMatch(js, /showThinkingLine/);
  assert.match(css, /braille-spin/);
  assert.doesNotMatch(css, /\.line\.thinking/);
  assert.match(css, /\.send-key/);
});

test("dashboard static assets expose shared payload version tracker", () => {
  const html = readFileSync(path.join(ROOT, "public/dashboard/index.html"), "utf8");
  const js = readFileSync(path.join(ROOT, "public/dashboard/dashboard.js"), "utf8");
  const css = readFileSync(path.join(ROOT, "public/dashboard/dashboard.css"), "utf8");
  assert.match(html, /id="version-dashboard"/);
  assert.match(html, /id="version-payload"/);
  assert.match(html, /id="version-logic"/);
  assert.match(html, /id="product-metrics"/);
  assert.match(html, /id="dogfood-evidence"/);
  assert.match(js, /version_tracker/);
  assert.match(js, /product_strategy_v2/);
  assert.match(js, /tracker\.logic_owner/);
  assert.match(css, /\.version-tracker/);
  assert.match(css, /\.product-metrics/);
});

test("loop API /health exposes app_version", async () => {
  const res = await fetch(`${BASE}/health`);
  assert.equal(res.status, 200);
  const health = await res.json();
  assert.equal(health.app_version, LOOP_APP_VERSION_DEFAULT);
});

test("loop API session returns awaiting label for chat prompt", async () => {
  const create = await fetch(`${BASE}/api/session`, { method: "POST" });
  assert.equal(create.status, 201);
  const body = await create.json();
  assert.ok(body.sessionId);
  assert.equal(body.status, "awaiting_input");
  assert.match(body.awaiting?.label || "", /concept|>|Concept/i);
});

test("loop API GET session returns enriched awaiting like POST turn", async () => {
  const create = await fetch(`${BASE}/api/session`, { method: "POST" });
  const created = await create.json();
  const turn = await fetch(`${BASE}/api/session/${created.sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Immune memory" }),
  });
  const turnBody = await turn.json();
  const get = await fetch(`${BASE}/api/session/${created.sessionId}`);
  const saved = await get.json();
  assert.equal(saved.status, turnBody.status);
  assert.equal(saved.awaiting?.key, turnBody.awaiting?.key);
  assert.equal(saved.awaiting?.ctaLabel, turnBody.awaiting?.ctaLabel);
  assert.equal(saved.awaiting?.ctaText, turnBody.awaiting?.ctaText);
  assert.ok(Array.isArray(saved.transcript));
  assert.ok(saved.transcript.length >= turnBody.transcript.length);
});

test("loop API /exit ends session from idle", async () => {
  const create = await fetch(`${BASE}/api/session`, { method: "POST" });
  const { sessionId } = await create.json();
  const turn = await fetch(`${BASE}/api/session/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "/exit" }),
  });
  assert.equal(turn.status, 200);
  const body = await turn.json();
  assert.equal(body.complete, true);
  assert.equal(body.status, "complete");
  assert.ok(body.events.some((e) => e.type === "idle_exit"));
});

test("loop API /exit ends session mid-prompt", async () => {
  const create = await fetch(`${BASE}/api/session`, { method: "POST" });
  const { sessionId } = await create.json();
  await fetch(`${BASE}/api/session/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "AI" }),
  });
  const turn = await fetch(`${BASE}/api/session/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "/exit" }),
  });
  const body = await turn.json();
  assert.equal(body.complete, true);
  assert.ok(body.events.some((e) => e.type === "idle_exit"));
});

test("loop API /feedback without message shows usage", async () => {
  const create = await fetch(`${BASE}/api/session`, { method: "POST" });
  const { sessionId } = await create.json();
  const turn = await fetch(`${BASE}/api/session/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "/feedback" }),
  });
  assert.equal(turn.status, 200);
  const body = await turn.json();
  assert.equal(body.status, "awaiting_input");
  const line = (body.transcript || []).find((row) =>
    String(row.text || "").startsWith("[Feedback]"),
  );
  assert.ok(line);
  assert.match(line.text, /Usage/i);
});

test("loop API /help returns phase help without advancing", async () => {
  const create = await fetch(`${BASE}/api/session`, { method: "POST" });
  const { sessionId } = await create.json();
  const turn = await fetch(`${BASE}/api/session/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "/help" }),
  });
  assert.equal(turn.status, 200);
  const body = await turn.json();
  assert.equal(body.status, "awaiting_input");
  const helpLines = (body.transcript || []).filter((line) =>
    String(line.text || "").startsWith("[Help]"),
  );
  assert.ok(helpLines.length >= 2, "expected idle help (path + commands)");
  assert.match(helpLines[0].text, /Path:/i);
  assert.match(helpLines[1].text, /Commands:/i);
});

test("loop API /help at launch_attempt matches launch step not learner goal", async () => {
  const create = await fetch(`${BASE}/api/session`, { method: "POST" });
  const { sessionId } = await create.json();
  const post = (text) =>
    fetch(`${BASE}/api/session/${sessionId}/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => r.json());

  await post("Immune memory");
  await post("Explain how vaccines work");
  const body = await post("/help");
  const helpLine = (body.transcript || []).find((line) =>
    String(line.text || "").startsWith("[Help]"),
  );
  assert.ok(helpLine);
  assert.match(helpLine.text, /Launch attempt/i);
  assert.match(helpLine.text, /before the map appears/i);
  assert.match(helpLine.text, /not counted as the scored answer/i);
  assert.doesNotMatch(helpLine.text, /Learner goal:/i);
  assert.match(body.awaiting?.label || "", /Launch attempt/i);
});

test("loop cold eval returns before delta on separate turn", async () => {
  const { coldTurn } = await advanceToColdPacingStop();
  const text = transcriptText(coldTurn);

  assert.equal(coldTurn.awaiting?.ctaLabel, "Continue");
  assert.equal(coldTurn.awaiting?.ctaText, null);
  assert.match(text, /Cold Attempt/i);
  assert.match(text, /Evidence/i);
  assert.doesNotMatch(text, /Delta/i);
  assert.doesNotMatch(text, /Socratic Repair Drill/i);
  assert.ok(coldTurn.events.some((event) => event.type === "cold_attempt"));
  assert.equal(
    coldTurn.events.some((event) => event.type === "gap_identified"),
    false,
  );
});

test("hosted loop malformed cold bridge output fails closed at idle", async () => {
  const session = makeLoopSessionForSubstrateTest();
  session.bridge.callBridge = (action) => {
    if (action === "substrate-gate") {
      return {
        substrate_gate: {
          contract_version: "substrate-gate-v1",
          classification: "fast",
          substrate_adequate: true,
          seed_text: null,
          refinement_prompt: null,
          judge_reason: "fixture",
          graph_neutral: true,
          score_eligible: false,
        },
        llm_call: {
          provider: "fake",
          model: "fake-substrate-gate",
          latency_ms: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      };
    }
    if (action === "evaluate-attempt") {
      return {
        evaluation: { classification: "solid" },
        llm_call: { provider: "fake", model: "malformed-evaluator" },
      };
    }
    throw new Error(`unexpected bridge action: ${action}`);
  };
  const post = (text) => advanceSession(session, text);

  await advanceSession(session);
  await post("Immune memory");
  await post("Explain how vaccines work");
  const routeTurn = await post(FAST_LAUNCH);
  assert.equal(routeTurn.awaiting?.key, "cold_attempt");

  const failedCold = await post(SHALLOW_COLD);
  const text = transcriptText(failedCold);
  const bridgeError = failedCold.events.findLast(
    (event) => event.type === "bridge_error",
  );

  assert.equal(failedCold.status, "awaiting_input");
  assert.equal(failedCold.phase, "idle");
  assert.equal(failedCold.awaiting?.key, "cmd");
  assert.ok(bridgeError);
  assert.equal(bridgeError.action, "evaluate-attempt");
  assert.equal(bridgeError.phase, "cold_attempt");
  assert.equal(bridgeError.score_eligible, false);
  assert.equal(
    failedCold.events.some((event) => event.type === "cold_attempt"),
    false,
  );
  assert.equal(
    failedCold.events.some((event) => event.type === "model_bridge"),
    false,
  );
  assert.doesNotMatch(text, /Model Bridge/i);
});

test("loop delta scaffold returns before repair ask on separate turn", async () => {
  const { session } = await advanceToColdPacingStop();
  const deltaTurn = await session.post();
  const text = transcriptText(deltaTurn);

  assert.match(text, /Delta/i);
  assert.match(text, /Socratic Repair Drill/i);
  assert.doesNotMatch(text, /Own-Words Repair/i);
  assert.equal(deltaTurn.awaiting?.key, "repair");
  assert.ok(deltaTurn.events.some((event) => event.type === "gap_identified"));
  assert.equal(
    deltaTurn.events.some((event) => event.type === "repair_dialogue_turn"),
    false,
  );
});

test("loop repair ready returns before model_bridge on separate turn", async () => {
  const { session } = await advanceToDeltaPacingStop();
  const repairTurn = await session.post(READY_REPAIR);
  const repairText = transcriptText(repairTurn);

  assert.match(repairText, /Repair Dialogue/i);
  assert.match(repairText, /Bridge readiness: ready/i);
  assert.doesNotMatch(repairText, /Model Bridge/i);
  assert.equal(repairTurn.awaiting?.key, "continue");
  assert.equal(repairTurn.awaiting?.ctaLabel, "Continue");
  assert.equal(repairTurn.awaiting?.ctaText, null);
  assert.ok(repairTurn.events.some((event) => event.type === "repair"));
  assert.equal(
    repairTurn.events.some((event) => event.type === "model_bridge"),
    false,
  );

  const bridgeTurn = await session.post();
  const bridgeText = transcriptText(bridgeTurn);
  assert.match(bridgeText, /Model Bridge/i);
  assert.equal(bridgeTurn.awaiting?.key, "run_gap_drill");
  assert.ok(bridgeTurn.events.some((event) => event.type === "model_bridge"));
});

test("loop substrate seed waits for a separate refinement turn before route generation", async () => {
  const session = makeLoopSessionForSubstrateTest();
  const post = (text) => advanceSession(session, text);

  await advanceSession(session);
  await post("Immune memory");
  await post("Explain how vaccines work");
  const seedTurn = await post("I don't know.");

  assert.equal(seedTurn.status, "awaiting_input");
  assert.equal(seedTurn.phase, "substrate_gate");
  assert.equal(seedTurn.awaiting?.key, "substrate_refinement");
  assert.match(seedTurn.awaiting?.ctaLabel || "", /starting link/i);
  assert.match(seedTurn.awaiting?.ctaText || "", /safe preview/i);
  assert.ok(
    seedTurn.events.some((event) => event.type === "substrate_seed_offered"),
    "expected seed to be offered before awaiting refinement",
  );
  assert.ok(
    !seedTurn.events.some((event) => event.type === "route_generated"),
    "route must not be generated in the seed turn",
  );

  const routeTurn = await post("Vaccines give the body a safe preview.");
  const seedIndex = routeTurn.events.findIndex(
    (event) => event.type === "substrate_seed_offered",
  );
  const routeIndex = routeTurn.events.findIndex(
    (event) => event.type === "route_generated",
  );

  assert.ok(seedIndex >= 0, "expected substrate_seed_offered event");
  assert.ok(routeIndex >= 0, "expected route_generated event after refinement");
  assert.ok(seedIndex < routeIndex);
  assert.equal(routeTurn.awaiting?.key, "cold_attempt");
});

test("loop cold help exhaustion waits before zero-schema delta", async () => {
  const { session } = await advanceToColdAttempt();
  const firstHelp = await session.post("I don't know.");

  assert.equal(firstHelp.awaiting?.key, "cold_attempt");
  assert.ok(firstHelp.events.some((event) => event.type === "cold_help_turn"));
  assert.equal(
    firstHelp.events.some((event) => event.type === "cold_support_exhausted"),
    false,
  );

  const exhausted = await session.post("I still don't know.");
  const exhaustedText = transcriptText(exhausted);

  assert.equal(exhausted.awaiting?.key, "continue");
  assert.equal(exhausted.awaiting?.ctaText, null);
  assert.ok(
    exhausted.events.some((event) => event.type === "cold_support_exhausted"),
  );
  assert.equal(
    exhausted.events.some((event) => event.type === "gap_identified"),
    false,
  );
  assert.doesNotMatch(exhaustedText, /Delta/i);

  const deltaTurn = await session.post();
  assert.equal(deltaTurn.awaiting?.key, "repair");
  assert.ok(deltaTurn.events.some((event) => event.type === "gap_identified"));
});

test("loop API turn advances with prompt metadata", async () => {
  const create = await fetch(`${BASE}/api/session`, { method: "POST" });
  const { sessionId } = await create.json();
  const turn = await fetch(`${BASE}/api/session/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Immune memory" }),
  });
  assert.equal(turn.status, 200);
  const body = await turn.json();
  assert.equal(body.status, "awaiting_input");
  assert.ok(Array.isArray(body.transcript));
  assert.ok(body.transcript.length > 0);
  assert.match(body.awaiting?.label || "", /goal|launch|attempt/i);
});

test("loop API /meta explains current prompt without consuming learner input", async () => {
  const created = await createApiSession();
  assert.equal(created.awaiting?.key, "cmd");

  const metaTurn = await created.post("/meta");
  assert.equal(metaTurn.status, "awaiting_input");
  assert.equal(metaTurn.awaiting?.key, "cmd");
  assert.equal(metaTurn.phase, "idle");
  assert.equal(metaTurn.events.at(-1)?.type, "meta_turn");
  assert.equal(metaTurn.events.at(-1)?.graph_neutral, true);
  assert.equal(metaTurn.events.at(-1)?.score_eligible, false);
  assert.doesNotMatch(transcriptText(metaTurn), /graph-neutral|solidified|kc_id/);

  const conceptTurn = await created.post("Caching");
  assert.equal(conceptTurn.awaiting?.key, "learner_goal");
});

test("loop API marks single concept case complete after spaced redrill", async () => {
  const create = await fetch(`${BASE}/api/session`, { method: "POST" });
  const created = await create.json();
  assert.equal(created.caseComplete, false);
  const { sessionId } = created;
  const post = (text) =>
    fetch(`${BASE}/api/session/${sessionId}/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => r.json());

  await post("Caching");
  await post("Explain why caching makes repeat requests faster");
  await post(
    "Caching stores earlier work so the next matching request can reuse it.",
  );
  await post(
    "Caching improves performance by storing earlier work for faster retrieval.",
  );
  await post();
  await post(
    "On the first request it computes and stores the result, so a later identical request reads from cache instead of recomputing.",
  );
  await post();
  await post("y");
  await post(
    "The stored result lets the cache serve the next matching request without recomputing.",
  );
  const body = await post(
    "The first request computes and stores; that stored result makes the next identical request faster.",
  );

  assert.equal(body.events.at(-1)?.type, "spaced_redrill");
  assert.equal(body.phase, "idle");
  assert.equal(body.status, "awaiting_input");
  assert.equal(body.complete, false);
  assert.equal(body.caseComplete, true);

  const get = await fetch(`${BASE}/api/session/${sessionId}`);
  const saved = await get.json();
  assert.equal(saved.caseComplete, true);
});
