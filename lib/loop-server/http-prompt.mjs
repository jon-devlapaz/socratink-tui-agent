import { appendMetaTurn } from "../seda/meta-command.mjs";
import {
  isHelpCommand,
  isMetaCommand,
  isMetaCommandToken,
} from "../seda/prompt-commands.mjs";
import { promptRequired } from "./errors.mjs";
import { printPromptHelp } from "./prompt-help.mjs";

export function createHttpPrompt({ cache, askCounts, session, env = process.env }) {
  return {
    ask: async (key, label, fallback = "") => {
      const turn = askCounts.get(key) ?? 0;
      const cacheKey = `${key}#${turn}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      let value = null;
      if (session.pendingInput != null && session.pendingInput !== "") {
        value = session.pendingInput;
        session.pendingInput = null;
      }

      if (value == null) {
        throw promptRequired({ key, label, fallback, turn });
      }

      if (isHelpCommand(value)) {
        printPromptHelp(key, { env });
        throw promptRequired({ key, label, fallback, turn, helpShown: true });
      }

      if (isMetaCommand(value, { env })) {
        appendMetaTurn(session.events, key, { env });
        throw promptRequired({ key, label, fallback, turn, metaShown: true });
      }
      if (isMetaCommandToken(value)) {
        printPromptHelp(key, { env });
        throw promptRequired({ key, label, fallback, turn, metaDisabled: true });
      }

      askCounts.set(key, turn + 1);
      cache.set(cacheKey, value);
      return value;
    },
    close: () => {},
  };
}
