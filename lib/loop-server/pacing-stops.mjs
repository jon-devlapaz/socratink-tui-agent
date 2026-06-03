/**
 * Hosted /loop pacing is explicit via loopUiPacing: "one_beat". Existing
 * loopUi-only tests keep the same behavior so older fixtures do not silently
 * fall back to terminal-style batching.
 *
 * These stops are transport pauses only: they do not append SEDA events, mutate
 * prior events, or change nextPhase routing.
 */

const CONTINUE_PROMPT = Object.freeze({
  key: "continue",
  label: "Continue: ",
});

const STOPS = Object.freeze({
  route_generated: {
    phaseAfter: "cold_attempt",
    promptMeta: { key: "cold_attempt", label: "Cold attempt: " },
  },
  cold_attempt: {
    phaseAfter: "delta",
    promptMeta: CONTINUE_PROMPT,
  },
  cold_support_exhausted: {
    phaseAfter: "delta",
    promptMeta: CONTINUE_PROMPT,
  },
  gap_identified: {
    phaseAfter: "repair_dialogue",
    promptMeta: { key: "repair", label: "Repair: " },
  },
  repair: {
    phaseAfter: "model_bridge",
    promptMeta: CONTINUE_PROMPT,
  },
  model_bridge: {
    phaseAfter: "post_bridge_transfer",
    promptMeta: {
      key: "run_gap_drill",
      label: "Post-bridge transfer check? y/N: ",
      fallback: "n",
    },
  },
});

export function isHostedLoopPacingEnabled(options = {}) {
  if (options.loopUiPacing != null) {
    return options.loopUiPacing === "one_beat";
  }
  return options.loopUi === true;
}

export function getHostedLoopPacingStop(args = {}) {
  const { events = [], phaseAfter, lastEventType } = args;
  const hasExplicitLastEvent = Object.hasOwn(args, "lastEventType");
  const observedLastEventType = hasExplicitLastEvent
    ? lastEventType
    : events.at(-1)?.type;
  if (!observedLastEventType) return null;
  const last = events.at(-1);
  if (last?.type !== observedLastEventType) return null;

  const stop = STOPS[observedLastEventType];
  if (!stop || stop.phaseAfter !== phaseAfter) return null;

  return {
    lastEventType: observedLastEventType,
    phaseAfter,
    promptMeta: { ...stop.promptMeta },
  };
}

export function shouldStopHostedLoop(args = {}) {
  return getHostedLoopPacingStop(args) != null;
}
