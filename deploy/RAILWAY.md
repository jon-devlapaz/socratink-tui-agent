# Railway deployment plan — Socratink loop (power-user dogfood)

**Goal:** Public `https://…/loop` URL anyone can open — no Tailscale, no Pi ops.  
**Repo readiness:** `Dockerfile`, `railway.toml`, `/health`, loop UI already exist.  
**Related:** [LOOP-HOSTING.md](./LOOP-HOSTING.md) · [MINIMUM-VIABLE-DEPLOYMENT.md](./MINIMUM-VIABLE-DEPLOYMENT.md) · [FEEDBACK-GMAIL.md](./FEEDBACK-GMAIL.md)

---

## Architecture on Railway

```text
Internet → Railway HTTPS → Node (loop-server.mjs) :PORT
                              ├─ /loop          static UI
                              ├─ /health        deploy probe
                              └─ /api/session/* SEDA + bridge.py → Gemini
```

Railway sets `PORT` automatically. The container runs `node loop-server.mjs` (see `Dockerfile`).

---

## Phase 0 — Prerequisites (15 min)

| Item | Action |
|------|--------|
| GitHub repo | Push `socratink-tui-agent` (or connect Railway to local via CLI later) |
| Gemini | API key ready; set **quota / budget alert** in Google AI Studio |
| Feedback | `SOCRATINK_FEEDBACK_WEBHOOK_URL` tested locally ([FEEDBACK-GMAIL.md](./FEEDBACK-GMAIL.md)) |
| Railway account | [railway.app](https://railway.app) — Hobby/Pro as needed |
| Secrets | Never commit `.env` (already gitignored) |

**Decision log (fill before deploy):**

- [ ] **Live Gemini** (`GEMINI_API_KEY`) vs sandbox (`SOCRATINK_TUI_FAKE_LLM=1`) for first invite wave  
- [ ] **Public URL** for invite: Railway default `*.up.railway.app` vs custom `loop.app.socratink.ai`  
- [ ] **API auth:** v1 = no `SOCRATINK_LOOP_API_KEY` (simpler UX); v2 = shared secret (see Phase 6)

---

## Phase 1 — Repo prep (10 min)

### 1.1 Confirm build works locally

```bash
docker build -t socratink-loop .
docker run --rm -p 8787:8787 \
  -e GEMINI_API_KEY="$GEMINI_API_KEY" \
  -e SOCRATINK_FEEDBACK_WEBHOOK_URL="$SOCRATINK_FEEDBACK_WEBHOOK_URL" \
  socratink-loop
curl -s http://127.0.0.1:8787/health | jq .
open http://127.0.0.1:8787/loop
```

Fix any Docker build failure **before** Railway (ARM builders use same Dockerfile).

### 1.2 Push to GitHub

```bash
git status   # no .env
git push origin main
```

### 1.3 Optional hygiene

- Add `.dockerignore` (excludes `.venv`, `.qa-runs`, `.env`) — faster uploads  
- Tag commit: `loop-railway-v1` for easy rollback

---

## Phase 2 — Create Railway service (20 min)

1. **New Project** → **Deploy from GitHub repo** → select `socratink-tui-agent`.
2. Railway detects **`Dockerfile`** + **`railway.toml`**:
   - Build: Dockerfile  
   - Health: `GET /health` (120s timeout in `railway.toml`)
3. **Settings → Networking → Generate domain** → note `https://<name>.up.railway.app`.
4. Wait for first deploy; open **Deploy logs** if build fails (usually Python bootstrap or missing file).

**Common build failures:**

| Symptom | Fix |
|---------|-----|
| `pip install` timeout | Retry deploy; check `requirements-dev.txt` |
| Health check fail | App not listening on `PORT`; check logs for crash on boot |
| `GEMINI` errors at runtime | Key missing in Railway variables (build can still succeed) |

---

## Phase 3 — Environment variables (Railway dashboard)

**Service → Variables** (same names as local `.env`):

| Variable | Required | Notes |
|----------|----------|--------|
| `GEMINI_API_KEY` | Yes (live) | Omit if using fake mode only |
| `LLM_MODEL` | No | `gemini-2.5-flash` |
| `SOCRATINK_FEEDBACK_WEBHOOK_URL` | Strongly recommended | `/feedback` → Gmail |
| `SOCRATINK_FEEDBACK_SECRET` | If Apps Script uses it | Match script property |
| `SOCRATINK_FEEDBACK_TO` | Optional | Mailto fallback only |
| `SOCRATINK_TUI_FAKE_LLM` | Optional | `1` = no Gemini spend, templated maps |
| `LOOP_APP_VERSION` | Optional override | Loop chrome label; deploy reads `LOOP_APP_VERSION_DEFAULT` from `lib/loop-server/version.mjs` (bump every PR) |
| `SOCRATINK_LOOP_API_KEY` | **Skip for v1** | See Phase 6 — breaks browser unless wired |
| `PORT` | Auto | Railway injects; do not hardcode in Dockerfile CMD |

**Do not set** `SOCRATINK_TUI_FAKE_LLM=1` and live `GEMINI_API_KEY` together unless you intend sandbox behavior.

Redeploy after changing variables (Railway usually auto-redeploys).

---

## Phase 4 — Verify production (10 min)

```bash
export HOST=https://<your-service>.up.railway.app

curl -s "$HOST/health" | jq .
# Expect: app_version matches lib/loop-server/version.mjs, fake_llm false, gemini_configured true

SOCRATINK_LOOP_BASE_URL="$HOST" node scripts/verify-loop-gemini.mjs
```

**Manual browser checklist:**

- [ ] Open `$HOST/loop` — header pill **live · gemini-…** (not sandbox)  
- [ ] Idle line: concept first, `/help`, `/feedback`, `/exit`  
- [ ] Full path: concept → goal → launch → map (Gemini, not immune template for “AI”)  
- [ ] `/feedback test` → email received  
- [ ] `/exit` → session ends; can start new concept  

**Record for invite:** stable URL = `$HOST/loop`

---

## Phase 5 — Custom domain (optional, +30 min)

**Simplest:** Share Railway URL as-is for dogfood.

**Branded:**

1. Railway → **Settings → Custom Domain** → `loop.app.socratink.ai` (example).  
2. DNS: `CNAME loop.app` → `<service>.up.railway.app`.  
3. Wait for TLS; retest `/health` and `/loop`.

**Same-origin on main app (optional):** Vercel rewrites in `socratink-app` — see [LOOP-HOSTING.md](./LOOP-HOSTING.md) § “Path proxy”. Only needed if you want `app.socratink.ai/loop` instead of a subdomain.

---

## Phase 6 — Security & cost (before wide invite)

### v1 (closed dogfood, ~10 people)

- Obscure Railway URL (unguessable subdomain is enough for many founders).  
- **No** `SOCRATINK_LOOP_API_KEY` (browser does not inject it today).  
- Gemini **quota cap** + billing alert.  
- Monitor `/feedback` and Railway logs first 48h.

### v2 (if link leaks or wider invite)

- Set `SOCRATINK_LOOP_API_KEY` on server.  
- **Requires code change:** inject key into browser (e.g. tiny `/loop/config.js` from env, or embed in served `index.html`). Until then, API key blocks all users.  
- Or: Vercel proxy adds `Authorization` server-side (no key in browser).

---

## Phase 7 — Power-user invite (copy-paste)

> **Socratink loop (early dogfood)**  
> Faithful learning loop in the browser — same engine as our terminal prototype.  
>  
> **Link:** https://YOUR-HOST/loop  
>  
> Try any concept you care about. Answer from memory.  
> **Commands:** `/help` · `/feedback <message>` · `/exit`  
>  
> Sessions reset when we redeploy. Map is provisional (hypothesis), not final graph truth.

Send to 5–10 people; ask for `/feedback` on confusion, map mismatch, repair UX.

---

## Phase 8 — Operate after launch

| Task | How |
|------|-----|
| Deploy update | `git push origin main` → Smoke CI → production deploy job → verify direct Railway + `app.socratink.ai/health` match repo version |
| Rollback | Railway → Deployments → redeploy previous |
| Logs | Railway deploy + runtime logs; search `bridge`, `error` |
| Cost | Railway dashboard + Google AI Studio usage |
| Prompt/canon change | `sync-canon-from-app.sh` → commit → redeploy |

**Known limits (tell testers):**

- Sessions are **in-memory** — redeploy clears active sessions.  
- No login / per-user history yet.

---

## Execution timeline (suggested)

| Day | Work |
|-----|------|
| **0** | Phase 0–4: Railway up, health green, one real concept end-to-end |
| **0** | Phase 6 v1: quota caps, feedback confirmed |
| **1** | Phase 7: invite 5 power users |
| **3** | Triage `/feedback`; one small fix + redeploy |
| **5** | Optional Phase 5 custom domain |
| **7** | Decide: widen invite, Pi backup, or loop UX iteration |

---

## Checklist (printable)

```
[ ] Docker build OK locally
[ ] GitHub pushed, Railway connected
[ ] Variables set (GEMINI, feedback webhook)
[ ] /health OK on public URL
[ ] verify-loop-gemini.mjs OK against public URL
[ ] Browser: live pill, AI concept map sane, /feedback, /exit
[ ] Gemini quota / billing alert set
[ ] Invite email sent with URL
[ ] Tag: loop-railway-v1
```

---

## Out of scope for this deploy

- Supabase / app account auth  
- Durable session store (Redis)  
- `SOCRATINK_LOOP_API_KEY` without browser wiring  
- Automatic Vercel env rewiring if the Railway public domain itself changes

## GitHub Actions production deploy

`main` now has a production deploy job in `.github/workflows/smoke.yml`. It runs
only after all Smoke jobs pass, pushes the current repo contents to Railway via
CLI, forces `LOOP_APP_VERSION` to the canonical value from
`lib/loop-server/version.mjs`, and waits until both the direct Railway health
endpoint and `https://app.socratink.ai/health` report that version.

Required GitHub configuration:

| Key | Type | Purpose |
|-----|------|---------|
| `RAILWAY_TOKEN` | secret | Railway project token for CI deploys |
| `RAILWAY_PROJECT_ID` | secret | Target Railway project |
| `RAILWAY_ENVIRONMENT` | secret | Usually `production` |
| `RAILWAY_SERVICE` | secret | Loop service name or ID |
| `GEMINI_API_KEY` | secret | Live model key |
| `SOCRATINK_FEEDBACK_WEBHOOK_URL` | secret, optional | Feedback delivery |
| `SOCRATINK_FEEDBACK_SECRET` | secret, optional | Feedback signing |
| `SOCRATINK_FEEDBACK_TO` | secret, optional | Mailto fallback |
| `RAILWAY_LOOP_HEALTH_URL` | variable | Direct Railway `/health` URL |

Local/manual verification uses:

```bash
RAILWAY_LOOP_HEALTH_URL=https://loop-production-07a3.up.railway.app/health \
APP_LOOP_HEALTH_URL=https://app.socratink.ai/health \
node scripts/verify-live-loop-version.mjs
```

---

## Next engineering tasks (after Railway is live)

1. **Optional:** `.dockerignore` + bind `0.0.0.0` explicitly in `http-server.mjs` (defensive).  
2. **Optional:** `/loop/config.js` for API key when hardening public URL.  
3. **Optional:** add a staging deploy/verification lane for PR branches if you want pre-merge hosted proof.

When Phase 4 is green, you are ready to invite power users.
