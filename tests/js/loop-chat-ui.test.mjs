import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BASE = process.env.SOCRATINK_LOOP_BASE_URL || "http://127.0.0.1:8787";

test("loop static assets use terminal chrome and phase styling", () => {
  const html = readFileSync(path.join(ROOT, "public/loop/index.html"), "utf8");
  const js = readFileSync(path.join(ROOT, "public/loop/loop.js"), "utf8");
  const css = readFileSync(path.join(ROOT, "public/loop/loop.css"), "utf8");
  assert.doesNotMatch(html, /id="status"/);
  assert.match(html, /id="phase-pill"/);
  assert.match(html, /id="llm-pill"/);
  assert.match(js, /refreshHealth/);
  assert.match(js, /appendLlmReceipt/);
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
  assert.match(js, /version_tracker/);
  assert.match(js, /tracker\.logic_owner/);
  assert.match(css, /\.version-tracker/);
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
  assert.match(helpLine.text, /have not seen the map/i);
  assert.doesNotMatch(helpLine.text, /Learner goal:/i);
  assert.match(body.awaiting?.label || "", /Launch attempt/i);
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
  await post("Caching stores earlier work so the next matching request can reuse it.");
  await post(
    "On the first request it computes and stores the result, so a later identical request reads from cache instead of recomputing.",
  );
  const body = await post(
    "On the first request it computes and stores the result, so a later identical request reads from cache instead of recomputing.",
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
