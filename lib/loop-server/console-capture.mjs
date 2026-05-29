const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text) {
  return String(text).replace(ANSI_RE, "");
}

export function captureConsole(sink) {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  function push(level, args) {
    const line = args
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");
    sink.push({ level, text: stripAnsi(line) });
  }

  console.log = (...args) => {
    push("log", args);
    original.log(...args);
  };
  console.info = (...args) => {
    push("info", args);
    original.info(...args);
  };
  console.warn = (...args) => {
    push("warn", args);
    original.warn(...args);
  };
  console.error = (...args) => {
    push("error", args);
    original.error(...args);
  };

  return () => {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
  };
}
