/** Loop transcript: questions live in the composer, not the scrollback. */
export const QUESTION_LINE_PREFIX = "[Question] ";

export function logLearnerQuestion(text) {
  const body = String(text ?? "").trim();
  if (!body) return;
  console.log(`${QUESTION_LINE_PREFIX}${body}`);
}

export function isQuestionTranscriptLine(text) {
  const line = String(text ?? "").trim();
  return line.startsWith(QUESTION_LINE_PREFIX);
}

export function questionBodyFromTranscriptLine(text) {
  return String(text ?? "")
    .trim()
    .slice(QUESTION_LINE_PREFIX.length)
    .trim();
}
