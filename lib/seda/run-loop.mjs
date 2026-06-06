import { nextPhase } from "./next-phase.mjs";

/**
 * Dispatch one handler per phase until nextPhase returns null.
 * Handlers emit events; the controller (nextPhase) owns every phase transition.
 */
export async function runSedaLoop({
  handlers,
  events,
  derived,
  store,
  bridge,
  prompt,
  options,
  ctx,
  initialPhase = "idle",
  onLlmCalls,
  afterHandler,
}) {
  let phase = initialPhase;
  while (phase) {
    const phaseBefore = phase;
    const eventCountBefore = events.length;
    const handler = handlers[phaseBefore];
    if (!handler) throw new Error(`no handler for phase: ${phase}`);
    let result;
    try {
      result = await handler({
        events,
        derived,
        store,
        bridge,
        prompt,
        options,
        ctx,
      });
    } catch (error) {
      // Hosted loop catches PROMPT_REQUIRED outside afterHandler; attach the
      // executing phase so session.phase can resume on the next HTTP turn.
      if (error && typeof error === "object") {
        error.phaseBefore = phaseBefore;
      }
      throw error;
    }
    if (result?.llm_calls?.length) {
      onLlmCalls?.(result.llm_calls);
    }
    phase = nextPhase(events);
    const lastEventType =
      events.length > eventCountBefore ? events.at(-1)?.type : null;
    const hookResult = await afterHandler?.({
      phaseBefore,
      phaseAfter: phase,
      events,
      lastEventType,
    });
    if (hookResult === "stop") break;
  }
}
