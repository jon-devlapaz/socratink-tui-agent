#!/usr/bin/env node
/**
 * Prove loop server + bridge route use live Gemini (not fake templates).
 *
 *   ./socratink-loop-server   # other terminal
 *   node scripts/verify-loop-gemini.mjs
 */

const base = (process.env.SOCRATINK_LOOP_BASE_URL || "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);

async function main() {
  const health = await fetch(`${base}/health`).then((r) => r.json());
  console.log("health:", health);
  if (health.fake_llm) {
    console.error(
      "\nFAIL: server is in fake mode. Restart:\n  unset SOCRATINK_TUI_FAKE_LLM\n  ./socratink-loop-server\n",
    );
    process.exit(1);
  }
  if (!health.gemini_configured) {
    console.error("\nFAIL: GEMINI_API_KEY not loaded on server.\n");
    process.exit(1);
  }

  const session = await fetch(`${base}/api/session`, { method: "POST" }).then((r) =>
    r.json(),
  );
  const sid = session.sessionId;
  const post = (text) =>
    fetch(`${base}/api/session/${sid}/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => r.json());

  await post("AI");
  await post("Explain how models can sound confident but still be wrong");
  const afterLaunch = await post(
    "LLMs predict tokens from patterns; they can sound right without understanding.",
  );
  const routeTurn = await post("Patterns in training data steer the next token.");
  const llm = routeTurn.llm || afterLaunch.llm;
  console.log("\nlast bridge llm:", llm);
  const transcript = (routeTurn.transcript || [])
    .map((line) => line.text)
    .join("\n");
  const routeLine = transcript.match(/\[Route LLM\][^\n]+/);
  if (routeLine) console.log(routeLine[0]);

  if (!llm || llm.provider === "fake") {
    console.error("\nFAIL: route still used fake provider.\n");
    process.exit(1);
  }
  if (!llm.latency_ms || llm.latency_ms < 50) {
    console.warn("\nWARN: latency looks instant — double-check provider.\n");
  }
  console.log("\nOK: live Gemini path confirmed.\n");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
