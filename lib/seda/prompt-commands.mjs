import { isMetaLearnerFeatureEnabled } from "./meta-command.mjs";

function normalizedCommand(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function isExitCommand(value) {
  const normalized = normalizedCommand(value);
  return normalized === "/exit" || normalized === "/quit";
}

export function isHelpCommand(value) {
  const normalized = normalizedCommand(value);
  return (
    normalized === "/help" ||
    normalized === "/help/" ||
    normalized === "/?" ||
    normalized === "?"
  );
}

export function isHintCommand(value) {
  const normalized = normalizedCommand(value);
  return normalized === "/hint" || normalized === "/hint/";
}

export function isMetaCommandToken(value) {
  const normalized = normalizedCommand(value);
  return normalized === "/meta" || normalized === "/meta/";
}

export function isMetaCommand(value, options = {}) {
  return (
    isMetaCommandToken(value) &&
    isMetaLearnerFeatureEnabled(options.env)
  );
}

/** `/feedback` or `/feedback your message` (single line). */
export function isFeedbackCommand(value) {
  const normalized = normalizedCommand(value);
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
