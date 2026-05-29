export const PROMPT_REQUIRED = "PROMPT_REQUIRED";

export function promptRequired(meta) {
  const err = new Error("awaiting learner input");
  err.code = PROMPT_REQUIRED;
  err.promptMeta = meta;
  return err;
}
