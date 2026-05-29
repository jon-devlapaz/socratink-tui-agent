/**
 * Send learner feedback via a Google Apps Script web app (free → Gmail).
 * See deploy/FEEDBACK-GMAIL.md for one-time setup.
 */

const WEBHOOK_URL = (process.env.SOCRATINK_FEEDBACK_WEBHOOK_URL || "").trim();
const WEBHOOK_SECRET = (process.env.SOCRATINK_FEEDBACK_SECRET || "").trim();
const MAILTO_TO = (process.env.SOCRATINK_FEEDBACK_TO || "").trim();

export function isFeedbackConfigured() {
  return Boolean(WEBHOOK_URL);
}

export function buildFeedbackMailto({ message, meta }) {
  if (!MAILTO_TO) return null;
  const subject = encodeURIComponent(
    `Socratink feedback · ${meta?.concept || meta?.phase || "loop"}`,
  );
  const body = encodeURIComponent(formatFeedbackBody(message, meta));
  return `mailto:${MAILTO_TO}?subject=${subject}&body=${body}`;
}

export function formatFeedbackBody(message, meta = {}) {
  const lines = [
    String(message || "").trim(),
    "",
    "---",
    `phase: ${meta.phase ?? "—"}`,
    `concept: ${meta.concept ?? "—"}`,
    `session: ${meta.sessionId ?? "—"}`,
  ];
  if (meta.learnerGoal) lines.push(`goal: ${meta.learnerGoal}`);
  if (meta.eventTypes?.length) {
    lines.push(`events: ${meta.eventTypes.join(" → ")}`);
  }
  if (meta.source) lines.push(`source: ${meta.source}`);
  return lines.join("\n");
}

export async function sendFeedback({ message, meta = {} }) {
  const text = String(message || "").trim();
  if (!text) {
    return { ok: false, error: "empty_message" };
  }

  if (!WEBHOOK_URL) {
    return {
      ok: false,
      reason: "not_configured",
      mailto: buildFeedbackMailto({ message: text, meta }),
    };
  }

  const url = new URL(WEBHOOK_URL);
  if (WEBHOOK_SECRET) url.searchParams.set("secret", WEBHOOK_SECRET);

  const subject = `Socratink feedback · ${meta.concept || meta.phase || "loop"}`;
  const body = formatFeedbackBody(text, meta);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        body,
        message: text,
        meta,
        ...(WEBHOOK_SECRET ? { secret: WEBHOOK_SECRET } : {}),
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) {
      return {
        ok: false,
        error: payload.error || `http_${res.status}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
