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
}) {
  let phase = initialPhase;
  while (phase) {
    const handler = handlers[phase];
    if (!handler) throw new Error(`no handler for phase: ${phase}`);
    const result = await handler({
      events,
      derived,
      store,
      bridge,
      prompt,
      options,
      ctx,
    });
    if (result?.llm_calls?.length) {
      onLlmCalls?.(result.llm_calls);
    }
    phase = nextPhase(events);
  }
}
