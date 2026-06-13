import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SessionStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SessionStoreError";
    this.code = code;
  }
}

export function defaultSessionStoreRoot(env = process.env) {
  return (
    env.SOCRATINK_LOOP_SESSION_STORE_DIR ||
    path.join(os.tmpdir(), "socratink-loop-sessions")
  );
}

export function createFileSessionStore({
  rootDir = defaultSessionStoreRoot(),
  now = () => new Date().toISOString(),
} = {}) {
  const root = path.resolve(rootDir);

  function assertSessionId(sessionId) {
    if (!SESSION_ID_PATTERN.test(String(sessionId || ""))) {
      throw new SessionStoreError("InvalidSessionId", "invalid session id");
    }
  }

  function sessionDir(sessionId) {
    assertSessionId(sessionId);
    const resolved = path.resolve(root, sessionId);
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      throw new SessionStoreError("InvalidSessionId", "invalid session path");
    }
    return resolved;
  }

  async function create(sessionId, metadata = {}) {
    const dir = sessionDir(sessionId);
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(dir, { recursive: false });
    const createdAt = now();
    await writeJson(path.join(dir, "metadata.json"), {
      session_id: sessionId,
      created_at: createdAt,
      updated_at: createdAt,
      event_count: 0,
      status: metadata.status || "active",
      phase: metadata.phase || "idle",
      awaiting: metadata.awaiting || null,
      transcript_tail: [],
      complete: Boolean(metadata.complete),
      case_complete: Boolean(metadata.caseComplete),
      llm: metadata.llm || null,
      bridge_diagnostics_dir: metadata.bridgeDiagnosticsDir || null,
    });
    await fs.writeFile(path.join(dir, "events.jsonl"), "", { flag: "wx" });
    return load(sessionId);
  }

  async function load(sessionId) {
    const dir = sessionDir(sessionId);
    try {
      const [metadata, journal] = await Promise.all([
        readJson(path.join(dir, "metadata.json")),
        fs.readFile(path.join(dir, "events.jsonl"), "utf8"),
      ]);
      const events = journal
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return { sessionId, metadata, events };
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new SessionStoreError("SessionNotFound", "session not found");
      }
      throw error;
    }
  }

  async function listRecent({ limit = 12 } = {}) {
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }

    const sessions = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !SESSION_ID_PATTERN.test(entry.name)) continue;
      try {
        sessions.push(await load(entry.name));
      } catch (error) {
        if (!(error instanceof SessionStoreError)) throw error;
      }
    }

    return sessions
      .sort((a, b) =>
        String(b.metadata.updated_at || "").localeCompare(
          String(a.metadata.updated_at || ""),
        ),
      )
      .slice(0, Math.max(0, limit));
  }

  async function clearReports() {
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return { deleted_count: 0 };
      throw error;
    }

    let deletedCount = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !SESSION_ID_PATTERN.test(entry.name)) continue;
      await fs.rm(sessionDir(entry.name), { recursive: true, force: true });
      deletedCount += 1;
    }
    return { deleted_count: deletedCount };
  }

  async function appendEvents(sessionId, events, metadata = {}) {
    const dir = sessionDir(sessionId);
    if (!Array.isArray(events)) {
      throw new SessionStoreError("InvalidEvents", "events must be an array");
    }
    await fs.mkdir(dir, { recursive: true });
    if (events.length) {
      const lines = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
      await fs.appendFile(path.join(dir, "events.jsonl"), lines, "utf8");
    }
    const existing = await load(sessionId);
    const transcriptTail = [
      ...(existing.metadata.transcript_tail || []),
      ...(Array.isArray(metadata.transcript) ? metadata.transcript : []),
    ].slice(-200);
    await writeJson(path.join(dir, "metadata.json"), {
      session_id: sessionId,
      created_at: existing.metadata.created_at || now(),
      updated_at: now(),
      event_count: existing.events.length,
      status: metadata.status || existing.metadata.status || "active",
      phase: metadata.phase ?? existing.metadata.phase ?? null,
      awaiting: metadata.awaiting ?? existing.metadata.awaiting ?? null,
      transcript_tail: transcriptTail,
      complete: Boolean(metadata.complete),
      case_complete: Boolean(metadata.caseComplete),
      llm: metadata.llm_active ?? existing.metadata.llm ?? null,
      bridge_diagnostics_dir:
        metadata.bridgeDiagnosticsDir ?? existing.metadata.bridge_diagnostics_dir ?? null,
    });
    return load(sessionId);
  }

  async function updateMetadata(sessionId, partial) {
    const dir = sessionDir(sessionId);
    const existing = await load(sessionId);
    await writeJson(path.join(dir, "metadata.json"), {
      ...existing.metadata,
      ...partial,
      session_id: sessionId,
      updated_at: now(),
    });
    return load(sessionId);
  }

  return {
    rootDir: root,
    create,
    load,
    listRecent,
    clearReports,
    appendEvents,
    updateMetadata,
    assertSessionId,
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
