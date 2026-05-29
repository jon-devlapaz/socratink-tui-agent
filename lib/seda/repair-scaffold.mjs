function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// Internal template phrasing must never reach the learner (Generation Before
// Recognition): meta phrases describe the answer instead of asking for it.
const META_PHRASE = /\bthe learner\b|\bexplains? that\b|\breconstructs?\b/;

// Tutor/rubric phrasing from LLM scaffolds — not learner before-states.
const INSTRUCTOR_PHRASE =
  /\b(consider|elicit|identify|explain how|describe how|name what|think about|prompt the|ask the learner|learner should|you should consider)\b/i;

const OBSERVABLE_RESULT_TEMPLATE = /^the observable result of\b/i;

function isInstructorFacing(text) {
  return (
    INSTRUCTOR_PHRASE.test(String(text || "")) ||
    META_PHRASE.test(String(text || ""))
  );
}

// The after-state shown in the drill must be a short observable OUTCOME, not the
// mechanism. Mechanism-length, multi-clause, or meta-phrased text is an answer
// reveal that turns generation into recognition.
function afterIsAnswerShaped(after) {
  const t = String(after || "").toLowerCase();
  return (
    countWords(t) > 12 || (t.includes(",") && /\band\b/.test(t)) || META_PHRASE.test(t)
  );
}

function truncateLearnerSnippet(text, maxWords = 14) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function learnerBeforeFrom(coldAttemptText, firstNode) {
  const attempt = String(coldAttemptText || "").trim();
  if (attempt && !isInstructorFacing(attempt)) {
    const snippet = truncateLearnerSnippet(attempt);
    if (snippet) return `you described it as "${snippet}"`;
  }
  const hint = String(firstNode?.blank_hint || "").trim();
  if (hint && !isInstructorFacing(hint)) return hint;
  const label = String(firstNode?.label || "this link").trim();
  return `your current explanation of ${label.toLowerCase()}`;
}

function sanitizeRepairTarget(raw, evaluation, firstNode) {
  const cue =
    String(raw || "").trim() ||
    evaluation?.gap_description ||
    firstNode?.blank_hint ||
    firstNode?.evidence_goal ||
    "";
  if (cue && !isInstructorFacing(cue)) return cue;
  const label = String(firstNode?.label || "the missing link").trim();
  return `Name the causal step that connects the before and after for ${label.toLowerCase()}.`;
}

function sanitizeBefore(raw, coldAttemptText, firstNode) {
  const text = String(raw || "").trim();
  if (text && !isInstructorFacing(text) && !OBSERVABLE_RESULT_TEMPLATE.test(text)) {
    return text;
  }
  return learnerBeforeFrom(coldAttemptText, firstNode);
}

function sanitizeMissingOperation(raw) {
  const text = String(raw || "").trim();
  if (text && !isInstructorFacing(text) && countWords(text) <= 8 && !text.includes(",")) {
    return text;
  }
  return "the causal step that links the before state to the after state";
}

// A concrete but operator-free goal-state (the observable explanandum) scaffolds
// single-link reconstruction better than a contentless phrase.
function neutralAfterFor(firstNode) {
  const goal = String(firstNode?.evidence_goal || "").trim();
  if (
    goal &&
    !afterIsAnswerShaped(goal) &&
    !isInstructorFacing(goal) &&
    countWords(goal) <= 10
  ) {
    return goal;
  }
  const label = String(firstNode?.label || "").trim();
  if (label) return `${label.toLowerCase()} is correctly explained`;
  return "the outcome you're trying to explain";
}

function sanitizeAfter(raw, firstNode) {
  const text = String(raw || "").trim();
  if (
    text &&
    !isInstructorFacing(text) &&
    !afterIsAnswerShaped(text) &&
    !OBSERVABLE_RESULT_TEMPLATE.test(text)
  ) {
    return text;
  }
  return neutralAfterFor(firstNode);
}

/** Learner-facing Socratic question from sanitized boundaries (offline fallback). */
export function rebuildSocraticQuestion({
  before,
  after,
  questionStyle = "direct",
}) {
  const b = String(before || "").trim();
  const a = String(after || "").trim();
  if (questionStyle === "analogical") {
    return `Using your own analogy, what change must happen between ${b} and ${a}?`;
  }
  return `What must happen between ${b} and ${a}?`;
}

function normalizeScaffoldFields(scaffold, evaluation, firstNode, coldAttemptText) {
  const before = sanitizeBefore(scaffold.before, coldAttemptText, firstNode);
  const after = sanitizeAfter(scaffold.after, firstNode);
  const missing_operation = sanitizeMissingOperation(scaffold.missing_operation);
  const repair_target = sanitizeRepairTarget(
    scaffold.repair_target,
    evaluation,
    firstNode,
  );
  const question_style = scaffold.question_style || "direct";
  return {
    ...scaffold,
    repair_target,
    before,
    missing_operation,
    after,
    question_style,
    socratic_question: rebuildSocraticQuestion({
      before,
      after,
      questionStyle: question_style,
    }),
  };
}

function buildTargetedFeedback(evaluation, firstNode, coldAttemptText = "") {
  const fallback = {
    repair_target: sanitizeRepairTarget("", evaluation, firstNode),
    before: learnerBeforeFrom(coldAttemptText, firstNode),
    missing_operation: sanitizeMissingOperation(
      evaluation?.gap_description || "",
    ),
    after: neutralAfterFor(firstNode),
    internal_bloom_lens: "understand",
    question_style: "direct",
  };
  fallback.socratic_question = rebuildSocraticQuestion({
    before: fallback.before,
    after: fallback.after,
    questionStyle: fallback.question_style,
  });
  return fallback;
}

function isAnswerShapedScaffold(scaffold) {
  const missing = String(scaffold?.missing_operation || "").toLowerCase();
  const question = String(scaffold?.socratic_question || "").toLowerCase();
  const actionChainMarkers = [
    "observe",
    "compare",
    "update",
    "refine",
    "choose",
    "inspect",
    "evaluate",
  ];
  const markerCount = actionChainMarkers.filter(
    (marker) => missing.includes(marker) || question.includes(marker),
  ).length;
  return (
    countWords(missing) > 8 ||
    missing.includes(",") ||
    /\band\b/.test(missing) ||
    markerCount >= 3 ||
    afterIsAnswerShaped(scaffold?.after) ||
    META_PHRASE.test(question) ||
    isInstructorFacing(scaffold?.before) ||
    isInstructorFacing(scaffold?.repair_target) ||
    OBSERVABLE_RESULT_TEMPLATE.test(String(scaffold?.after || ""))
  );
}

export function prepareRepairScaffold(
  rawScaffold,
  evaluation,
  firstNode,
  coldAttemptText = "",
) {
  const fallback = buildTargetedFeedback(evaluation, firstNode, coldAttemptText);
  if (!rawScaffold) {
    return { scaffold: fallback, rejections: [] };
  }
  if (isAnswerShapedScaffold(rawScaffold)) {
    return {
      scaffold: normalizeScaffoldFields(fallback, evaluation, firstNode, coldAttemptText),
      rejections: [
        {
          reason: "answer_shaped_scaffold",
          rejected_missing_operation: rawScaffold.missing_operation || "",
          rejected_after: rawScaffold.after || "",
          rejected_before: rawScaffold.before || "",
        },
      ],
    };
  }
  return {
    scaffold: normalizeScaffoldFields(
      {
        ...rawScaffold,
        internal_bloom_lens:
          rawScaffold.internal_bloom_lens || fallback.internal_bloom_lens,
        question_style: rawScaffold.question_style || fallback.question_style,
      },
      evaluation,
      firstNode,
      coldAttemptText,
    ),
    rejections: [],
  };
}

/** Apply a Socratic Repair Drill agent question over sanitized slot boundaries. */
export function applySocraticRepairDrillQuestion(scaffold, socraticQuestion) {
  const question = String(socraticQuestion || "").trim();
  if (!question || isInstructorFacing(question) || META_PHRASE.test(question)) {
    return scaffold;
  }
  return {
    ...scaffold,
    socratic_question: question,
  };
}
