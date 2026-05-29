function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// Internal template phrasing must never reach the learner (Generation Before
// Recognition): meta phrases describe the answer instead of asking for it.
const META_PHRASE = /\bthe learner\b|\bexplains? that\b|\breconstructs?\b/;

const META_BEFORE_AFTER =
  /\b(before state|after state|before-state|after-state|links the before|links before)\b/i;

// Tutor/rubric phrasing from LLM scaffolds — not learner before-states.
const INSTRUCTOR_PHRASE =
  /\b(consider|elicit|identify|explain how|describe how|name what|think about|prompt the|ask the learner|learner should|you should consider)\b/i;

const OBSERVABLE_RESULT_TEMPLATE = /^the observable result of\b/i;

const OFF_DOMAIN_TOKENS =
  /\b(ball|rolling|chef|recipe|engine|piston|football|basketball|car\b)\b/i;

function isInstructorFacing(text) {
  return (
    INSTRUCTOR_PHRASE.test(String(text || "")) ||
    META_PHRASE.test(String(text || ""))
  );
}

function isMetaBeforeAfter(text) {
  return META_BEFORE_AFTER.test(String(text || ""));
}

function topicTokens(firstNode) {
  const text = `${firstNode?.label || ""} ${firstNode?.mechanism || ""} ${firstNode?.evidence_goal || ""}`.toLowerCase();
  return text.split(/\W+/).filter((token) => token.length >= 4);
}

function isOffDomainQuestion(question, firstNode) {
  const q = String(question || "").toLowerCase();
  if (!OFF_DOMAIN_TOKENS.test(q)) return false;
  const tokens = topicTokens(firstNode);
  return !tokens.some((token) => q.includes(token));
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
  if (cue && !isInstructorFacing(cue) && !isMetaBeforeAfter(cue)) return cue;
  const label = String(firstNode?.label || "the missing link").trim();
  return `Name what has to happen for ${label.toLowerCase()} to hold.`;
}

function sanitizeBefore(raw, coldAttemptText, firstNode) {
  const text = String(raw || "").trim();
  if (
    text &&
    !isInstructorFacing(text) &&
    !OBSERVABLE_RESULT_TEMPLATE.test(text) &&
    !isMetaBeforeAfter(text)
  ) {
    return text;
  }
  return learnerBeforeFrom(coldAttemptText, firstNode);
}

function hingeFromGapDescription(gapDescription, firstNode) {
  const gap = String(gapDescription || "").trim();
  if (
    gap &&
    !isInstructorFacing(gap) &&
    !isMetaBeforeAfter(gap) &&
    countWords(gap) <= 8 &&
    !gap.includes(",")
  ) {
    return gap;
  }
  const label = String(firstNode?.label || "this process").trim().toLowerCase();
  return `what changes during ${label}`;
}

function sanitizeHingeFocus(raw, firstNode, gapDescription = "") {
  const text = String(raw || "").trim();
  if (
    text &&
    !isInstructorFacing(text) &&
    !isMetaBeforeAfter(text) &&
    countWords(text) <= 8 &&
    !text.includes(",")
  ) {
    return text;
  }
  return hingeFromGapDescription(gapDescription, firstNode);
}

function defaultContrastFor(firstNode) {
  const label = String(firstNode?.label || "this").trim().toLowerCase();
  const hint = String(firstNode?.blank_hint || "").trim();
  if (hint && !isInstructorFacing(hint)) {
    return `${hint} — what's still missing?`;
  }
  return `Think about two moments with ${label}: what's different the second time?`;
}

function sanitizeContrastPrompt(raw, firstNode) {
  const text = String(raw || "").trim();
  if (text && !isInstructorFacing(text) && !isMetaBeforeAfter(text)) {
    return text;
  }
  return defaultContrastFor(firstNode);
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

/** Learner-facing Socratic question from mechanism-first slots (offline fallback). */
export function rebuildSocraticQuestion({
  contrast_prompt,
  hinge_focus,
  missing_operation,
  before,
  after,
  questionStyle = "direct",
  firstNode,
}) {
  const contrast = sanitizeContrastPrompt(contrast_prompt, firstNode);
  const hinge = sanitizeHingeFocus(hinge_focus || missing_operation, firstNode);
  const b = String(before || "").trim();
  const a = String(after || "").trim();

  if (contrast && hinge) {
    if (questionStyle === "analogical") {
      return `${contrast} What process — ${hinge} — would explain the difference?`;
    }
    return `${contrast} What has to happen: ${hinge}?`;
  }

  if (questionStyle === "analogical") {
    return `Picture ${b}. Later, ${a}. What had to change in between?`;
  }
  return `After ${b}, what had to happen so that ${a}?`;
}

function normalizeScaffoldFields(
  scaffold,
  evaluation,
  firstNode,
  coldAttemptText,
) {
  const before = sanitizeBefore(scaffold.before, coldAttemptText, firstNode);
  const after = sanitizeAfter(scaffold.after, firstNode);
  const hinge_focus = sanitizeHingeFocus(
    scaffold.hinge_focus || scaffold.missing_operation,
    firstNode,
    evaluation?.gap_description,
  );
  const missing_operation = hinge_focus;
  const contrast_prompt = sanitizeContrastPrompt(scaffold.contrast_prompt, firstNode);
  const repair_target = sanitizeRepairTarget(
    scaffold.repair_target,
    evaluation,
    firstNode,
  );
  const question_style = scaffold.question_style || "direct";
  return {
    ...scaffold,
    repair_target,
    hinge_focus,
    contrast_prompt,
    before,
    missing_operation,
    after,
    question_style,
    socratic_question: rebuildSocraticQuestion({
      contrast_prompt,
      hinge_focus,
      missing_operation,
      before,
      after,
      questionStyle: question_style,
      firstNode,
    }),
  };
}

function buildTargetedFeedback(evaluation, firstNode, coldAttemptText = "") {
  const before = learnerBeforeFrom(coldAttemptText, firstNode);
  const after = neutralAfterFor(firstNode);
  const hinge_focus = sanitizeHingeFocus(
    "",
    firstNode,
    evaluation?.gap_description,
  );
  const contrast_prompt = defaultContrastFor(firstNode);
  const fallback = {
    repair_target: sanitizeRepairTarget("", evaluation, firstNode),
    hinge_focus,
    contrast_prompt,
    before,
    missing_operation: hinge_focus,
    after,
    internal_bloom_lens: "understand",
    question_style: "direct",
  };
  fallback.socratic_question = rebuildSocraticQuestion({
    contrast_prompt,
    hinge_focus,
    missing_operation: hinge_focus,
    before,
    after,
    questionStyle: fallback.question_style,
    firstNode,
  });
  return fallback;
}

function isAnswerShapedScaffold(scaffold) {
  const missing = String(scaffold?.missing_operation || "").toLowerCase();
  const hinge = String(scaffold?.hinge_focus || "").toLowerCase();
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
    (/\band\b/.test(missing) && countWords(missing) > 6) ||
    isMetaBeforeAfter(missing) ||
    isMetaBeforeAfter(hinge) ||
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
export function applySocraticRepairDrillQuestion(
  scaffold,
  socraticQuestion,
  firstNode = null,
) {
  const question = String(socraticQuestion || "").trim();
  if (
    !question ||
    isInstructorFacing(question) ||
    META_PHRASE.test(question) ||
    isMetaBeforeAfter(question)
  ) {
    return scaffold;
  }
  if (firstNode && isOffDomainQuestion(question, firstNode)) {
    return scaffold;
  }
  return {
    ...scaffold,
    socratic_question: question,
  };
}
