import { isLabEnabled, labAccessAllowed } from "./lab-access.mjs";
import { loadCartridges, probeLmStudio, fetchJson } from "./persona-runner.mjs";
import { getCanonicalGateMap } from "./canonical-gates.mjs";
import {
  getLabBatchSnapshot,
  startLabBatch,
} from "./lab-batches.mjs";
import {
  cancelLabRun,
  getLabRunSnapshot,
  startLabRun,
} from "./lab-runs.mjs";
import { revealPathInOs } from "./lab-reveal.mjs";
import { projectLabBatchSnapshot } from "./lab-event-ledger.mjs";

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

function endpointSummary() {
  return {
    lmstudio: {
      label: "LM Studio",
      env_var: "LM_STUDIO_BASE_URL",
      configured: true,
      base_url: process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234/v1",
    },
    router: {
      label: "FreeLLMAPI",
      env_var: "LLM_ROUTER_BASE_URL",
      configured: Boolean((process.env.LLM_ROUTER_BASE_URL || "").trim()),
      base_url: process.env.LLM_ROUTER_BASE_URL || null,
    },
  };
}

function labConfigSummary() {
  const geminiReady = Boolean((process.env.GEMINI_API_KEY || "").trim());
  return {
    founder_controls: [
      { id: "tutor", label: "Tutor" },
      { id: "student", label: "Student" },
      { id: "evidence_mode", label: "Evidence mode" },
    ],
    hidden_env: [
      "PORT",
      "GEMINI_API_KEY",
      "LLM_ROUTER_API_KEY",
      "LM_STUDIO_API_KEY",
    ],
    setup_status: [
      { id: "gemini", label: "Gemini", status: geminiReady ? "ready" : "missing" },
      {
        id: "lmstudio",
        label: "LM Studio",
        status: "available-local-default",
      },
      {
        id: "router",
        label: "FreeLLMAPI",
        status: process.env.LLM_ROUTER_BASE_URL ? "ready" : "missing",
      },
    ],
  };
}

function normalizeModelProvider(provider) {
  const value = String(provider || "").trim().toLowerCase();
  if (value === "cloud") return "gemini";
  if (value === "local" || value === "lm_studio") return "lmstudio";
  if (value === "compatible" || value === "openai_compatible") return "router";
  return value;
}

async function probeChatCompletion({ baseUrl, apiKey, model }) {
  const started = Date.now();
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 8,
      temperature: 0,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error?.message || body.error || res.statusText || `HTTP ${res.status}`);
  }
  return { body, latency_ms: Date.now() - started };
}

async function modelProbe({ provider, model }) {
  const normalized = normalizeModelProvider(provider);
  if (normalized === "gemini") {
    if (!(process.env.GEMINI_API_KEY || "").trim()) {
      return {
        ok: false,
        provider: "gemini",
        model: model || "gemini-2.5-flash",
        message: "Gemini API key missing (set GEMINI_API_KEY).",
      };
    }
    return {
      ok: true,
      provider: "gemini",
      model: model || process.env.LLM_MODEL || "gemini-2.5-flash",
      message: "Gemini key is configured.",
    };
  }

  if (normalized === "router") {
    const baseUrl = (process.env.LLM_ROUTER_BASE_URL || "").trim();
    if (!baseUrl) {
      return {
        ok: false,
        provider: "router",
        model: model || process.env.LLM_OPENAI_COMPAT_MODEL || "auto",
        message: "FreeLLMAPI base URL is not configured (set LLM_ROUTER_BASE_URL).",
      };
    }
    const selectedModel = model || process.env.LLM_OPENAI_COMPAT_MODEL || "auto";
    const result = await probeChatCompletion({
      baseUrl,
      apiKey: process.env.LLM_ROUTER_API_KEY || "",
      model: selectedModel,
    });
    return {
      ok: true,
      provider: "router",
      model: selectedModel,
      latency_ms: result.latency_ms,
      message: "FreeLLMAPI responded.",
    };
  }

  if (normalized === "lmstudio") {
    try {
      const probe = await probeLmStudio({
        target: "lmstudio",
        model: model || process.env.LM_STUDIO_MODEL,
      });
      return {
        ok: true,
        provider: "lmstudio",
        mode: "lmstudio",
        online: true,
        model: probe.model,
        models: probe.models,
        message: "LM Studio responded.",
      };
    } catch (err) {
      return {
        ok: false,
        provider: "lmstudio",
        mode: "lmstudio",
        online: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    ok: false,
    provider: normalized || null,
    model: model || null,
    message: `Unsupported provider: ${provider || "(missing)"}`,
  };
}

async function studentProbe(studentMode) {
  if (studentMode === "lmstudio") {
    return modelProbe({ provider: "lmstudio" });
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
  const batchStore = options.batchStore || {
    startLabBatch,
    getLabBatchSnapshot,
  };

  if (req.method === "GET" && url === "/api/lab/gates") {
    json(res, 200, getCanonicalGateMap());
    return true;
  }

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
    const studentLocal = await studentProbe("lmstudio");
    const studentCloud = await studentProbe("cloud");
    json(res, 200, {
      lab_enabled: true,
      loop,
      config: labConfigSummary(),
      endpoints: endpointSummary(),
      student: {
        local: studentLocal,
        lmstudio: studentLocal,
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

  if (req.method === "POST" && url === "/api/lab/model-test") {
    const body = await readJson(req);
    try {
      const probe = await modelProbe({
        provider: body.provider,
        model: String(body.model || "").trim() || null,
      });
      json(res, 200, probe);
    } catch (err) {
      json(res, 200, {
        ok: false,
        provider: normalizeModelProvider(body.provider),
        model: String(body.model || "").trim() || null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  if (req.method === "POST" && url === "/api/lab/runs") {
    const body = await readJson(req);
    const cartridgeId = String(body.cartridgeId || "").trim();
    if (!cartridgeId) {
      json(res, 400, { error: "cartridgeId required" });
      return true;
    }
    const student = ["local", "lmstudio", "router", "compatible"].includes(body.student)
      ? body.student
      : "cloud";
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

  if (req.method === "POST" && url === "/api/lab/batches") {
    const body = await readJson(req);
    const cartridgeId = String(body.cartridgeId || "").trim();
    if (!cartridgeId) {
      json(res, 400, { error: "cartridgeId required" });
      return true;
    }
    const batchId = batchStore.startLabBatch({
      cartridgeId,
      runs: Number(body.runs) > 0 ? Number(body.runs) : 1,
      tutor: body.tutor || "gemini",
      tutorModel: body.tutorModel || null,
      student: body.student || "cloud",
      studentModel: body.studentModel || null,
      concept: body.concept || null,
      learnerGoal: body.learnerGoal || null,
      launchAttempt: body.launchAttempt || null,
      maxTurns: Number(body.maxTurns) > 0 ? Number(body.maxTurns) : 24,
      allowFake: Boolean(body.allowFake),
      baseUrl,
    });
    json(res, 201, { batchId });
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

  const batchMatch = url.match(/^\/api\/lab\/batches\/([^/]+)$/);
  if (req.method === "GET" && batchMatch) {
    const snapshot = batchStore.getLabBatchSnapshot(batchMatch[1]);
    if (!snapshot) {
      json(res, 404, { error: "batch not found" });
      return true;
    }
    json(res, 200, projectLabBatchSnapshot(snapshot));
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

  const batchRevealMatch = url.match(/^\/api\/lab\/batches\/([^/]+)\/reveal$/);
  if (req.method === "POST" && batchRevealMatch) {
    const snapshot = batchStore.getLabBatchSnapshot(batchRevealMatch[1]);
    if (!snapshot) {
      json(res, 404, { error: "batch not found" });
      return true;
    }
    if (!snapshot.batchDir) {
      json(res, 409, { error: "batch folder not ready yet" });
      return true;
    }
    try {
      const reveal = options.revealPathInOs || revealPathInOs;
      await reveal(snapshot.batchDir);
      json(res, 200, { batchDir: snapshot.batchDir });
    } catch (err) {
      json(res, 500, {
        error: err instanceof Error ? err.message : String(err),
        batchDir: snapshot.batchDir,
      });
    }
    return true;
  }

  json(res, 404, { error: "not found" });
  return true;
}
