import { handleFeedbackCommand } from "../feedback/handle.mjs";
import { enrichAwaiting } from "./awaiting-cta.mjs";
import { isExitCommand, isFeedbackCommand } from "../seda/prompt-commands.mjs";
import { captureConsole } from "./console-capture.mjs";
import { PROMPT_REQUIRED } from "./errors.mjs";
import { createHttpPrompt } from "./http-prompt.mjs";
import { nextPhase } from "../seda/next-phase.mjs";
import { buildSessionRecord } from "../seda/session-record.mjs";

export async function advanceSession(session, userText) {
  const transcript = [];
  const restore = captureConsole(transcript);

  if (userText != null && String(userText).trim() !== "") {
    const trimmed = String(userText).trim();
    if (isFeedbackCommand(trimmed)) {
      await handleFeedbackCommand(trimmed, session);
      session.transcript.push(...transcript);
      return sessionResponse(session, transcript);
    }
    if (isExitCommand(trimmed)) {
      session.events.push({ type: "idle_exit" });
      session.phase = null;
      session.status = "complete";
      session.awaiting = null;
      console.log("[Idle] Session ended.");
      session.transcript.push(...transcript);
      return sessionResponse(session, transcript);
    }
    session.pendingInput = trimmed;
  }

  try {
    let phase = session.phase ?? "idle";
    while (phase) {
      session.phase = phase;
      const promptCache = new Map();
      const askCounts = new Map();
      const prompt = createHttpPrompt({
        cache: promptCache,
        askCounts,
        session,
      });

      const handler = session.handlers[phase];
      if (!handler) {
        throw new Error(`no handler for phase: ${phase}`);
      }

      try {
        const result = await handler({
          events: session.events,
          derived: session.derived,
          store: session.store,
          bridge: session.bridge,
          prompt,
          options: session.options,
          ctx: session.ctx,
        });
        if (result?.llm_calls?.length) {
          session.llmCalls.push(...result.llm_calls);
        }
        phase = nextPhase(session.events);
      } catch (error) {
        if (error?.code === PROMPT_REQUIRED) {
          session.phase = phase;
          session.status = "awaiting_input";
          session.awaiting = error.promptMeta;
          session.transcript.push(...transcript);
          return sessionResponse(session, transcript);
        }
        throw error;
      }
    }

    session.phase = null;
    session.status = "complete";
    session.awaiting = null;
    session.transcript.push(...transcript);
    session.record = buildSessionRecord({
      events: session.events,
      ctx: session.ctx,
      derived: session.derived,
      evidenceHolds: session.ctx.evidenceHolds,
      llmCalls: session.llmCalls,
      training: await session.store.loadTraining(session.ctx.conceptId),
      agentContracts: session.ctx.agentContracts,
    });
    return sessionResponse(session, transcript);
  } finally {
    restore();
  }
}

export function isCaseComplete(events = []) {
  return events.at(-1)?.type === "spaced_redrill";
}

function lastBridgeLlm(session) {
  const calls = session.llmCalls || [];
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const call = calls[i];
    if (!call?.provider || call.provider === "orchestrator") continue;
    return {
      stage: call.stage,
      provider: call.provider,
      model: call.model,
      latency_ms: call.latency_ms ?? null,
    };
  }
  return null;
}

export function sessionResponse(session, delta) {
  return {
    sessionId: session.id,
    status: session.status,
    phase: session.phase,
    awaiting: enrichAwaiting(session.awaiting, session.ctx),
    transcript: delta ?? [],
    events: session.events,
    llm: lastBridgeLlm(session),
    complete: session.status === "complete",
    caseComplete: isCaseComplete(session.events),
  };
}
