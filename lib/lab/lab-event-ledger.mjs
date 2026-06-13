import { getCanonicalGateMap } from "./canonical-gates.mjs";

const LEDGER_VERSION = "lab-event-ledger-v1";
const EVIDENCE_POLICY = "Only cold_attempt and spaced_redrill are score-eligible evidence candidates.";

function gateIndex() {
  return Object.fromEntries(getCanonicalGateMap().events.map((event) => [event.type, event]));
}

function eventType(item) {
  return typeof item === "string" ? item : item?.type;
}

function compactEvent(item) {
  const type = eventType(item);
  if (!type) return null;
  if (typeof item === "string") return { type };
  const compact = { type };
  for (const key of ["action", "error", "message"]) {
    if (item[key]) compact[key] = String(item[key]);
  }
  for (const key of ["duration_ms", "timeout_ms"]) {
    if (Number.isFinite(Number(item[key]))) compact[key] = Number(item[key]);
  }
  return compact;
}

function normalizeTail(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => compactEvent(item))
    .filter(Boolean);
}

function nextEvents(previousTail, nextTail) {
  const prev = normalizeTail(previousTail);
  const next = normalizeTail(nextTail);
  const isAppendOnly = prev.every((event, index) => next[index]?.type === event.type);
  return isAppendOnly ? next.slice(prev.length) : next;
}

function latestEntry(entries = []) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.type) return entries[index];
  }
  return null;
}

function judgmentFromTimeline(entries = []) {
  const latest = latestEntry(entries);
  const scoreEligible = entries.filter((entry) => entry.score_eligible);
  const graphNeutral = entries.filter((entry) => entry.graph_neutral);
  const failures = entries.filter((entry) => entry.group === "failure");
  const routing = entries.filter((entry) => entry.routing_fact);
  return {
    version: "founder-judgment-v1",
    latest_meaningful_event: latest?.type || null,
    latest_sequence: latest?.seq || null,
    score_eligible_events: scoreEligible.length,
    score_eligible_types: [...new Set(scoreEligible.map((entry) => entry.type))].sort(),
    graph_neutral_events: graphNeutral.length,
    routing_events: routing.length,
    failure_events: failures.length,
    failure_types: [...new Set(failures.map((entry) => entry.type))].sort(),
    evidence_policy: EVIDENCE_POLICY,
  };
}

function eventsOf(sessionRecord) {
  return Array.isArray(sessionRecord?.events) ? sessionRecord.events : [];
}

function eventTypesOf({ log = {}, sessionRecord = null } = {}) {
  const recordEvents = eventsOf(sessionRecord);
  if (recordEvents.length) return recordEvents.map((event) => event?.type).filter(Boolean);
  return Array.isArray(log?.final?.event_types) ? log.final.event_types.filter(Boolean) : [];
}

function bridgeErrorCount(log = {}) {
  return Array.isArray(log?.final?.bridge_errors) ? log.final.bridge_errors.length : 0;
}

function stagePathFromTypes(types) {
  const gates = gateIndex();
  const path = [];
  for (const type of types) {
    const group = gates[type]?.group || "unknown";
    if (path.at(-1) !== group) path.push(group);
  }
  return path;
}

export function summarizeRunSignature({
  index = null,
  outDir = null,
  log = {},
  sessionRecord = null,
  rubric = null,
} = {}) {
  const gates = gateIndex();
  const types = eventTypesOf({ log, sessionRecord });
  const scoreEligible = types.filter((type) => gates[type]?.score_eligible);
  const graphNeutral = types.filter((type) => gates[type]?.graph_neutral);
  const routing = types.filter((type) => gates[type]?.routing_fact);
  const failureTypes = types.filter((type) => gates[type]?.group === "failure");
  const bridgeEventCount = failureTypes.filter((type) => type === "bridge_error").length;
  const nonBridgeFailureCount = failureTypes.length - bridgeEventCount;
  const failureCount = nonBridgeFailureCount + Math.max(bridgeEventCount, bridgeErrorCount(log));
  const stagePath = stagePathFromTypes(types);
  const graphBadge =
    Array.isArray(sessionRecord?.derived) && sessionRecord.derived.length
      ? sessionRecord.derived.at(-1)?.concept_status?.badge ||
        sessionRecord.derived.at(-1)?.concept_status?.state ||
        null
      : null;
  return {
    version: "run-signature-v1",
    index,
    out_dir: outDir,
    event_count: types.length,
    unique_event_types: [...new Set(types)].sort(),
    terminal_event: types.at(-1) || null,
    route_sequence: types.filter((type) => gates[type]?.routing_fact),
    stage_path: stagePath,
    signature: [
      `terminal=${types.at(-1) || "none"}`,
      `evidence=${scoreEligible.length}`,
      `failures=${failureCount}`,
      `graph=${graphBadge || "unknown"}`,
      `overall=${rubric?.overall || "missing"}`,
    ].join("|"),
    score_eligible_events: scoreEligible.length,
    graph_neutral_events: graphNeutral.length,
    routing_events: routing.length,
    failure_events: failureCount,
    graph_badge: graphBadge,
    overall: rubric?.overall || "fail",
    hit_max_turns: Boolean(log?.final?.hit_max_turns),
  };
}

export function compareRunSignatures(signatures = []) {
  const safe = signatures.filter(Boolean);
  const evidenceCounts = safe.map((signature) => signature.score_eligible_events || 0);
  const routingCounts = safe.map((signature) => signature.routing_events || 0);
  const failedRuns = safe.filter((signature) => (signature.failure_events || 0) > 0);
  const evidenceStarvedRuns = safe.filter((signature) => (signature.score_eligible_events || 0) === 0);
  const signatureVariants = [...new Set(safe.map((signature) => signature.signature))];
  return {
    version: "run-comparison-v1",
    run_count: safe.length,
    signature_variants: signatureVariants.length,
    divergent: signatureVariants.length > 1,
    evidence_range: evidenceCounts.length
      ? { min: Math.min(...evidenceCounts), max: Math.max(...evidenceCounts) }
      : { min: 0, max: 0 },
    routing_range: routingCounts.length
      ? { min: Math.min(...routingCounts), max: Math.max(...routingCounts) }
      : { min: 0, max: 0 },
    failure_runs: failedRuns.map((signature) => signature.index),
    evidence_starved_runs: evidenceStarvedRuns.map((signature) => signature.index),
    terminal_events: [...new Set(safe.map((signature) => signature.terminal_event || "none"))].sort(),
  };
}

export function emptyLabEventLedger() {
  return {
    version: LEDGER_VERSION,
    nextSeq: 1,
    tailsByRun: {},
    timeline: [],
  };
}

export function appendLabProgressToLedger(ledger = emptyLabEventLedger(), progress = {}) {
  const run = Number.isFinite(Number(progress.activeRun)) ? Number(progress.activeRun) : null;
  const eventsTail = normalizeTail(progress.eventsTail || progress.events_tail);
  if (!run || eventsTail.length === 0) return ledger;

  const gates = gateIndex();
  const previousTail = ledger.tailsByRun?.[run] || [];
  const appended = nextEvents(previousTail, eventsTail);
  if (appended.length === 0) {
    return {
      ...ledger,
      tailsByRun: { ...(ledger.tailsByRun || {}), [run]: eventsTail },
    };
  }

  let seq = Number(ledger.nextSeq || 1);
  const entries = appended.map((event) => {
    const type = event.type;
    const gate = gates[type] || {};
    return {
      seq: seq++,
      run,
      turn: progress.turn ?? null,
      phase: progress.phase || null,
      stage: progress.stage || null,
      state: progress.state || null,
      type,
      group: gate.group || "unknown",
      role: gate.graph_role || "unknown",
      graph_neutral: Boolean(gate.graph_neutral),
      score_eligible: Boolean(gate.score_eligible),
      routing_fact: Boolean(gate.routing_fact),
      replay_relevant: Boolean(gate.replay_relevant),
      next_phase: gate.next_phase || "unknown",
      authority: gate.authority || "unknown",
      ...(event.action ? { action: event.action } : {}),
      ...(event.error ? { error: event.error } : {}),
      ...(event.message ? { message: event.message } : {}),
      ...(event.duration_ms != null ? { duration_ms: event.duration_ms } : {}),
      ...(event.timeout_ms != null ? { timeout_ms: event.timeout_ms } : {}),
    };
  });

  return {
    version: LEDGER_VERSION,
    nextSeq: seq,
    tailsByRun: { ...(ledger.tailsByRun || {}), [run]: eventsTail },
    timeline: [...(ledger.timeline || []), ...entries],
  };
}

export function projectLabBatchSnapshot(snapshot = {}) {
  const ledger = snapshot.eventLedger || emptyLabEventLedger();
  const publicSnapshot = { ...snapshot };
  delete publicSnapshot.eventLedger;
  const timeline = Array.isArray(snapshot.timeline)
    ? snapshot.timeline
    : Array.isArray(ledger.timeline)
      ? ledger.timeline
      : [];
  const judgment = judgmentFromTimeline(timeline);
  const latestMeaningfulEvent =
    snapshot.latestMeaningfulEvent ||
    judgment.latest_meaningful_event ||
    snapshot.monitor?.latestEvent ||
    null;
  const monitor = {
    ...(snapshot.monitor || {}),
    latestEvent: snapshot.monitor?.latestEvent || latestMeaningfulEvent,
  };
  return {
    ...publicSnapshot,
    monitor,
    latestMeaningfulEvent,
    timeline,
    judgment,
    comparison: snapshot.comparison || snapshot.report?.comparison || null,
  };
}

export const LAB_EVENT_LEDGER_VERSION = LEDGER_VERSION;
