import { parseFeedbackMessage } from "../seda/prompt-commands.mjs";
import { buildFeedbackMailto, sendFeedback } from "./send.mjs";

export function feedbackMetaFromSession(session) {
  const ctx = session?.ctx || {};
  return {
    sessionId: session?.id,
    phase: session?.phase,
    concept: ctx.concept || "",
    learnerGoal: ctx.learnerGoal || "",
    eventTypes: (session?.events || []).map((e) => e.type),
    source: "loop",
  };
}

export function feedbackMetaFromCtx(ctx, extra = {}) {
  return {
    phase: extra.phase ?? "idle",
    concept: ctx?.concept || "",
    learnerGoal: ctx?.learnerGoal || "",
    source: extra.source ?? "tui",
    ...extra,
  };
}

export async function handleFeedbackCommand(text, sessionOrMeta, log = console.log) {
  const message = parseFeedbackMessage(text);
  if (!message) {
    log(
      "[Feedback] Usage: /feedback <your message> — one line, sent to the Socratink team.",
    );
    return { ok: false, usage: true };
  }

  const meta =
    sessionOrMeta?.ctx != null || sessionOrMeta?.events
      ? feedbackMetaFromSession(sessionOrMeta)
      : sessionOrMeta;

  const result = await sendFeedback({ message, meta });

  if (result.ok) {
    log("[Feedback] Thanks — your note was sent.");
    return result;
  }

  if (result.reason === "not_configured") {
    log(
      "[Feedback] Delivery is not configured on this server (SOCRATINK_FEEDBACK_WEBHOOK_URL).",
    );
    const mailto = result.mailto || buildFeedbackMailto({ message, meta });
    if (mailto) {
      log(`[Feedback] You can email instead: ${mailto}`);
    }
    return result;
  }

  log(`[Feedback] Could not send (${result.error || "unknown"}). Try again later.`);
  return result;
}
