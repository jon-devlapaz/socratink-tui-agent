# Hosted loop (faithful SEDA + bridge)

The loop server runs the **same Node SEDA handlers and Python `bridge.py` seam** as `./socratink-tui`, exposed as a chat UI over HTTP. Vercel cannot host this process; use a small persistent host and optionally proxy from `app.socratink.ai/loop`.

## Architecture

```text
Browser  →  /loop (static chat) + POST /api/session/*/turn
              ↓
         loop-server.mjs (Node)
              ↓
         lib/seda/handlers/*  →  bridge.py subprocess  →  Gemini (or fake LLM)
```

## Local smoke

```bash
cp .env.example .env          # GEMINI_API_KEY (or use fake mode below)
./scripts/bootstrap-python.sh
chmod +x socratink-loop-server

# No API spend:
SOCRATINK_TUI_FAKE_LLM=1 SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION=shallow ./socratink-loop-server

# Open http://127.0.0.1:8787/loop
```

API probe:

```bash
curl -s -X POST http://127.0.0.1:8787/api/session | jq .
curl -s -X POST http://127.0.0.1:8787/api/session/<id>/turn \
  -H 'Content-Type: application/json' \
  -d '{"text":"Immune memory"}' | jq .
```

**Power-user dogfood:** [MINIMUM-VIABLE-DEPLOYMENT.md](./MINIMUM-VIABLE-DEPLOYMENT.md)

### Learner feedback (`/feedback` → Gmail)

Free setup via Google Apps Script: [FEEDBACK-GMAIL.md](./FEEDBACK-GMAIL.md). Set `SOCRATINK_FEEDBACK_WEBHOOK_URL` in `.env`.

### Live customer persona (Jordan)

See `pedagogical_agents/personas/curious-sophomore-loop.md`. Automated run:

```bash
unset SOCRATINK_TUI_FAKE_LLM
./socratink-loop-server
./scripts/loop-persona-live.mjs --concept "AI"
```

## Deploy to Railway (recommended)

**Full checklist and timeline:** [RAILWAY.md](./RAILWAY.md)

1. Push `socratink-tui-agent` to GitHub (or connect the repo in Railway).
2. **New project → Deploy from repo** → uses `Dockerfile` + `railway.toml`.
3. **Variables** (Railway dashboard):
   - `GEMINI_API_KEY` — required for live LLM
   - `LLM_MODEL` — e.g. `gemini-2.5-flash`
   - `SOCRATINK_LOOP_API_KEY` — optional shared secret; browser must send `Authorization: Bearer …` (set `window.SOCRATINK_LOOP_API_KEY` in a tiny injected script or use server-side proxy)
   - `SOCRATINK_TUI_FAKE_LLM=1` — sandbox without Gemini spend
4. Note the public URL, e.g. `https://socratink-loop-production.up.railway.app`.

### Custom domain

In Railway: **Settings → Networking → Custom Domain** → `loop.app.socratink.ai` (or `loop.socratink.ai`).

DNS (example):

```text
CNAME loop.app  →  <your-service>.up.railway.app
```

## Point `app.socratink.ai/loop` at the loop host

Vercel cannot run the loop process. Two pragmatic options:

### A. Subdomain (simplest)

Use **`https://loop.app.socratink.ai`** (or Railway default URL). Link from the main app nav. No Vercel change.

### B. Path proxy on `socratink-app` (same browser origin)

In `socratink-app/vercel.json`, add **before** the catch-all rewrite:

```json
{
  "source": "/loop",
  "destination": "https://YOUR-LOOP-HOST.up.railway.app/loop"
},
{
  "source": "/loop/:path*",
  "destination": "https://YOUR-LOOP-HOST.up.railway.app/loop/:path*"
},
{
  "source": "/api/session",
  "destination": "https://YOUR-LOOP-HOST.up.railway.app/api/session"
},
{
  "source": "/api/session/:path*",
  "destination": "https://YOUR-LOOP-HOST.up.railway.app/api/session/:path*"
}
```

Redeploy `socratink-app`. The chat page at `app.socratink.ai/loop` then hits the faithful loop server without CORS.

**Caveat:** Vercel rewrites proxy HTTP only; WebSockets are not required for this MVP.

## Auth / sandbox hardening

| Control | Env |
|--------|-----|
| Shared API key on all `/api/*` | `SOCRATINK_LOOP_API_KEY` |
| Fake LLM (CI / internal sandbox) | `SOCRATINK_TUI_FAKE_LLM=1` |
| Port | `PORT` (default `8787`) |

Sessions are **in-memory** (lost on restart). Fine for sandbox; add Redis/Postgres later if you need durability.

## Canon / prompts

Hosted loop reads **`prompt_templates.py` + `vendor/python/`** in this repo. After changing prompts in `socratink-app`:

```bash
./scripts/sync-canon-from-app.sh /path/to/socratink-app
git commit && redeploy Railway
```

## Verify after deploy

```bash
curl -s https://YOUR-LOOP-HOST/health | jq .
# Open https://YOUR-LOOP-HOST/loop — start concept, complete one cold path with fake LLM
```

Production parity with terminal:

```bash
SOCRATINK_TUI_FAKE_LLM=1 ./socratink-tui --scripted fixtures/source_less_script.json --color=never
./socratink-harness replay
```

## What this is not (yet)

- Supabase auth tied to main app accounts
- `localStorage` graph sync with the grid product
- Durable session store across deploys

Those are intentional sandbox cuts; the learning loop itself is faithful.
