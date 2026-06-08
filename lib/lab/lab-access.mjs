export function isLabEnabled() {
  return process.env.SOCRATINK_LAB_ENABLED === "1";
}

export function isLoopbackRequest(req) {
  const addr = req.socket?.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

export function labAccessAllowed(req) {
  return isLabEnabled() && isLoopbackRequest(req);
}
