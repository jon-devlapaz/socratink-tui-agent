export function makeSections(colorEnabled) {
  const colors = {
    reset: "\x1b[0m",
    idle: "\x1b[90m",
    ignition: "\x1b[35m",
    route: "\x1b[36m",
    map: "\x1b[95m",
    cold: "\x1b[33m",
    study: "\x1b[34m",
    repair: "\x1b[31m",
    pressure: "\x1b[36m",
    spacing: "\x1b[90m",
    redrill: "\x1b[32m",
    evidence: "\x1b[32m",
  };
  return function section(kind, label) {
    const tag = `[${label}]`;
    const tone = colors[kind] ?? "";
    return colorEnabled ? `${tone}${tag}${colors.reset}` : tag;
  };
}
