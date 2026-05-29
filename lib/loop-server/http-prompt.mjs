import { isHelpCommand } from "../seda/prompt-commands.mjs";
import { promptRequired } from "./errors.mjs";
import { printPromptHelp } from "./prompt-help.mjs";

export function createHttpPrompt({ cache, askCounts, session }) {
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
        printPromptHelp(key);
        throw promptRequired({ key, label, fallback, turn, helpShown: true });
      }

      askCounts.set(key, turn + 1);
      cache.set(cacheKey, value);
      return value;
    },
    close: () => {},
  };
}
