export const LOOP_RUBRIC_VERSION = "loop-v1";

const AXES = [
  "substrate_viability",
  "generation_before_recognition",
  "repair_load",
  "evidence_progression",
  "model_reliability",
  "prompt_adjustment_signal",
];

function score(score, evidence) {
  return { score, evidence };
}

function eventsOf(sessionRecord) {
  return Array.isArray(sessionRecord?.events) ? sessionRecord.events : [];
}

function derivedOf(sessionRecord) {
  return Array.isArray(sessionRecord?.derived) ? sessionRecord.derived : [];
}

function eventTypes(events) {
  return events.map((event) => event?.type).filter(Boolean);
}

function firstIndex(types, type) {
  return types.indexOf(type);
}

function count(types, type) {
  return types.filter((eventType) => eventType === type).length;
}

function before(index, otherIndex) {
  return index >= 0 && (otherIndex < 0 || index < otherIndex);
}

function classification(event) {
  return event?.evaluation?.classification || event?.classification || null;
}

function scoreEligible(event) {
  if (!event) return false;
  if (event.evaluation?.score_eligible === false) return false;
  if (event.score_eligible === false) return false;
  return ["cold_attempt", "spaced_redrill"].includes(event.type);
}

function lastDerivedBadge(derived) {
  const last = derived.at(-1);
  return last?.concept_status?.badge || last?.concept_status?.state || null;
}

function firstRecognitionIndex(types) {
  const recognitionTypes = [
    "gap_identified",
    "repair_dialogue_turn",
    "repair",
    "model_bridge",
    "post_bridge_transfer_check",
  ];
  return recognitionTypes
    .map((type) => firstIndex(types, type))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
}

function scoreSubstrate(events) {
  const types = eventTypes(events);
  const confirmed = firstIndex(types, "substrate_confirmed");
  const route = firstIndex(types, "route_generated");
  const seed = firstIndex(types, "substrate_seed_offered");
  const refinement = firstIndex(types, "substrate_refinement");
  const exhausted = firstIndex(types, "substrate_support_exhausted");

  if (before(confirmed, route)) {
    return score("pass", ["substrate_confirmed occurred before route_generated"]);
  }
  if (confirmed >= 0) {
    return score("watch", ["substrate_confirmed exists, but not before route_generated"]);
  }
  if (seed >= 0 || refinement >= 0 || exhausted >= 0) {
    return score("watch", ["substrate support occurred without confirmed substrate"]);
  }
  return score("fail", ["no substrate support event found"]);
}

function scoreGeneration(events) {
  const types = eventTypes(events);
  const cold = firstIndex(types, "cold_attempt");
  const recognition = firstRecognitionIndex(types);
  const help = firstIndex(types, "cold_help_turn");
  const supportExhausted = firstIndex(types, "cold_support_exhausted");

  if (cold < 0) {
    return score("fail", ["no cold_attempt event found"]);
  }
  if (recognition >= 0 && recognition < cold) {
    return score("fail", ["recognition-like event occurred before cold_attempt"]);
  }
  if (before(help, cold) || before(supportExhausted, cold)) {
    return score("watch", ["cold_attempt followed help/support before generation"]);
  }
  return score("pass", ["cold_attempt occurred before repair or bridge transfer"]);
}

function scoreRepair(events, log) {
  const types = eventTypes(events);
  const repairTurns = count(types, "repair_dialogue_turn");
  const recoveryTurns = count(types, "repair_recovery_turn");
  const abandoned = firstIndex(types, "repair_abandoned") >= 0;
  const hitMaxTurns = Boolean(log?.final?.hit_max_turns);

  if (abandoned || hitMaxTurns) {
    return score("fail", [
      abandoned ? "repair_abandoned occurred" : "persona run hit max turns",
    ]);
  }
  if (repairTurns > 4 || recoveryTurns > 0) {
    return score("watch", [
      `repair_turns=${repairTurns}`,
      `repair_recovery_turns=${recoveryTurns}`,
    ]);
  }
  return score("pass", [`repair_turns=${repairTurns}`]);
}

function scoreEvidence(events, sessionRecord) {
  const derived = derivedOf(sessionRecord);
  const scoreEligibleEvents = events.filter(scoreEligible);
  const spaced = events.filter((event) => event.type === "spaced_redrill").at(-1);
  const spacedClass = classification(spaced);
  const badge = lastDerivedBadge(derived);

  if (spacedClass === "solid") {
    return score("pass", [
      "spaced_redrill classified solid",
      badge ? `latest_derived_badge=${badge}` : "no derived badge recorded",
    ]);
  }
  if (scoreEligibleEvents.length > 0) {
    return score("watch", [
      `score_eligible_events=${scoreEligibleEvents.length}`,
      spacedClass ? `latest_spaced_classification=${spacedClass}` : "no spaced_redrill yet",
    ]);
  }
  return score("fail", ["no score-eligible learner evidence found"]);
}

function scoreModel(events, health, log) {
  const types = eventTypes(events);
  const bridgeErrors = count(types, "bridge_error");
  const fake = Boolean(health?.fake_llm || log?.llm_mode === "fake");
  const provider = health?.llm_provider || null;
  const model = health?.llm_model || null;

  if (bridgeErrors > 0) {
    return score("fail", [`bridge_error_count=${bridgeErrors}`]);
  }
  if (fake) {
    return score("watch", ["fake tutor mode requires caveated interpretation"]);
  }
  if (provider === "openai_compatible") {
    return score("watch", [
      "OpenAI-compatible tutor provider is explicit opt-in",
      model ? `llm_model=${model}` : "llm_model missing",
    ]);
  }
  if (!provider || !model) {
    return score("watch", ["live tutor provider metadata is incomplete"]);
  }
  return score("pass", [`llm_provider=${provider}`, `llm_model=${model}`]);
}

function recommendationFor(axis, result) {
  if (result.score === "pass") return null;
  if (axis === "substrate_viability") return "Inspect substrate gate prompt or cartridge substrate setup.";
  if (axis === "generation_before_recognition") return "Inspect launch copy and substrate confirmation before changing evaluator prompts.";
  if (axis === "repair_load") return "Inspect Delta scaffold and repair-dialogue judge for excess repair load.";
  if (axis === "evidence_progression") return "Inspect transfer check and spaced re-drill prompt before tuning graph evidence rules.";
  if (axis === "model_reliability") return "Fix provider/schema reliability before using this run as pedagogy evidence.";
  if (axis === "prompt_adjustment_signal") return "Collect a complete trace before making a prompt adjustment.";
  return null;
}

function buildPromptAdjustmentAxis(events, axesWithoutPrompt) {
  if (events.length === 0) {
    return score("fail", ["no event trace available"]);
  }
  const nonPassAxes = Object.entries(axesWithoutPrompt)
    .filter(([, result]) => result.score !== "pass")
    .map(([axis]) => axis);
  if (nonPassAxes.length === 0) {
    return score("pass", ["no prompt change indicated by this trace"]);
  }
  return score("pass", [`adjustment_candidates=${nonPassAxes.join(",")}`]);
}

function summarize(axes) {
  return AXES.reduce(
    (acc, axis) => {
      acc[axes[axis].score] += 1;
      return acc;
    },
    { pass: 0, watch: 0, fail: 0 },
  );
}

function overallFrom(summary) {
  if (summary.fail > 0) return "fail";
  if (summary.watch > 0) return "watch";
  return "pass";
}

export function evaluateLoopRubric({ log = {}, health = {}, sessionRecord = null } = {}) {
  const events = eventsOf(sessionRecord);
  const axesWithoutPrompt = {
    substrate_viability: scoreSubstrate(events),
    generation_before_recognition: scoreGeneration(events),
    repair_load: scoreRepair(events, log),
    evidence_progression: scoreEvidence(events, sessionRecord),
    model_reliability: scoreModel(events, health, log),
  };
  const axes = {
    ...axesWithoutPrompt,
    prompt_adjustment_signal: buildPromptAdjustmentAxis(events, axesWithoutPrompt),
  };
  const summary = summarize(axes);
  const recommendations = Object.entries(axes)
    .map(([axis, result]) => recommendationFor(axis, result))
    .filter(Boolean);

  if (recommendations.length === 0) {
    recommendations.push("No prompt change indicated; use this run as a control trace.");
  }

  return {
    rubric_version: LOOP_RUBRIC_VERSION,
    overall: overallFrom(summary),
    axes,
    summary,
    recommendations,
  };
}

export function renderLoopRubricMarkdown(rubric) {
  if (!rubric) return "";
  const rows = AXES.map((axis) => {
    const result = rubric.axes[axis];
    return `| ${axis} | ${result.score} | ${result.evidence.join("; ")} |`;
  });
  return [
    "## Loop rubric",
    "",
    `- Version: ${rubric.rubric_version}`,
    `- Overall: ${rubric.overall}`,
    "",
    "| Axis | Score | Evidence |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "## Prompt adjustment candidates",
    "",
    ...rubric.recommendations.map((item) => `- ${item}`),
    "",
  ].join("\n");
}
