export function makeMapLegendFormatter(colorEnabled) {
  const reset = colorEnabled ? "\x1b[0m" : "";
  function wrap(code, text) {
    if (!colorEnabled) return text;
    return `${code}${text}${reset}`;
  }
  return {
    framing: (text) => wrap("\x1b[90m", text),
    sectionLabel: (text) => wrap("\x1b[96m", text),
    thesis: (text) => wrap("\x1b[37m", text),
    pillar: (text) => wrap("\x1b[35m", text),
    roomId: (text) => wrap("\x1b[33m", text),
    tagActive: (text) => wrap("\x1b[32m", text),
    tagLocked: (text) => wrap("\x1b[90m", text),
    roomActive: (text) => wrap("\x1b[32m", text),
    roomLocked: (text) => wrap("\x1b[90m", text),
    firstQuestion: (text) => wrap("\x1b[36m", text),
    prompt: (text) => wrap("\x1b[37m", text),
  };
}
