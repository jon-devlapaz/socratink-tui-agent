import {
  IDLE_STARTUP_LINE,
  printIdleHelp,
} from "../../loop-server/prompt-help.mjs";
import {
  feedbackMetaFromCtx,
  handleFeedbackCommand,
} from "../../feedback/handle.mjs";
import { isExitCommand, isFeedbackCommand } from "../prompt-commands.mjs";

export async function handleIdle({ events, prompt, ctx }) {
  if (ctx.scripted && !events.some((e) => e.type === "idle_new_concept")) {
    const concept = await prompt.ask("concept", "Concept: ");
    ctx.concept = concept;
    events.push({ type: "idle_new_concept", concept });
    return {};
  }
  while (true) {
    console.log("");
    console.log(ctx.section("idle", "Idle"));
    console.log(IDLE_STARTUP_LINE);
    const cmd = (await prompt.ask("cmd", "> ")).trim();
    if (!cmd && ctx.scripted) {
      events.push({ type: "idle_exit" });
      return {};
    }
    if (isExitCommand(cmd)) {
      events.push({ type: "idle_exit" });
      return {};
    }
    if (cmd === "/redrill") {
      events.push({ type: "idle_redrill" });
      return {};
    }
    if (cmd === "/help" || cmd === "/?") {
      printIdleHelp();
      continue;
    }
    if (isFeedbackCommand(cmd)) {
      await handleFeedbackCommand(cmd, feedbackMetaFromCtx(ctx));
      continue;
    }
    if (!cmd) continue;
    ctx.concept = cmd;
    events.push({ type: "idle_new_concept", concept: cmd });
    return {};
  }
}
