export function isHelpCommand(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "/help" || normalized === "/help/";
}

export function isHintCommand(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "/hint" || normalized === "/hint/";
}
