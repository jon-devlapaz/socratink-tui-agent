#!/usr/bin/env python3
"""Generate one in-character learner line for loop-persona-live.mjs."""

from __future__ import annotations

import json
import os
import sys

from google import genai
from google.genai import types as genai_types

PERSONA_SYSTEM = """You are Jordan, a second-year college student using socratink loop.
Anti-cramming, anti-flashcard-gamification, anti-AI-answer-dumping.
You write your own words; first attempts are thin, you improve when nudged.
Reply with ONLY the text you would type into the app — no quotes, no meta, no markdown.
Keep answers to 1-3 sentences unless the prompt clearly asks for a short paragraph.
Type /help only when genuinely confused about what the app wants (rare)."""


def main() -> None:
    payload = json.load(sys.stdin)
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("GEMINI_API_KEY is required for persona turns.", file=sys.stderr)
        sys.exit(1)

    model = os.environ.get("LLM_MODEL", "gemini-2.5-flash").strip()
    concept = str(payload.get("concept") or "").strip()
    goal = str(payload.get("learner_goal") or "").strip()
    phase = str(payload.get("phase") or "").strip()
    awaiting = str(payload.get("awaiting_label") or "").strip()
    transcript = str(payload.get("transcript_text") or "").strip()

    user_prompt = f"""Concept you chose: {concept}
Learner goal: {goal or "(none yet)"}
Current app phase: {phase or "unknown"}
Current prompt label: {awaiting or "start — type a concept"}

Transcript so far:
{transcript or "(empty)"}

What do you type next? One learner message only."""

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents=user_prompt,
        config=genai_types.GenerateContentConfig(
            system_instruction=PERSONA_SYSTEM,
            temperature=0.65,
        ),
    )
    text = (response.text or "").strip()
    if not text:
        print("Persona model returned empty text.", file=sys.stderr)
        sys.exit(1)
    print(text)


if __name__ == "__main__":
    main()
