import {
  idleStartupLine,
  printIdleHelp,
} from "../../loop-server/prompt-help.mjs";
import {
  feedbackMetaFromCtx,
  handleFeedbackCommand,
} from "../../feedback/handle.mjs";
import { appendMetaTurn } from "../meta-command.mjs";
import {
  isExitCommand,
  isFeedbackCommand,
  isMetaCommand,
  isMetaCommandToken,
} from "../prompt-commands.mjs";

export async function handleIdle({ events, prompt, ctx, options = {} }) {
  const envOptions = { env: options.env ?? process.env };
  if (ctx.scripted && !events.some((e) => e.type === "idle_new_concept")) {
    const concept = await prompt.ask("concept", "Concept: ");
    ctx.concept = concept;
    events.push({ type: "idle_new_concept", concept });
    return {};
  }
  while (true) {
    console.log("");
    console.log(ctx.section("idle", "Idle"));
    console.log(idleStartupLine(envOptions));
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
      printIdleHelp(envOptions);
      continue;
    }
    if (isMetaCommand(cmd, envOptions)) {
      appendMetaTurn(events, "cmd", envOptions);
      continue;
    }
    if (isMetaCommandToken(cmd)) {
      printIdleHelp(envOptions);
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
