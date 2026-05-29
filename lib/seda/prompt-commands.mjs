export function isExitCommand(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "/exit" || normalized === "/quit";
}

export function isHelpCommand(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    normalized === "/help" ||
    normalized === "/help/" ||
    normalized === "/?" ||
    normalized === "?"
  );
}

export function isHintCommand(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "/hint" || normalized === "/hint/";
}

/** `/feedback` or `/feedback your message` (single line). */
export function isFeedbackCommand(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    normalized === "/feedback" ||
    normalized === "/feedback/" ||
    normalized.startsWith("/feedback ")
  );
}

/** Returns message body, or null if only `/feedback` with no text. */
export function parseFeedbackMessage(value) {
  const trimmed = String(value || "").trim();
  if (!isFeedbackCommand(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "/feedback" || lower === "/feedback/") return null;
  return trimmed.slice("/feedback".length).trim() || null;
}
