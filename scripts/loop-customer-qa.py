#!/usr/bin/env python3
"""
Customer persona browser QA for the hosted loop (exploration, not a CI gate).

Persona: Maya — curious non-expert on the dogfood link. Asserts live LLM,
/help, map + Option F composer CTA, cold eval advance, /exit.

Setup (once):
  .venv/bin/pip install -r requirements-dev.txt
  .venv/bin/python -m playwright install chromium

Run:
  ./scripts/loop-customer-qa.sh
  SOCRATINK_LOOP_BASE_URL=http://127.0.0.1:8787 ./scripts/loop-customer-qa.sh
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Any
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get(
    "SOCRATINK_LOOP_BASE_URL",
    "https://loop-production-07a3.up.railway.app",
).rstrip("/")
LOOP_URL = f"{BASE}/loop"
OUT = Path(
    os.environ.get(
        "SOCRATINK_LOOP_QA_OUT",
        ROOT / ".qa-runs/webwright/customer-persona-loop",
    ),
)
SHOT = OUT / "screenshots"
REPORT = OUT / "report.json"

PERSONA = {
    "name": "Maya",
    "goal": "Understand how vaccines train immune memory without reading a textbook first.",
}

TURNS = [
    ("concept", "Immune memory"),
    ("goal", "Explain how vaccines work"),
    (
        "launch",
        "Vaccines expose the immune system to something harmless so it learns and remembers how to fight the real germ later.",
    ),
    (
        "cold",
        "Memory B and T cells stay around after exposure so a second encounter triggers a faster, stronger response.",
    ),
]


def snap(page: Any, name: str) -> str:
    SHOT.mkdir(parents=True, exist_ok=True)
    path = SHOT / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    return str(path)


def transcript_text(page: Any) -> str:
    return str(page.locator("#transcript").inner_text())


def cta_state(page: Any) -> dict[str, object]:
    cta = page.locator("#composer-cta")
    hidden = cta.get_attribute("hidden")
    return {
        "visible": hidden is None,
        "label": str(page.locator("#composer-cta-label").inner_text()).strip(),
        "text": str(page.locator("#composer-cta-text").inner_text()).strip(),
    }


def llm_pill(page: Any) -> str:
    return str(page.locator("#llm-pill").inner_text()).strip()


def phase_pill(page: Any) -> str:
    return str(page.locator("#phase-pill").inner_text()).strip()


def send_answer(page: Any, text: str, timeout_ms: int = 180_000) -> None:
    inp = page.locator("#input")
    expect(inp).to_be_enabled(timeout=timeout_ms)
    before_len = len(transcript_text(page))
    inp.fill(text)
    page.locator("button.send").click()
    page.wait_for_function(
        "before => document.querySelector('#transcript')?.innerText.length > before",
        arg=before_len,
        timeout=timeout_ms,
    )
    expect(inp).to_be_enabled(timeout=timeout_ms)
    expect(page.locator("#terminal")).to_have_attribute("aria-busy", "false", timeout=timeout_ms)


def main() -> int:
    findings: list[dict[str, object]] = []
    console_errors: list[str] = []
    failed_requests: list[str] = []

    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()
        page.on(
            "console",
            lambda msg: console_errors.append(f"{msg.type}: {msg.text}")
            if msg.type in ("error", "warning")
            else None,
        )
        page.on(
            "requestfailed",
            lambda req: failed_requests.append(f"{req.method} {req.url} — {req.failure}"),
        )

        health = page.request.get(f"{BASE}/health").json()
        page.goto(LOOP_URL, wait_until="networkidle", timeout=60_000)
        snap(page, "01-landing")

        cp1_ok = (
            health.get("fake_llm") is False
            and health.get("gemini_configured") is True
            and "sandbox" not in llm_pill(page).lower()
        )
        findings.append(
            {
                "id": "CP1",
                "claim": "Dogfood link shows live LLM, not sandbox templates",
                "pass": cp1_ok,
                "evidence": {"health": health, "llm_pill": llm_pill(page)},
            },
        )

        send_answer(page, "/help", timeout_ms=30_000)
        snap(page, "02-help")
        t_help = transcript_text(page)
        help_lines = [ln for ln in t_help.splitlines() if ln.startswith("[Help]")]
        cp2_ok = (
            len(help_lines) >= 1
            and any("Path:" in ln for ln in help_lines)
            and (
                "dogfood" in t_help.lower() or "map is a draft" in t_help.lower()
            )
        )
        findings.append(
            {
                "id": "CP2",
                "claim": "/help gives a short path + commands in plain language",
                "pass": cp2_ok,
                "evidence": {"help_lines": help_lines[:4]},
            },
        )

        for step, text in TURNS[:3]:
            send_answer(page, text, timeout_ms=180_000)
            snap(page, f"03-after-{step}")

        t_after_route = transcript_text(page)
        cp3_ok = "[Map]" in t_after_route or "map" in t_after_route.lower()
        findings.append(
            {
                "id": "CP3",
                "claim": "After launch, learner sees a provisional map in the log",
                "pass": cp3_ok,
                "evidence": {"phase": phase_pill(page), "transcript_tail": t_after_route[-800:]},
            },
        )

        cta = cta_state(page)
        snap(page, "04-composer-cta")
        cp4_ok = bool(cta["visible"]) and len(str(cta["text"])) > 20
        cta_text = str(cta["text"])
        dup_in_log = bool(
            re.search(r"\[Question\]", t_after_route)
            or (
                cta_text
                and cta_text[:40] in t_after_route
                and t_after_route.count(cta_text[:30]) > 1
            )
        )
        findings.append(
            {
                "id": "CP4",
                "claim": "Generative question lives in composer CTA (Option F), not duplicated in scrollback",
                "pass": cp4_ok and not dup_in_log,
                "evidence": {"cta": cta, "dup_in_log": dup_in_log},
            },
        )

        send_answer(page, TURNS[3][1], timeout_ms=180_000)
        snap(page, "05-after-cold")
        t_cold = transcript_text(page)
        cp5_ok = phase_pill(page) not in ("—", "idle", "route", "map")
        findings.append(
            {
                "id": "CP5",
                "claim": "Cold attempt submits and loop advances (eval path runs)",
                "pass": cp5_ok,
                "evidence": {"phase": phase_pill(page), "transcript_tail": t_cold[-600:]},
            },
        )

        send_answer(page, "/exit", timeout_ms=30_000)
        snap(page, "06-exit")
        cp6_ok = "session ended" in transcript_text(page).lower()
        findings.append(
            {
                "id": "CP6",
                "claim": "/exit ends session with clear copy",
                "pass": cp6_ok,
                "evidence": {"placeholder": page.locator("#input").get_attribute("placeholder")},
            },
        )

        browser.close()

    report = {
        "persona": PERSONA,
        "url": LOOP_URL,
        "findings": findings,
        "console_errors": [e for e in console_errors if e],
        "failed_requests": failed_requests,
        "all_pass": all(f["pass"] for f in findings),
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))
    print(f"\nArtifacts: {OUT}", file=sys.stderr)
    return 0 if report["all_pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
