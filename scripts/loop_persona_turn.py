#!/usr/bin/env python3
"""Generate one in-character learner line for loop-persona-live.mjs.

Providers (PERSONA_LLM_PROVIDER):
  gemini            — default; uses GEMINI_API_KEY + LLM_MODEL
  openai_compatible — LM Studio / any OpenAI-compatible server (PERSONA_LLM_* env)
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

PERSONA_SYSTEM = """You are Jordan, a second-year college student using socratink loop.
Anti-cramming, anti-flashcard-gamification, anti-AI-answer-dumping.
You write your own words; first attempts are thin, you improve when nudged.
Reply with ONLY the text you would type into the app — no quotes, no meta, no markdown.
Keep answers to 1-3 sentences unless the prompt clearly asks for a short paragraph.
Type /help only when genuinely confused about what the app wants (rare)."""


def build_system_prompt(persona_hint: str) -> str:
    hint = (persona_hint or "").strip()
    if not hint:
        return PERSONA_SYSTEM
    return f"{PERSONA_SYSTEM}\n\nProfile note: {hint}"


def build_user_prompt(payload: dict) -> str:
    concept = str(payload.get("concept") or "").strip()
    goal = str(payload.get("learner_goal") or "").strip()
    phase = str(payload.get("phase") or "").strip()
    awaiting = str(payload.get("awaiting_label") or "").strip()
    transcript = str(payload.get("transcript_text") or "").strip()
    return f"""Concept you chose: {concept}
Learner goal: {goal or "(none yet)"}
Current app phase: {phase or "unknown"}
Current prompt label: {awaiting or "start — type a concept"}

Transcript so far:
{transcript or "(empty)"}

What do you type next? One learner message only."""


_REASONING_META_RE = re.compile(
    r"(?i)\b(I should|the user wants|reply with|one sentence|learner text|constraint|must respond)\b",
)


def _looks_like_reasoning_meta(text: str) -> bool:
    return bool(_REASONING_META_RE.search(text))


def extract_openai_message_text(message: dict) -> str:
    content = (message.get("content") or "").strip()
    if content:
        return content
    reasoning = (message.get("reasoning_content") or "").strip()
    if not reasoning:
        return ""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", reasoning) if s.strip()]
    candidate = sentences[-1] if sentences else reasoning
    if _looks_like_reasoning_meta(candidate):
        raise RuntimeError(
            "Persona model returned reasoning meta instead of learner text. "
            "Retry or confirm reasoning_effort is supported."
        )
    return candidate


def generate_openai_compatible(
    *,
    system_prompt: str,
    user_prompt: str,
    base_url: str,
    model: str,
    api_key: str,
    opener=urllib.request.urlopen,
) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.65,
            "max_tokens": 300,
            "reasoning_effort": "none",
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with opener(request, timeout=120) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI-compatible persona call failed ({err.code}): {detail}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(f"OpenAI-compatible persona call failed: {err.reason}") from err

    if "error" in payload:
        message = payload["error"].get("message") or payload["error"]
        raise RuntimeError(f"OpenAI-compatible persona call failed: {message}")

    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError("OpenAI-compatible persona call returned no choices.")
    message = choices[0].get("message") or {}
    text = extract_openai_message_text(message)
    if not text:
        raise RuntimeError("Persona model returned empty text.")
    return text


def generate_gemini(*, system_prompt: str, user_prompt: str, api_key: str, model: str) -> str:
    from google import genai
    from google.genai import types as genai_types

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents=user_prompt,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.65,
        ),
    )
    text = (response.text or "").strip()
    if not text:
        raise RuntimeError("Persona model returned empty text.")
    return text


def generate_persona_turn(payload: dict, *, opener=urllib.request.urlopen) -> str:
    provider = os.environ.get("PERSONA_LLM_PROVIDER", "gemini").strip().lower()
    system_prompt = build_system_prompt(str(payload.get("persona_hint") or ""))
    user_prompt = build_user_prompt(payload)

    if provider == "openai_compatible":
        base_url = os.environ.get("PERSONA_LLM_BASE_URL", "http://127.0.0.1:1234/v1").strip()
        model = os.environ.get("PERSONA_LLM_MODEL", "google/gemma-4-12b").strip()
        api_key = os.environ.get("PERSONA_LLM_API_KEY", "lm-studio").strip()
        if not base_url or not model:
            raise RuntimeError("PERSONA_LLM_BASE_URL and PERSONA_LLM_MODEL are required.")
        return generate_openai_compatible(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            base_url=base_url,
            model=model,
            api_key=api_key,
            opener=opener,
        )

    if provider != "gemini":
        raise RuntimeError(
            f"PERSONA_LLM_PROVIDER {provider!r} not supported. Use 'gemini' or 'openai_compatible'."
        )

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required for persona turns.")
    model = os.environ.get("LLM_MODEL", "gemini-2.5-flash").strip()
    return generate_gemini(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        api_key=api_key,
        model=model,
    )


def main() -> None:
    payload = json.load(sys.stdin)
    try:
        print(generate_persona_turn(payload))
    except RuntimeError as err:
        print(str(err), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
