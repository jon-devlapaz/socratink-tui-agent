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
