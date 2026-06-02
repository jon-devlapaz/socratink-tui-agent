import { deriveProductLoopBranch } from "./session-record.mjs";

export function analyzeSession(session) {
  const events = session.events || [];
  const has = (type) => events.some((event) => event.type === type);
  const dialogueTurns = events.filter((event) => event.type === "repair_dialogue_turn");
  const lastDialogueTurn = dialogueTurns.at(-1);
  const lastRecoveryClosed = events.findLast(
    (event) => event.type === "repair_recovery_closed",
  );
  const reachedModelBridge = has("model_bridge");
  const terminalAbandon = deriveProductLoopBranch(events).bridge_gate !== undefined;

  return {
    terminalAbandon,
    repairAbandoned: has("repair_abandoned"),
    recoveryStarted: has("repair_recovery_started"),
    recoveryRecovered: lastRecoveryClosed?.outcome === "recovered",
    hasRepairDialogue: dialogueTurns.length > 0,
    bridgeReadyWithinConcept:
      dialogueTurns.length > 0 &&
      lastDialogueTurn?.bridge_ready === true &&
      reachedModelBridge,
    falseReady:
      dialogueTurns.some((turn) => turn.bridge_ready) && !reachedModelBridge,
    statusReversal:
      Array.isArray(session.evidence_holds) && session.evidence_holds.length > 0,
  };
}

export function computeRecoveryTelemetry(sessions) {
  const total = sessions.length;
  if (!total) {
    return {
      repair_abandoned_rate: 0,
      recovery_enter_rate: 0,
      recovery_success_rate: 0,
      bridge_ready_within_same_concept_rate: 0,
      status_reversal_rate: 0,
      false_ready_rate: 0,
    };
  }

  const stats = sessions.map((session) => analyzeSession(session));
  const repairAbandonedCount = stats.filter((s) => s.repairAbandoned).length;
  const recoveryStartedCount = stats.filter((s) => s.recoveryStarted).length;
  const dialogueCount = stats.filter((s) => s.hasRepairDialogue).length;

  return {
    repair_abandoned_rate: roundRate(
      stats.filter((s) => s.terminalAbandon).length / total,
    ),
    recovery_enter_rate: roundRate(
      repairAbandonedCount
        ? recoveryStartedCount / repairAbandonedCount
        : 0,
    ),
    recovery_success_rate: roundRate(
      recoveryStartedCount
        ? stats.filter((s) => s.recoveryRecovered).length / recoveryStartedCount
        : 0,
    ),
    bridge_ready_within_same_concept_rate: roundRate(
      dialogueCount
        ? stats.filter((s) => s.bridgeReadyWithinConcept).length / dialogueCount
        : 0,
    ),
    status_reversal_rate: roundRate(
      stats.filter((s) => s.statusReversal).length / total,
    ),
    false_ready_rate: roundRate(
      dialogueCount ? stats.filter((s) => s.falseReady).length / dialogueCount : 0,
    ),
  };
}

export function buildDashboardPayload({ cases, sessions }) {
  const eventSummary = computeEventSummary(sessions);
  const traceability = computeTraceability(cases, sessions);
  const sessionByLog = indexSessionsByCaseLog(cases, sessions);
  const runs = cases.map((caseRecord) =>
    buildRunLog(caseRecord, sessionByLog.get(caseRecord.session_log) ?? {}),
  );
  const learningLoop = computeLearningLoopSummary(runs);
  const improvementQueue = buildImprovementQueue(runs, learningLoop);
  return {
    title: "Socratink Learning Loop Dashboard",
    version_tracker: {
      dashboard_version: "learning-loop-dashboard-v1",
      payload_version: "dashboard-payload-v1",
      logic_owner: "lib/seda/dashboard-metrics.mjs",
      source_artifacts: [
        "learning_cases/cases.jsonl",
        "learning_cases/traces/**/session.json",
      ],
    },
    case_summary: {
      total: cases.length,
      regression: cases.filter((c) => c.case_type === "regression").length,
      golden: cases.filter((c) => c.case_type === "golden").length,
      research: cases.filter((c) => c.case_type === "research").length,
    },
    recovery_telemetry: computeRecoveryTelemetry(sessions),
    learning_loop: learningLoop,
    improvement_queue: improvementQueue,
    runs,
    systems_view: {
      source_of_truth: {
        routing: "events[] -> nextPhase(events)",
        graph_truth: "lib/canon/training-derive.js",
        dashboard_role: "read-only observability",
        dashboard_constraint: "must not mutate events, routing, or evidence state",
      },
      harness_health: {
        promoted_cases: cases.length,
        sessions_analyzed: sessions.length,
        terminal_sessions: sessions.filter((session) =>
          (session.events || []).some((event) => event.type === "idle_exit"),
        ).length,
        model_bridge_sessions: sessions.filter((session) =>
          (session.events || []).some((event) => event.type === "model_bridge"),
        ).length,
      },
      graph_honesty: {
        graph_neutral_events: eventSummary.graphNeutral,
        evidence_candidate_events: eventSummary.evidenceCandidates,
        repair_dialogue_turns: eventSummary.byType.repair_dialogue_turn || 0,
        post_bridge_transfer_checks:
          eventSummary.byType.post_bridge_transfer_check || 0,
        solidified_derivations: eventSummary.solidifiedDerivations,
        evidence_hold_sessions: sessions.filter(
          (session) =>
            Array.isArray(session.evidence_holds) &&
            session.evidence_holds.length > 0,
        ).length,
      },
      traceability,
      validation_commands: [
        {
          label: "Canon drift",
          command: "./scripts/check-canon-drift.sh",
          tier: "component verification",
        },
        {
          label: "Prompt evals",
          command:
            ".venv/bin/pytest tests/test_prompt_eval_repair_dialogue.py tests/test_prompt_eval_evaluator.py tests/test_repair_dialogue_contract.py tests/test_prompt_template.py -q",
          tier: "LLM seam verification",
        },
        {
          label: "Self-contained JS",
          command:
            "find tests/js -name '*.test.mjs' ! -name 'loop-chat-ui.test.mjs' -print | sort | xargs node --test",
          tier: "router and browser-independent verification",
        },
        {
          label: "Server-backed loop UI",
          command:
            "SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 node --test tests/js/loop-chat-ui.test.mjs",
          tier: "hosted-loop integration verification",
        },
        {
          label: "Harness replay",
          command: "./socratink-harness replay",
          tier: "promoted-case regression proof",
        },
      ],
    },
  };
}

function roundRate(value) {
  return Math.round(value * 1000) / 1000;
}

/** Pair sessions to cases by session_log order, not array index (callers may omit sessions). */
function indexSessionsByCaseLog(cases, sessions) {
  const sessionByLog = new Map();
  let sessionIndex = 0;
  for (const caseRecord of cases) {
    if (!caseRecord.session_log) continue;
    if (sessionIndex >= sessions.length) break;
    sessionByLog.set(caseRecord.session_log, sessions[sessionIndex]);
    sessionIndex += 1;
  }
  return sessionByLog;
}

const GRAPH_NEUTRAL_TYPES = new Set([
  "cold_help_turn",
  "cold_support_exhausted",
  "gap_identified",
  "repair_dialogue_turn",
  "repair_abandoned",
  "repair",
  "model_bridge",
  "post_bridge_transfer_check",
  "repair_state_bucketed",
  "repair_cap_selected",
  "repair_recovery_started",
  "repair_recovery_turn",
  "repair_recovery_closed",
]);

const EVIDENCE_CANDIDATE_TYPES = new Set([
  "cold_attempt",
  "spaced_redrill",
  "strong_cold_path",
]);

function computeEventSummary(sessions) {
  const byType = {};
  let graphNeutral = 0;
  let evidenceCandidates = 0;
  let solidifiedDerivations = 0;

  for (const session of sessions) {
    for (const event of session.events || []) {
      byType[event.type] = (byType[event.type] || 0) + 1;
      if (GRAPH_NEUTRAL_TYPES.has(event.type)) graphNeutral += 1;
      if (EVIDENCE_CANDIDATE_TYPES.has(event.type)) evidenceCandidates += 1;
    }

    const nodes = Object.values(lastDerivedNodes(session));
    for (const node of nodes) {
      if (node?.state === "solidified") solidifiedDerivations += 1;
    }
  }

  return {
    byType,
    graphNeutral,
    evidenceCandidates,
    solidifiedDerivations,
  };
}

function computeTraceability(cases, sessions) {
  const casesWithInvariants = cases.filter((caseRecord) =>
    Boolean(caseRecord.expected_invariants),
  ).length;
  const casesWithSessionLogs = cases.filter((caseRecord) =>
    Boolean(caseRecord.session_log),
  ).length;
  const eventTypesCovered = new Set();
  for (const session of sessions) {
    for (const event of session.events || []) {
      eventTypesCovered.add(event.type);
    }
  }

  return {
    cases_with_expected_invariants: casesWithInvariants,
    cases_with_session_logs: casesWithSessionLogs,
    event_types_covered: eventTypesCovered.size,
    verification_artifacts: [
      "learning_cases/cases.jsonl",
      "learning_cases/traces/**/session.json",
      "HARNESS.md",
      "HARNESS-TRACEABILITY.md",
      "tests/js/dashboard.test.mjs",
      "tests/test_workspace_smoke.py",
    ],
    residual_risk:
      "Dashboard shows configured evidence paths and promoted trace facts; it does not prove commands are currently green unless those commands are run.",
  };
}

const PIPELINE_STAGES = [
  {
    key: "orient",
    label: "Orient",
    events: ["idle_new_concept", "launch_attempt", "route_generated"],
  },
  {
    key: "cold",
    label: "Cold attempt",
    events: ["cold_help_turn", "cold_support_exhausted", "cold_attempt"],
  },
  {
    key: "gap",
    label: "Gap",
    events: ["gap_identified", "study_reveal"],
  },
  {
    key: "repair",
    label: "Own-words repair",
    events: [
      "repair_dialogue_turn",
      "repair_recovery_started",
      "repair_recovery_turn",
      "repair_recovery_closed",
      "repair",
      "repair_abandoned",
    ],
  },
  {
    key: "bridge",
    label: "Model bridge",
    events: [
      "model_bridge",
      "post_bridge_transfer_check",
      "post_bridge_transfer_skipped",
    ],
  },
  {
    key: "spacing",
    label: "Spacing",
    events: ["strong_cold_path", "spacing_advanced", "spaced_redrill"],
  },
  {
    key: "done",
    label: "Exit",
    events: ["idle_exit"],
  },
];

function buildRunLog(caseRecord, session = {}) {
  const events = session.events || [];
  const eventTypes = events.map((event) => event.type);
  const count = (type) => eventTypes.filter((eventType) => eventType === type).length;
  const has = (type) => eventTypes.includes(type);
  const coldAttempt = events.find((event) => event.type === "cold_attempt");
  const spacedAttempt = [...events]
    .reverse()
    .find((event) => event.type === "spaced_redrill");
  const dialogueTurns = events.filter((event) => event.type === "repair_dialogue_turn");
  const finalState =
    caseRecord.expected_invariants?.final_node_state ||
    lastDerivedConceptBadge(session) ||
    "unknown";
  const friction = buildFrictionTags({ session, count, has, dialogueTurns });
  const stagePath = PIPELINE_STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    reached: stage.events.some((eventType) => has(eventType)),
  }));

  return {
    id: caseRecord.case_id,
    type: caseRecord.case_type,
    source: caseRecord.case_source,
    concept: caseRecord.concept || session.concept || "Unknown concept",
    product_question: caseRecord.product_question,
    protected_failure: caseRecord.observed_failure,
    expected_invariant:
      caseRecord.expected_invariant ||
      summarizeInvariant(caseRecord.expected_invariants),
    event_count: events.length,
    stage_path: stagePath,
    ...summarizeOutcome({ has, finalState }),
    final_state: finalState,
    cold_classification:
      coldAttempt?.evaluation?.classification ||
      caseRecord.expected_invariants?.cold_evaluator_classification ||
      "not scored",
    spaced_classification:
      spacedAttempt?.evaluation?.classification ||
      caseRecord.expected_invariants?.spaced_evaluator_classification ||
      "not reached",
    repair_dialogue_turns: dialogueTurns.length,
    bridge_ready_turns: dialogueTurns.filter((turn) => turn.bridge_ready).length,
    cold_help_turns: count("cold_help_turn"),
    recovery_turns: count("repair_recovery_turn"),
    evidence_holds: Array.isArray(session.evidence_holds)
      ? session.evidence_holds.length
      : 0,
    friction,
    next_improvement: chooseRunImprovement(friction),
  };
}

function buildFrictionTags({ session, count, has, dialogueTurns }) {
  const tags = [];
  if (count("cold_help_turn") > 0) tags.push("cold-start support");
  if (dialogueTurns.length >= 4) tags.push("repair load");
  if (has("repair_recovery_started")) tags.push("uncertainty recovery");
  if (has("repair_abandoned")) tags.push("abandoned before bridge");
  if (has("post_bridge_transfer_skipped")) tags.push("transfer check skipped");
  if (Array.isArray(session.evidence_holds) && session.evidence_holds.length > 0) {
    tags.push("solid answer held at primed");
  }
  if (!tags.length) tags.push("clean path");
  return tags;
}

function summarizeOutcome({ has, finalState }) {
  if (has("repair_abandoned")) {
    return {
      outcome: "Stopped before model bridge",
      outcome_key: "stopped_before_bridge",
    };
  }
  if (has("strong_cold_path")) {
    return { outcome: "Strong cold path", outcome_key: "strong_cold_path" };
  }
  if (has("model_bridge")) {
    return {
      outcome: `Bridge reached; graph ${finalState}`,
      outcome_key: "bridge_reached",
    };
  }
  return {
    outcome: `Exited; graph ${finalState}`,
    outcome_key: "exited",
  };
}

function chooseRunImprovement(friction) {
  if (friction.includes("abandoned before bridge")) {
    return "Reduce repair uncertainty before the learner gives up.";
  }
  if (friction.includes("repair load")) {
    return "Make own-words repair feel lighter without revealing the answer.";
  }
  if (friction.includes("cold-start support")) {
    return "Improve the first prompt for learners who do not know how to begin.";
  }
  if (friction.includes("solid answer held at primed")) {
    return "Explain why solid performance still needs spaced reconstruction.";
  }
  if (friction.includes("transfer check skipped")) {
    return "Clarify when post-bridge transfer is required versus skipped.";
  }
  return "Preserve this path as a regression-protected example.";
}

function computeLearningLoopSummary(runs) {
  const total = runs.length || 1;
  const countRuns = (predicate) => runs.filter(predicate).length;

  return {
    pipeline: PIPELINE_STAGES.map((stage) => {
      const reached = countRuns((run) =>
        run.stage_path.some((item) => item.key === stage.key && item.reached),
      );
      return {
        label: stage.label,
        reached,
        rate: roundRate(reached / total),
      };
    }),
    outcomes: {
      bridge_reached: countRuns((run) => run.outcome.includes("Bridge reached")),
      stopped_before_bridge: countRuns((run) =>
        run.outcome.includes("Stopped before model bridge"),
      ),
      strong_cold_path: countRuns((run) => run.outcome === "Strong cold path"),
      evidence_holds: countRuns((run) => run.evidence_holds > 0),
    },
    friction_counts: countFriction(runs),
  };
}

function countFriction(runs) {
  const counts = {};
  for (const run of runs) {
    for (const tag of run.friction) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildImprovementQueue(runs, learningLoop) {
  const queue = [];
  const stopped = learningLoop.outcomes.stopped_before_bridge;
  const repairLoad = frictionCount(learningLoop, "repair load");
  const coldSupport = frictionCount(learningLoop, "cold-start support");
  const evidenceHolds = learningLoop.outcomes.evidence_holds;
  const transferSkipped = frictionCount(learningLoop, "transfer check skipped");

  if (stopped > 0 || repairLoad > 0) {
    queue.push({
      priority: "high",
      focus: "Own-words repair",
      why: `${stopped} runs stopped before model bridge; ${repairLoad} runs had heavy repair dialogue.`,
      next_step:
        "Review repair prompts and recovery ladder for lower cognitive load without answer leakage.",
    });
  }
  if (coldSupport > 0) {
    queue.push({
      priority: "medium",
      focus: "Cold start",
      why: `${coldSupport} runs needed help before a scored cold attempt.`,
      next_step:
        "Improve the launch question and help copy so unsure learners can still generate a first attempt.",
    });
  }
  if (evidenceHolds > 0) {
    queue.push({
      priority: "medium",
      focus: "Graph truth explanation",
      why: `${evidenceHolds} runs had a solid evaluator result held below solidified by spacing rules.`,
      next_step:
        "Make the difference between a good answer now and durable graph truth visible in plain language.",
    });
  }
  if (transferSkipped > 0) {
    queue.push({
      priority: "low",
      focus: "Transfer check policy",
      why: `${transferSkipped} runs skipped post-bridge transfer.`,
      next_step:
        "Decide whether skipped transfer should be framed as intentional fast path or missing pressure check.",
    });
  }

  return queue.length
    ? queue
    : [
        {
          priority: "low",
          focus: "Preserve current loop",
          why: "Promoted runs do not show concentrated pedagogical friction.",
          next_step: "Add research cases from fresh learner dogfood before changing UX.",
        },
      ];
}

function frictionCount(learningLoop, label) {
  return (
    learningLoop.friction_counts.find((item) => item.label === label)?.count || 0
  );
}

function summarizeInvariant(invariants = {}) {
  if (invariants.final_node_state) {
    return `Final graph state must be ${invariants.final_node_state}.`;
  }
  if (Array.isArray(invariants.event_order)) {
    return `Event order protects ${invariants.event_order.length} loop steps.`;
  }
  return "Promoted trace invariant.";
}

function lastDerivedConceptBadge(session) {
  const derived = Array.isArray(session.derived) ? session.derived.at(-1) : null;
  return derived?.concept_status?.badge;
}

function lastDerivedNodes(session) {
  if (Array.isArray(session?.derived)) {
    return session.derived.at(-1)?.nodes || {};
  }
  return session?.derived?.node_records || session?.node_records || {};
}
