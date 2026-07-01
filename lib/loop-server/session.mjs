import { handleFeedbackCommand } from "../feedback/handle.mjs";
import { enrichAwaiting } from "./awaiting-cta.mjs";
import { isExitCommand, isFeedbackCommand } from "../seda/prompt-commands.mjs";
import { captureConsole } from "./console-capture.mjs";
import { PROMPT_REQUIRED } from "./errors.mjs";
import { createHttpPrompt } from "./http-prompt.mjs";
import { filterLearnerTranscript } from "./learner-transcript.mjs";
import { runSedaLoop } from "../seda/run-loop.mjs";
import { eventBuilders } from "../seda/event-facts.mjs";
import {
  buildSessionRecord,
  isTerminalRepairAbandon,
} from "../seda/session-record.mjs";
import {
  getHostedLoopPacingStop,
  isHostedLoopPacingEnabled,
} from "./pacing-stops.mjs";

export async function materializeSessionRecord(session) {
  if (session.record || !isCaseComplete(session.events)) return;
  session.record = buildSessionRecord({
    events: session.events,
    ctx: session.ctx,
    derived: session.derived,
    evidenceHolds: session.ctx.evidenceHolds,
    llmCalls: session.llmCalls,
    training: await session.store.loadTraining(session.ctx.conceptId),
    agentContracts: session.ctx.agentContracts,
  });
}

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
      session.events.push(eventBuilders.idleExit());
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
    let stoppedForPacing = false;
    session.phase = session.phase ?? "idle";
    const prompt = createHttpPrompt({
      cache: new Map(),
      askCounts: new Map(),
      session,
    });

    try {
      await runSedaLoop({
        handlers: session.handlers,
        events: session.events,
        derived: session.derived,
        store: session.store,
        bridge: session.bridge,
        prompt,
        options: session.options,
        ctx: session.ctx,
        initialPhase: session.phase,
        onLlmCalls: (calls) => session.llmCalls.push(...calls),
        afterHandler: ({ phaseBefore, phaseAfter, events, lastEventType }) => {
          session.phase = phaseAfter;
          if (isHostedLoopPacingEnabled(session.options)) {
            const stop = getHostedLoopPacingStop({
              events,
              phaseBefore,
              phaseAfter,
              lastEventType,
            });
            if (stop) {
              session.status = "awaiting_input";
              session.awaiting = stop.promptMeta;
              stoppedForPacing = true;
              return "stop";
            }
          }
          return "continue";
        },
      });
    } catch (error) {
      if (error?.code === PROMPT_REQUIRED) {
        session.phase = error.phaseBefore ?? session.phase;
        session.status = "awaiting_input";
        session.awaiting = error.promptMeta;
        session.transcript.push(...transcript);
        await materializeSessionRecord(session);
        return sessionResponse(session, transcript);
      }
      throw error;
    }

    if (stoppedForPacing) {
      session.transcript.push(...transcript);
      await materializeSessionRecord(session);
      return sessionResponse(session, transcript);
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
  const last = events.at(-1)?.type;
  if (["spaced_redrill", "evidence_hold_recorded"].includes(last)) {
    return true;
  }
  return isTerminalRepairAbandon(events);
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
  const transcript = delta ?? [];
  const awaiting = enrichAwaiting(session.awaiting, session.ctx);
  return {
    sessionId: session.id,
    status: session.status,
    phase: session.phase,
    awaiting,
    transcript,
    learnerTranscript: filterLearnerTranscript(transcript, awaiting?.ctaText),
    events: session.events,
    llm: lastBridgeLlm(session),
    llm_active: session.llm || null,
    bridge_diagnostics_dir: session.bridgeDiagnosticsDir || null,
    complete: session.status === "complete",
    caseComplete: isCaseComplete(session.events),
    record: session.record ?? null,
  };
}
