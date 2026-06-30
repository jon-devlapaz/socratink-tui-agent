---
name: architecture
type: context
description: How the major pieces of this project connect and flow. Load when working on system design, integrations, or understanding how components interact.
triggers:
  - "architecture"
  - "system design"
  - "how does X connect to Y"
  - "integration"
  - "flow"
edges:
  - target: context/seda.md
    condition: when the change touches phases, handlers, events, or nextPhase routing
  - target: context/bridge.md
    condition: when a handler calls or changes an LLM bridge action
  - target: context/graph-honesty.md
    condition: when learner evidence or derived graph truth is involved
  - target: context/stack.md
    condition: when specific technology details are needed
  - target: context/decisions.md
    condition: when understanding why the architecture is structured this way
last_updated: 2026-06-30
---

# Architecture

## System Overview

```text
./socratink-tui or /loop HTTP turn
  -> app.mjs / loop-server.mjs
  -> createSessionKernel()
  -> runSedaLoop()
  -> phase handler in lib/seda/handlers/
  -> eventBuilders append fact(s) to events[]
  -> training store + training-derive audit graph state
  -> nextPhase(events) chooses the next phase
  -> bridge.py subprocess only when a handler needs LLM judgment/generation
  -> session.json / hosted response / dashboard read models broadcast state
```

## Key Components

- **`lib/seda/next-phase.mjs`** — pure phase router; depends only on the last event and local policy constants.
- **`lib/seda/handlers/`** — phase lanes for ignition, substrate gate, route, cold attempt, repair, model bridge, spacing, and idle; depend on context, prompt, store, bridge, and `eventBuilders`.
- **`lib/seda/event-facts.mjs`** — canonical runtime event definitions and builders; enforces required fields, graph-neutral flags, score eligibility, and KC requirements.
- **`bridge.py` + `lib/bridge/client.mjs`** — Python LLM subprocess seam called by Node handlers; returns JSON or fail-closed diagnostics.
- **`lib/canon/training-derive.js`** — derives node state from stored attempts; does not route.
- **`public/loop/` + `loop-server.mjs`** — hosted chat UI and HTTP API over the same SEDA handlers.

## Outside services and hosts

- Gemini is the default live LLM provider via `GEMINI_API_KEY` and `LLM_MODEL`.
- OpenAI-compatible local or hosted providers use `LLM_PROVIDER=openai_compatible`,
  `LLM_BASE_URL`, and related env vars.
- Railway or another persistent host is required for hosted `/loop`; Vercel cannot
  run the long-lived loop process.
- GitHub is the source and PR host; repo-local `bin/agent-git` avoids risky
  free-form branch cleanup.
- Google Apps Script feedback webhook is optional through
  `SOCRATINK_FEEDBACK_WEBHOOK_URL`.

## What Does NOT Exist Here

- No database-backed hosted session store; hosted sessions are in memory unless `SOCRATINK_LOOP_SESSION_STORE_DIR` is configured for journals.
- No main-app account/auth integration for `/loop`.
- No Vercel-hosted loop process; Vercel only proxies to a persistent loop host.
- No dashboard or metric write path that drives routing; observability is read-only.
- No direct handler-owned routing decisions outside appended facts and `nextPhase(events)`.
