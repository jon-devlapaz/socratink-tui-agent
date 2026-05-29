# Minimum viable deployment — loop for power users

Get the **faithful Socratink loop** (same SEDA + `bridge.py` as the TUI) in front of a small group of power users so you can learn whether the **learning loop** feels real — not whether the infra is perfect.

**Related:** technical hosting details → [LOOP-HOSTING.md](./LOOP-HOSTING.md) · feedback inbox → [FEEDBACK-GMAIL.md](./FEEDBACK-GMAIL.md)

---

## What you are shipping

| In scope | Out of scope (for now) |
|----------|-------------------------|
| One URL → `/loop` chat | Main app accounts / Supabase auth |
| Live Gemini (or fake sandbox) | Durable sessions across deploys |
| `/help`, `/feedback`, `/exit` | Graph grid sync with socratink-app |
| Hypothesis map + cold → repair path | Multi-tenant billing |

Power users care about **pedagogy and loop honesty**, not your hosting vendor.

---

## Pick a tier (15 minutes vs 1 hour)

### Tier A — **Tonight** (your Mac + tunnel)

Best for 1–3 trusted people, same evening.

```bash
./socratink-loop-server
cloudflared tunnel --url http://127.0.0.1:8787   # or: ngrok http 8787
```

Share `https://….trycloudflare.com/loop`. Mac must stay awake; URL changes when the tunnel restarts.

**Pros:** Zero deploy setup. **Cons:** Not “a product link”; your API key spend; no auth.

### Tier B — **Recommended for power users** (Railway, ~1 hour)

Always-on HTTPS link you can post in Slack/email.

**Step-by-step plan:** [RAILWAY.md](./RAILWAY.md) (phases 0–8, env table, verify, invite copy).

Summary: GitHub → Railway deploy from repo → set `GEMINI_API_KEY` + feedback webhook → `curl /health` → invite `$HOST/loop`.

**Pros:** Stable URL, health checks, survives laptop sleep. **Cons:** Gemini cost; need basic secret hygiene.

### Tier C — **Semi-private** (Tailscale on any machine)

Both install Tailscale; share `http://<machine>.<tailnet>.ts.net:8787/loop`. No public internet. Good for founders/advisors who already use Tailscale.

### Tier D — **Raspberry Pi** (always-on at home)

A Pi 4/5 with 2GB+ RAM is enough (Node + Python venv + subprocess `bridge.py`).

**Important:** Tailscale MagicDNS (`raspberrypi.*.ts.net`) only works for people **on your tailnet** (Tailscale app required). For power users who should “just open a link,” use **D1 (tunnel)** or **Tier B (Railway)** below — not tailnet-only URLs.

#### D1 — Pi + **Cloudflare Tunnel** (public HTTPS, no app for users) ← usual choice

Runs on the Pi next to the loop server. Friends get a normal `https://…` link.

```bash
# On the Pi (after loop server works on :8787)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o /tmp/cloudflared.deb
# Pi 32-bit: cloudflared-linux-arm.deb instead
sudo dpkg -i /tmp/cloudflared.deb

cloudflared tunnel --url http://127.0.0.1:8787
```

Share the printed URL + `/loop` (e.g. `https://random-words.trycloudflare.com/loop`). URL changes when you restart the quick tunnel; for a **stable** hostname, create a [named Cloudflare tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (free account).

Run both under systemd: `socratink-loop` + `cloudflared` (see Tier D systemd below).

#### D2 — Pi + **router port forward** (only if you know what you’re doing)

Forward WAN `:8787` → Pi, use your public IP or DDNS. No Tailscale, but you expose your home network; prefer HTTPS via reverse proxy + domain.

#### D3 — Pi + **Tailscale only** (private; testers need the app)

Use `http://raspberrypi.<tailnet>.ts.net:8787/loop` only for people you’ve invited to the tailnet. Skip this if you want “just a link.”

**One-time setup on the Pi (loop server):**

```bash
# Pi OS: Node 20+ and Python 3.12+ (apt or nvm)
sudo apt update && sudo apt install -y git nodejs python3 python3-venv

git clone <your-repo-url> socratink-tui-agent
cd socratink-tui-agent
cp .env.example .env   # edit: GEMINI_API_KEY, SOCRATINK_FEEDBACK_WEBHOOK_URL, etc.
./scripts/bootstrap-python.sh
chmod +x socratink-loop-server

# Smoke test
./socratink-loop-server
# From your laptop: http://<pi-lan-ip>:8787/loop  (or public tunnel URL)
```

**Run on boot (systemd):** create `/etc/systemd/system/socratink-loop.service`:

```ini
[Unit]
Description=Socratink loop server
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/socratink-tui-agent
EnvironmentFile=/home/pi/socratink-tui-agent/.env
ExecStart=/usr/bin/node /home/pi/socratink-tui-agent/loop-server.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now socratink-loop
sudo systemctl status socratink-loop
curl -s http://127.0.0.1:8787/health
```

Adjust `User`, paths, and `ExecStart` if `node` is elsewhere (`which node`).

**Pi notes:**

| Topic | Guidance |
|-------|----------|
| ARM | Run natively (`bootstrap-python.sh`); 64-bit Pi OS → `cloudflared-linux-arm64.deb` |
| Updates | `git pull && ./scripts/bootstrap-python.sh && sudo systemctl restart socratink-loop` |
| Public URL | **cloudflared** on the Pi (D1), or Railway — not MagicDNS alone |
| Security | Public URL + live Gemini = set `SOCRATINK_LOOP_API_KEY` or accept burn risk; cap API quota in Google AI Studio |
| vs Railway | Pi + tunnel = free compute at home; Railway = simpler ops, no home network |

---

## Pre-flight checklist (do this once)

```bash
cp .env.example .env
# GEMINI_API_KEY=…
# SOCRATINK_FEEDBACK_WEBHOOK_URL=…  (see FEEDBACK-GMAIL.md)

./scripts/bootstrap-python.sh
chmod +x socratink-loop-server
```

| Check | Command / action |
|-------|------------------|
| Live LLM (not fake) | `curl -s http://127.0.0.1:8787/health` → `"fake_llm": false` |
| Gemini configured | `"gemini_configured": true` |
| Feedback wired | `"feedback_configured": true` |
| Bridge path works | `node scripts/verify-loop-gemini.mjs` |
| Harness still green | `./socratink-harness replay` (optional, before invite) |

**Before inviting strangers:** set `SOCRATINK_LOOP_API_KEY` on the server and plan how the browser sends `Authorization: Bearer …` (see [LOOP-HOSTING.md](./LOOP-HOSTING.md)). For a **closed list of power users** on a obscure URL, many founders skip API key initially and accept LLM burn risk — but cap spend in Google AI Studio.

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes (live loop) | Route, eval, repair dialogue |
| `LLM_MODEL` | No | Default `gemini-2.5-flash` |
| `SOCRATINK_FEEDBACK_WEBHOOK_URL` | Strongly recommended | `/feedback` → your Gmail |
| `SOCRATINK_FEEDBACK_TO` | Optional | Mailto fallback if webhook unset |
| `SOCRATINK_LOOP_API_KEY` | Optional | Protects `/api/*` |
| `SOCRATINK_TUI_FAKE_LLM=1` | Demo only | Templates, no Gemini spend |
| `PORT` | Auto on Railway | Default `8787` |

Do **not** commit `.env`. On Railway, paste the same keys in the dashboard.

---

## What to send power users

Short invite (copy/adapt):

> **Socratink loop (dogfood)** — source-less learning loop in the browser. Same engine as our terminal prototype.  
> **Link:** `https://YOUR-HOST/loop`  
> **Try:** Pick a concept you care about (e.g. “AI”, “immune memory”). Answer from memory; use `/help` if stuck, `/feedback <message>` for bugs/UX, `/exit` to end.  
> **Note:** Sessions reset when we redeploy. This is hypothesis-map + evidence-honest dogfood, not the full grid product.

Optional: link to 2–3 concepts you want comparable feedback on.

---

## What to watch (first 48 hours)

| Signal | Where |
|--------|--------|
| Uptime | Railway metrics or `curl /health` |
| Gemini spend | Google AI Studio quotas |
| User friction | `/feedback` emails |
| Your own gut | Run one session: concept → map → cold → repair |

**Health JSON fields:** `fake_llm`, `llm_mode`, `gemini_configured`, `feedback_configured`.

After deploy smoke:

```bash
curl -s https://YOUR-HOST/health | jq .
# Browser: one full path on a concept you care about
```

---

## Walking skeleton you already have

You are not starting from zero. This repo already satisfies **minimum viable deployment** for a learning loop:

1. **End-to-end path** — browser → Node handlers → `bridge.py` → Gemini.  
2. **Config in env** — `.env` / Railway variables (12-factor style).  
3. **Health endpoint** — `/health` for host checks.  
4. **Repeatable deploy** — `Dockerfile`, `railway.toml`, `./socratink-loop-server`.  
5. **Feedback channel** — `/feedback` + Apps Script.  
6. **Verification** — `verify-loop-gemini.mjs`, harness replay, scripted TUI.

Gaps to acknowledge to power users (honesty builds trust):

- Sessions are **in-memory** (lost on restart).  
- No per-user auth unless you add `SOCRATINK_LOOP_API_KEY`.  
- Loop is **not** graph-truth product UI — map is provisional.

---

## Rollback and “oops”

| Problem | Fast fix |
|---------|----------|
| Bad deploy | Railway → redeploy previous image / revert commit |
| Runaway API cost | Remove `GEMINI_API_KEY` or set fake LLM on host |
| Broken prompts | `git revert` + redeploy; run `check-canon-drift` if canon changed |
| Need to go dark | Pause Railway service or stop tunnel |

Keep a **known-good** commit tagged `loop-dogfood-YYYY-MM-DD` before each invite wave.

---

## Suggested path for “get it out there”

**If you want a link anyone can open:** Tier B (Railway) or **Tier D1** (Pi + cloudflared).

**Tailscale on the Pi** is only for *you* to SSH/admin — not for testers.

```text
Day 0   Pi or Railway + health + feedback + verify-loop-gemini
Day 0   3 internal runs (different concepts)
Day 1   Invite 5–10 power users (stable URL + short brief)
Day 3   Triage /feedback; one small UX/copy fix deploy
Day 7   Decide: more users vs deepen loop vs grid integration
```

---

## Further reading (concepts, not Socratink-specific)

| Topic | Link |
|-------|------|
| Twelve-factor app | https://12factor.net/ |
| Walking skeleton | https://distilledpatterns.org/patterns/walking-skeleton/ |
| Production deploy checklist | https://dev.to/stacknotice/the-production-deployment-checklist-senior-devs-never-skip-2026-5597 |
| MVP → production (AI apps) | https://afterbuildlabs.com/resources/mvp-to-production-blueprint |

---

## Quick reference

```bash
# Local
./socratink-loop-server
open http://127.0.0.1:8787/loop

# Verify live Gemini
node scripts/verify-loop-gemini.mjs

# Fake mode (no API spend, templated maps)
SOCRATINK_TUI_FAKE_LLM=1 ./socratink-loop-server
```

**Goal:** power users experience **generation before recognition** in a real session — and you get **actionable** `/feedback`, not a perfect platform.
