import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { advanceSession, sessionResponse } from "./session.mjs";
import { isFeedbackConfigured } from "../feedback/send.mjs";
import { buildDashboardPayload } from "../seda/dashboard-metrics.mjs";
import { LOOP_APP_VERSION } from "./version.mjs";
import {
  createSessionState,
  loadAgentLookup,
  paths,
} from "./runtime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = paths.workspaceRoot;
const LOOP_PUBLIC = path.join(WORKSPACE_ROOT, "public/loop");
const DASHBOARD_PUBLIC = path.join(WORKSPACE_ROOT, "public/dashboard");
const CASES_PATH = path.join(WORKSPACE_ROOT, "learning_cases/cases.jsonl");
const API_KEY = process.env.SOCRATINK_LOOP_API_KEY || "";

const sessions = new Map();
const { lookup: agentLookup, contracts: agentContracts } = await loadAgentLookup();

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function unauthorized(res) {
  json(res, 401, { error: "unauthorized" });
}

function checkAuth(req, res) {
  if (!API_KEY) return true;
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== API_KEY) {
    unauthorized(res);
    return false;
  }
  return true;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function loadDashboardPayload() {
  const raw = await fs.readFile(CASES_PATH, "utf8");
  const cases = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line));
  const sessions = [];
  for (const caseRecord of cases) {
    if (!caseRecord.session_log) continue;
    const sessionPath = path.join(WORKSPACE_ROOT, caseRecord.session_log);
    sessions.push(JSON.parse(await fs.readFile(sessionPath, "utf8")));
  }
  return buildDashboardPayload({ cases, sessions });
}

async function serveStatic(req, res, options) {
  const { mountPath, publicRoot, defaultFile } = options;
  let rel = req.url?.split("?")[0] || "/";
  if (rel === mountPath || rel === `${mountPath}/`) {
    rel = `${mountPath}/${defaultFile}`;
  }
  if (!rel.startsWith(`${mountPath}/`)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const filePath = path.join(publicRoot, rel.replace(`${mountPath}/`, ""));
  if (!filePath.startsWith(publicRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

export function createLoopServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = req.url?.split("?")[0] || "/";

      if (req.method === "GET" && url === "/health") {
        const fakeLlm = process.env.SOCRATINK_TUI_FAKE_LLM === "1";
        const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
        json(res, 200, {
          status: "ok",
          app_version: LOOP_APP_VERSION,
          fake_llm: fakeLlm,
          llm_mode: fakeLlm ? "fake" : "live",
          gemini_configured: Boolean(geminiKey),
          llm_model: process.env.LLM_MODEL || "gemini-2.5-flash",
          llm_provider: process.env.LLM_PROVIDER || "gemini",
          feedback_configured: isFeedbackConfigured(),
        });
        return;
      }

      if (url.startsWith("/loop")) {
        await serveStatic(req, res, {
          mountPath: "/loop",
          publicRoot: LOOP_PUBLIC,
          defaultFile: "index.html",
        });
        return;
      }

      if (url.startsWith("/dashboard")) {
        await serveStatic(req, res, {
          mountPath: "/dashboard",
          publicRoot: DASHBOARD_PUBLIC,
          defaultFile: "index.html",
        });
        return;
      }

      if (!checkAuth(req, res)) return;

      if (req.method === "GET" && url === "/api/dashboard") {
        json(res, 200, await loadDashboardPayload());
        return;
      }

      if (req.method === "POST" && url === "/api/session") {
        const session = await createSessionState({ agentLookup, agentContracts });
        sessions.set(session.id, session);
        const body = await advanceSession(session);
        json(res, 201, body);
        return;
      }

      const turnMatch = url.match(/^\/api\/session\/([^/]+)\/turn$/);
      if (req.method === "POST" && turnMatch) {
        const session = sessions.get(turnMatch[1]);
        if (!session) {
          json(res, 404, { error: "session not found" });
          return;
        }
        const payload = await readJson(req);
        const body = await advanceSession(session, payload.text);
        json(res, 200, body);
        return;
      }

      const getMatch = url.match(/^\/api\/session\/([^/]+)$/);
      if (req.method === "GET" && getMatch) {
        const session = sessions.get(getMatch[1]);
        if (!session) {
          json(res, 404, { error: "session not found" });
          return;
        }
        json(res, 200, sessionResponse(session, session.transcript));
        return;
      }

      json(res, 404, { error: "not found" });
    } catch (error) {
      console.error(error);
      json(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function startLoopServer(port = Number(process.env.PORT || 8787)) {
  const fakeLlm = process.env.SOCRATINK_TUI_FAKE_LLM === "1";
  const geminiConfigured = Boolean((process.env.GEMINI_API_KEY || "").trim());
  const server = createLoopServer();
  server.listen(port, () => {
    console.log(`[loop-server] listening on http://127.0.0.1:${port}/loop`);
    console.log(
      `[loop-server] llm_mode=${fakeLlm ? "FAKE (templates, no Gemini)" : "live"} ` +
        `gemini=${geminiConfigured ? "configured" : "MISSING"} ` +
        `model=${process.env.LLM_MODEL || "gemini-2.5-flash"}`,
    );
    if (fakeLlm) {
      console.warn(
        "[loop-server] SOCRATINK_TUI_FAKE_LLM=1 — route/eval use bridge templates; " +
          "hypothesis map will look templated. Unset and restart for live Gemini.",
      );
    } else if (!geminiConfigured) {
      console.warn(
        "[loop-server] GEMINI_API_KEY missing — bridge calls will fail on route/eval.",
      );
    }
  });
  return server;
}
