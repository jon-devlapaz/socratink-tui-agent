import { isLabEnabled, labAccessAllowed } from "./lab-access.mjs";
import { loadCartridges, probeLmStudio, fetchJson } from "./persona-runner.mjs";
import {
  cancelLabRun,
  getLabRunSnapshot,
  startLabRun,
} from "./lab-runs.mjs";
import { revealPathInOs } from "./lab-reveal.mjs";

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function loopHealth(baseUrl) {
  return fetchJson(`${baseUrl.replace(/\/$/, "")}/health`, {}, { timeoutMs: 5_000 });
}

async function studentProbe(studentMode) {
  if (studentMode === "local") {
    try {
      const probe = await probeLmStudio();
      return {
        mode: "local",
        online: true,
        model: probe.model,
        models: probe.models,
      };
    } catch (err) {
      return {
        mode: "local",
        online: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  const key = (process.env.GEMINI_API_KEY || "").trim();
  return {
    mode: "cloud",
    online: Boolean(key),
    model: process.env.LLM_MODEL || "gemini-2.5-flash",
  };
}

function gateDenied(req, res) {
  if (!isLabEnabled()) {
    json(res, 404, { error: "not found" });
    return true;
  }
  if (!labAccessAllowed(req)) {
    json(res, 403, { error: "lab is localhost only" });
    return true;
  }
  return false;
}

export async function handleLabApi(req, res, url, options = {}) {
  if (!options.skipGate && gateDenied(req, res)) return true;

  const baseUrl =
    options.baseUrl ||
    `http://127.0.0.1:${process.env.PORT || 8787}`;
  const runStore = options.runStore || {
    startLabRun,
    getLabRunSnapshot,
    cancelLabRun,
  };

  if (req.method === "GET" && url === "/api/lab/status") {
    let loop;
    try {
      loop = await loopHealth(baseUrl);
    } catch (err) {
      loop = {
        status: "offline",
        error: err instanceof Error ? err.message : String(err),
      };
    }
    const studentLocal = await studentProbe("local");
    const studentCloud = await studentProbe("cloud");
    json(res, 200, {
      lab_enabled: true,
      loop,
      student: {
        local: studentLocal,
        cloud: studentCloud,
      },
    });
    return true;
  }

  if (req.method === "GET" && url === "/api/lab/cartridges") {
    const cartridges = loadCartridges().map((c) => ({
      id: c.id,
      label: c.label,
      concept: c.concept,
      learner_goal: c.learner_goal,
      persona_hint: c.persona_hint,
    }));
    json(res, 200, { cartridges });
    return true;
  }

  if (req.method === "POST" && url === "/api/lab/runs") {
    const body = await readJson(req);
    const cartridgeId = String(body.cartridgeId || "").trim();
    if (!cartridgeId) {
      json(res, 400, { error: "cartridgeId required" });
      return true;
    }
    const student = body.student === "local" ? "local" : "cloud";
    const maxTurns = Number(body.maxTurns) > 0 ? Number(body.maxTurns) : 24;
    const allowFake = Boolean(body.allowFake);
    const runId = runStore.startLabRun({
      cartridgeId,
      student,
      maxTurns,
      allowFake,
      baseUrl,
    });
    json(res, 201, { runId });
    return true;
  }

  const runMatch = url.match(/^\/api\/lab\/runs\/([^/]+)$/);
  if (req.method === "GET" && runMatch) {
    const snapshot = runStore.getLabRunSnapshot(runMatch[1]);
    if (!snapshot) {
      json(res, 404, { error: "run not found" });
      return true;
    }
    json(res, 200, snapshot);
    return true;
  }

  const cancelMatch = url.match(/^\/api\/lab\/runs\/([^/]+)\/cancel$/);
  if (req.method === "POST" && cancelMatch) {
    const ok = runStore.cancelLabRun(cancelMatch[1]);
    if (!ok) {
      json(res, 404, { error: "run not found or not cancellable" });
      return true;
    }
    json(res, 200, { cancelled: true });
    return true;
  }

  const revealMatch = url.match(/^\/api\/lab\/runs\/([^/]+)\/reveal$/);
  if (req.method === "POST" && revealMatch) {
    const snapshot = runStore.getLabRunSnapshot(revealMatch[1]);
    if (!snapshot) {
      json(res, 404, { error: "run not found" });
      return true;
    }
    if (!snapshot.outDir) {
      json(res, 409, { error: "run folder not ready yet" });
      return true;
    }
    try {
      const reveal = options.revealPathInOs || revealPathInOs;
      await reveal(snapshot.outDir);
      json(res, 200, { outDir: snapshot.outDir });
    } catch (err) {
      json(res, 500, {
        error: err instanceof Error ? err.message : String(err),
        outDir: snapshot.outDir,
      });
    }
    return true;
  }

  json(res, 404, { error: "not found" });
  return true;
}
