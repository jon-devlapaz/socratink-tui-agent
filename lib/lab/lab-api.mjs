import { isLabEnabled, labAccessAllowed } from "./lab-access.mjs";
import {
  compatibleTargetForChoice,
  loadCartridges,
  probeLmStudio,
  fetchJson,
  isOpenAiCompatibleMode,
} from "./persona-runner.mjs";
import {
  cancelLabRun,
  getLabRunSnapshot,
  startLabRun,
} from "./lab-runs.mjs";
import {
  getLabBatchSnapshot,
  startLabBatch,
} from "./lab-batches.mjs";
import { projectLabBatchSnapshot } from "./lab-event-ledger.mjs";
import { revealPathInOs } from "./lab-reveal.mjs";
import {
  endpointApiKey,
  endpointBaseUrl,
  endpointConfigured,
  endpointLabel,
} from "../model-endpoints.mjs";
import { getCanonicalGateMap } from "./canonical-gates.mjs";

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

function providerLabel(provider) {
  if (provider === "lmstudio" || provider === "router") return endpointLabel(provider);
  if (provider === "cloud" || provider === "gemini") return "Gemini";
  return provider || "unknown";
}

function compatibleEndpoint(provider) {
  const target = compatibleTargetForChoice(provider);
  if (target === "lmstudio") {
    return {
      target,
      baseUrl: endpointBaseUrl(target, process.env),
      apiKey: endpointApiKey(target, process.env),
    };
  }
  return {
    target,
    baseUrl: endpointBaseUrl(target, process.env),
    apiKey: endpointApiKey(target, process.env),
  };
}

function safeBaseUrlDisplay(baseUrl) {
  if (!baseUrl) return "";
  try {
    const parsed = new URL(baseUrl);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "(configured)";
  }
}

function compatibleEndpointStatus(target, env = process.env) {
  const baseUrl = endpointBaseUrl(target, env);
  return {
    target,
    label: endpointLabel(target),
    configured: Boolean(baseUrl),
    base_url_display: safeBaseUrlDisplay(baseUrl),
    env_var: target === "lmstudio" ? "LM_STUDIO_BASE_URL" : "LLM_ROUTER_BASE_URL",
    api_key_env_var: target === "lmstudio" ? "LM_STUDIO_API_KEY" : "LLM_ROUTER_API_KEY",
    model: target === "lmstudio"
      ? (env.LM_STUDIO_MODEL || env.LLM_LOCAL_DEFAULT_MODEL || "google/gemma-4-12b").trim()
      : (env.LLM_OPENAI_COMPAT_MODEL || "auto").trim(),
  };
}

async function testOpenAiCompatibleModel({ provider, model }) {
  const endpoint = compatibleEndpoint(provider);
  if (!endpoint.baseUrl) {
    const status = compatibleEndpointStatus(endpoint.target);
    return {
      ok: false,
      provider,
      model,
      message: `${providerLabel(provider)} base URL is not configured. Set ${status.env_var} and restart the lab server.`,
    };
  }
  if (!model) {
    return {
      ok: false,
      provider,
      model,
      message: `${providerLabel(provider)} model is required.`,
    };
  }
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${endpoint.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Reply with only OK." },
          { role: "user", content: "Model probe." },
        ],
        temperature: 0,
        max_tokens: 8,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text.slice(0, 240);
      try {
        const body = JSON.parse(text);
        message = body.error?.message || body.message || message;
      } catch {
        // Keep text fallback.
      }
      return {
        ok: false,
        provider,
        model,
        latency_ms: Date.now() - started,
        message: message || `${providerLabel(provider)} probe failed.`,
      };
    }
    return {
      ok: true,
      provider,
      model,
      latency_ms: Date.now() - started,
      message: `${providerLabel(provider)} responded.`,
    };
  } catch (err) {
    return {
      ok: false,
      provider,
      model,
      latency_ms: Date.now() - started,
      message:
        err?.name === "AbortError"
          ? `${providerLabel(provider)} probe timed out.`
          : err instanceof Error
            ? err.message
            : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function testLabModel({ provider, model }) {
  if (provider === "cloud" || provider === "gemini") {
    const configured = Boolean((process.env.GEMINI_API_KEY || "").trim());
    return {
      ok: configured,
      provider,
      model: model || "gemini-2.5-flash",
      message: configured
        ? "Gemini key is configured. Full live verification happens during a run."
        : "Gemini key is missing in .env.",
    };
  }
  if (isOpenAiCompatibleMode(provider)) {
    return testOpenAiCompatibleModel({ provider, model });
  }
  return {
    ok: false,
    provider,
    model,
    message: `Unsupported provider: ${provider || "(missing)"}.`,
  };
}

async function studentProbe(studentMode) {
  if (isOpenAiCompatibleMode(studentMode)) {
    const target = compatibleTargetForChoice(studentMode);
    try {
      const probe = await probeLmStudio({ target });
      return {
        mode: target,
        online: true,
        model: probe.model,
        models: probe.models,
      };
    } catch (err) {
      return {
        mode: target,
        online: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  const key = (process.env.GEMINI_API_KEY || "").trim();
  return {
    mode: "cloud",
    online: Boolean(key),
    model: process.env.PERSONA_GEMINI_MODEL || "gemini-2.5-flash",
  };
}

function labConfigSummary({ loop, studentLocal, studentRouter, studentCloud }) {
  const fakeTutor = loop?.fake_llm === true;
  const compatibleTutorConfigured = endpointConfigured("router", process.env);
  const cloudConfigured = Boolean((process.env.GEMINI_API_KEY || "").trim());
  return {
    founder_controls: [
      {
        id: "tutor",
        label: "Tutor",
        value: fakeTutor
          ? "Sandbox stubs"
          : `${loop?.llm_provider || process.env.LLM_PROVIDER || "gemini"} · ${loop?.llm_model || process.env.LLM_MODEL || "gemini-2.5-flash"}`,
        status: fakeTutor ? "sandbox" : "ready",
        note: "Controls the real loop teacher and evaluator.",
      },
      {
        id: "student",
        label: "Student",
        value: `Cloud Gemini · ${studentCloud?.model || process.env.PERSONA_GEMINI_MODEL || "gemini-2.5-flash"}`,
        status: studentCloud?.online ? "ready" : "missing",
        note: "Controls the simulated learner used by batch runs.",
      },
      {
        id: "evidence",
        label: "Evidence mode",
        value: fakeTutor ? "Sandbox" : "Live",
        status: fakeTutor ? "sandbox" : "ready",
        note: fakeTutor
          ? "Reports are rejected for product decisions until rerun live."
          : "Reports may inform prompt and product changes.",
      },
    ],
    setup_status: [
      {
        id: "gemini",
        label: "Gemini key",
        status: cloudConfigured ? "ready" : "missing",
        note: cloudConfigured
          ? "Cloud tutor/student runs are available."
          : "Cloud runs need GEMINI_API_KEY in .env.",
      },
      {
        id: "openai_compatible",
        label: "FreeLLMAPI",
        status:
          compatibleTutorConfigured || studentLocal?.online || studentRouter?.online
            ? "ready"
            : "optional",
        note: compatibleTutorConfigured
          ? "Router tutor/student options are available."
          : "Only needed when explicitly selecting FreeLLMAPI.",
      },
      {
        id: "sandbox",
        label: "Sandbox stubs",
        status: fakeTutor ? "sandbox" : "off",
        note: fakeTutor
          ? "Useful for smoke tests, not accepted evidence."
          : "Off by default for product-signal runs.",
      },
    ],
    hidden_env: [
      "PORT",
      "LOOP_APP_VERSION",
      "SOCRATINK_LOOP_API_KEY",
      "SOCRATINK_TUI_LOG_ROOT",
      "SOCRATINK_TUI_FAKE_* classification knobs",
    ],
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
    const studentLocal = await studentProbe("lmstudio");
    const studentRouter = await studentProbe("router");
    const studentCloud = await studentProbe("cloud");
    const endpoints = {
      lmstudio: compatibleEndpointStatus("lmstudio"),
      router: compatibleEndpointStatus("router"),
    };
    json(res, 200, {
      lab_enabled: true,
      loop,
      endpoints,
      student: {
        lmstudio: studentLocal,
        router: studentRouter,
        compatible: studentRouter,
        local: studentLocal,
        cloud: studentCloud,
      },
      config: labConfigSummary({ loop, studentLocal, studentRouter, studentCloud }),
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

  if (req.method === "GET" && url === "/api/lab/gates") {
    json(res, 200, getCanonicalGateMap());
    return true;
  }

  if (req.method === "POST" && url === "/api/lab/model-test") {
    const body = await readJson(req);
    const provider = String(body.provider || "").trim();
    const model = String(body.model || "").trim();
    const role = body.role === "student" ? "student" : "tutor";
    json(res, 200, await testLabModel({ provider, model, role }));
    return true;
  }

  if (req.method === "POST" && url === "/api/lab/runs") {
    const body = await readJson(req);
    const cartridgeId = String(body.cartridgeId || "").trim();
    if (!cartridgeId) {
      json(res, 400, { error: "cartridgeId required" });
      return true;
    }
    const student = isOpenAiCompatibleMode(body.student)
      ? compatibleTargetForChoice(body.student)
      : "cloud";
    const maxTurns = Number(body.maxTurns) > 0 ? Number(body.maxTurns) : 24;
    const allowFake = Boolean(body.allowFake);
    const tutor = isOpenAiCompatibleMode(body.tutor)
      ? compatibleTargetForChoice(body.tutor)
      : "gemini";
    const tutorModel = String(body.tutorModel || "").trim() || null;
    const studentModel = String(body.studentModel || "").trim() || null;
    const concept = String(body.concept || "").trim() || null;
    const learnerGoal = String(body.learnerGoal || body.learner_goal || "").trim() || null;
    const launchAttempt = String(body.launchAttempt || body.launch_attempt || "").trim() || null;
    const runId = runStore.startLabRun({
      cartridgeId,
      student,
      studentModel,
      tutor,
      tutorModel,
      concept,
      learnerGoal,
      launchAttempt,
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
    const runs = Math.max(1, Math.min(25, Number(body.runs) || 1));
    const student = isOpenAiCompatibleMode(body.student)
      ? compatibleTargetForChoice(body.student)
      : "cloud";
    const tutor = isOpenAiCompatibleMode(body.tutor)
      ? compatibleTargetForChoice(body.tutor)
      : "gemini";
    const maxTurns = Number(body.maxTurns) > 0 ? Number(body.maxTurns) : 24;
    const allowFake = Boolean(body.allowFake);
    const batchStore = options.batchStore || { startLabBatch, getLabBatchSnapshot };
    const batchId = batchStore.startLabBatch({
      cartridgeId,
      runs,
      student,
      studentModel: String(body.studentModel || "").trim() || null,
      tutor,
      tutorModel: String(body.tutorModel || "").trim() || null,
      concept: String(body.concept || "").trim() || null,
      learnerGoal: String(body.learnerGoal || body.learner_goal || "").trim() || null,
      launchAttempt: String(body.launchAttempt || body.launch_attempt || "").trim() || null,
      maxTurns,
      allowFake,
      baseUrl,
    });
    json(res, 201, { batchId });
    return true;
  }

  const batchMatch = url.match(/^\/api\/lab\/batches\/([^/]+)$/);
  if (req.method === "GET" && batchMatch) {
    const batchStore = options.batchStore || { startLabBatch, getLabBatchSnapshot };
    const snapshot = batchStore.getLabBatchSnapshot(batchMatch[1]);
    if (!snapshot) {
      json(res, 404, { error: "batch not found" });
      return true;
    }
    json(res, 200, projectLabBatchSnapshot(snapshot));
    return true;
  }

  const revealBatchMatch = url.match(/^\/api\/lab\/batches\/([^/]+)\/reveal$/);
  if (req.method === "POST" && revealBatchMatch) {
    const batchStore = options.batchStore || { startLabBatch, getLabBatchSnapshot };
    const snapshot = batchStore.getLabBatchSnapshot(revealBatchMatch[1]);
    if (!snapshot) {
      json(res, 404, { error: "batch not found" });
      return true;
    }
    const outDir = snapshot.batchDir || snapshot.outRoot;
    if (!outDir) {
      json(res, 409, { error: "batch folder not ready yet" });
      return true;
    }
    try {
      const reveal = options.revealPathInOs || revealPathInOs;
      await reveal(outDir);
      json(res, 200, { outDir });
    } catch (err) {
      json(res, 500, {
        error: err instanceof Error ? err.message : String(err),
        outDir,
      });
    }
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
