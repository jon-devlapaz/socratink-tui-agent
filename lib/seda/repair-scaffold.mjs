import { isSubstantiveColdEvaluation } from "./cold-gating.mjs";

const CONTRAST_HOOK_PATTERNS = [
  /\bversus\b/i,
  /\bvs\.?\b/i,
  /\bcompared to\b/i,
  /\bcompared with\b/i,
  /\bfirst time\b/i,
  /\bsecond time\b/i,
  /\blater\b/i,
  /\bdelay\b/i,
  /\bimmediately\b/i,
  /\bright away\b/i,
  /\bcramming\b/i,
];

const UPTAKE_INVITE = "what's your best guess at the mechanism?";

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

function isInstructorFacing(text) {
  return (
    INSTRUCTOR_PHRASE.test(String(text || "")) ||
    META_PHRASE.test(String(text || ""))
  );
}

function isMetaBeforeAfter(text) {
  return META_BEFORE_AFTER.test(String(text || ""));
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
  return `Name the missing link for ${label.toLowerCase()}.`;
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

function isQuestionShaped(text) {
  const t = String(text || "").trim().toLowerCase();
  return /^(what|how|why|when|where|which)\b/.test(t);
}

function hingeFromGapDescription(gapDescription, firstNode) {
  const gap = String(gapDescription || "").trim();
  if (
    gap &&
    !isInstructorFacing(gap) &&
    !isMetaBeforeAfter(gap) &&
    !isQuestionShaped(gap) &&
    countWords(gap) <= 8 &&
    !gap.includes(",")
  ) {
    return gap;
  }
  const hint = String(firstNode?.blank_hint || "").trim();
  if (
    hint &&
    !isInstructorFacing(hint) &&
    !isQuestionShaped(hint) &&
    countWords(hint) <= 8
  ) {
    return hint.toLowerCase();
  }
  return "the missing link";
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

function defaultContrastFor(firstNode, coldAttemptText = "") {
  const attempt = String(coldAttemptText || "").trim();
  if (attempt && !isInstructorFacing(attempt) && attempt.includes("?")) {
    const snippet = truncateLearnerSnippet(attempt, 18);
    if (snippet) return snippet.endsWith("?") ? snippet : `${snippet}?`;
  }
  const hint = String(firstNode?.blank_hint || "").trim();
  if (hint && !isInstructorFacing(hint)) {
    return `${hint} — what's still missing?`;
  }
  // Situational contrast only — never paste abstract node labels into the hook.
  return "The first time versus later — what's different?";
}

function sanitizeContrastPrompt(raw, firstNode, coldAttemptText = "") {
  const text = String(raw || "").trim();
  if (text && !isInstructorFacing(text) && !isMetaBeforeAfter(text)) {
    return text;
  }
  return defaultContrastFor(firstNode, coldAttemptText);
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

function finishQuestion(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  return t.endsWith("?") ? t : `${t}?`;
}

function clampLearnerCopy(text, maxWords = 30) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/** Learner cold text carries a divergent question or in-domain contrast pair. */
export function hasUptakeHook(coldAttemptText) {
  const attempt = String(coldAttemptText || "").trim();
  if (!attempt) return false;
  if (attempt.includes("?")) return true;
  return CONTRAST_HOOK_PATTERNS.some((pattern) => pattern.test(attempt));
}

function shouldUseUptakeOpening({ coldAttemptText, evaluation, zeroSchemaCold }) {
  if (zeroSchemaCold) return false;
  if (evaluation?.answer_mode === "help_request") return false;
  if (!isSubstantiveColdEvaluation(evaluation)) return false;
  return hasUptakeHook(coldAttemptText);
}

function extractUptakeHook(coldAttemptText) {
  const attempt = String(coldAttemptText || "").trim();
  if (!attempt) return "";
  if (attempt.includes("?")) {
    const snippet = truncateLearnerSnippet(attempt, 18);
    return snippet.endsWith("?") ? snippet : `${snippet}?`;
  }
  return truncateLearnerSnippet(attempt, 14);
}

function learnerSafeGapPhrase(gapDescription) {
  const gap = String(gapDescription || "").trim();
  if (
    gap &&
    !isInstructorFacing(gap) &&
    !isMetaBeforeAfter(gap) &&
    countWords(gap) <= 12 &&
    !gap.includes(",")
  ) {
    return gap;
  }
  return "";
}

function repairLinkQuestion(target) {
  const t = String(target || "the missing link").trim();
  if (isQuestionShaped(t)) {
    return clampLearnerCopy(finishQuestion(`Repair one missing link: ${t}`));
  }
  return clampLearnerCopy(
    finishQuestion(`Repair one missing link: what connects your answer to ${t}`),
  );
}

function buildOrientOpening(evaluation, firstNode, scaffold) {
  const hinge = sanitizeHingeFocus(
    scaffold?.hinge_focus || scaffold?.missing_operation,
    firstNode,
    evaluation?.gap_description,
  );
  const gap = learnerSafeGapPhrase(evaluation?.gap_description);
  if (gap) return repairLinkQuestion(gap);
  return repairLinkQuestion(hinge);
}

function buildUptakeOpening(coldAttemptText) {
  const hook = extractUptakeHook(coldAttemptText);
  if (!hook) return "";
  const stem = hook.includes("?")
    ? `You asked ${hook.replace(/\?$/, "")}`
    : `You raised ${hook}`;
  return clampLearnerCopy(`${stem} — ${UPTAKE_INVITE}`);
}

/** Turn-1 Repair Opening (uptake 4b or orient 6c). */
export function buildRepairOpening({
  coldAttemptText = "",
  evaluation = null,
  scaffold = {},
  firstNode = null,
  zeroSchemaCold = false,
} = {}) {
  if (
    shouldUseUptakeOpening({ coldAttemptText, evaluation, zeroSchemaCold })
  ) {
    const uptake = buildUptakeOpening(coldAttemptText);
    if (uptake) return uptake;
  }
  return buildOrientOpening(evaluation, firstNode, scaffold);
}

/** Turn 2+ fallback when the repair-dialogue judge omits next_prompt. */
export function buildContingentProbe({ repairText = "", scaffold = {} } = {}) {
  const hinge =
    scaffold?.hinge_focus ||
    scaffold?.missing_operation ||
    "the missing link";
  const snippet = truncateLearnerSnippet(repairText, 10);
  if (snippet && !isInstructorFacing(snippet)) {
    if (isQuestionShaped(hinge)) {
      return clampLearnerCopy(
        finishQuestion(`You mentioned ${snippet} — ${hinge}`),
      );
    }
    return clampLearnerCopy(
      finishQuestion(`You mentioned ${snippet} — what connects that to ${hinge}`),
    );
  }
  if (isQuestionShaped(hinge)) {
    return clampLearnerCopy(finishQuestion(`Repair one missing link: ${hinge}`));
  }
  return clampLearnerCopy(
    finishQuestion(`Repair one missing link: what connects your answer to ${hinge}`),
  );
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
    const finish = (question) =>
      question.endsWith("?") ? question : `${question}?`;
    const contrastIsComplete = contrast.trim().endsWith("?");
    if (contrastIsComplete || isQuestionShaped(hinge)) {
      // Contrast is already a full question, or hinge is question-shaped — do
      // not stack a second clause (avoids worksheet double-prompts).
      return finish(contrast);
    }
    if (questionStyle === "analogical") {
      return finish(`${contrast} What process — ${hinge} — would explain the difference`);
    }
    return finish(`${contrast} What had to happen — ${hinge}`);
  }

  if (questionStyle === "analogical") {
    return `Picture ${b}. Later, ${a}. What had to change in between?`;
  }
  return `What connects ${b} to ${a}?`;
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
  const contrast_prompt = sanitizeContrastPrompt(
    scaffold.contrast_prompt,
    firstNode,
    coldAttemptText,
  );
  const repair_target = sanitizeRepairTarget(
    scaffold.repair_target,
    evaluation,
    firstNode,
  );
  const question_style = scaffold.question_style || "direct";
  const normalized = {
    ...scaffold,
    repair_target,
    hinge_focus,
    contrast_prompt,
    before,
    missing_operation,
    after,
    question_style,
  };
  return {
    ...normalized,
    socratic_question: buildRepairOpening({
      coldAttemptText,
      evaluation,
      scaffold: normalized,
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
  const contrast_prompt = defaultContrastFor(firstNode, coldAttemptText);
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
  fallback.socratic_question = buildRepairOpening({
    coldAttemptText,
    evaluation,
    scaffold: fallback,
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

/** Drill output is internal-slot only; turn-1 copy stays on buildRepairOpening. */
export function applySocraticRepairDrillQuestion(scaffold) {
  return scaffold;
}
