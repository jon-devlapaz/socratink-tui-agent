"""Offline tests for loop persona turn generation."""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import pytest

SCRIPTS_ROOT = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_ROOT))

import loop_persona_turn as persona  # noqa: E402


def _mock_opener(response_body: dict, *, status: int = 200):
    payload = json.dumps(response_body).encode("utf-8")

    class _Response:
        def __init__(self) -> None:
            self._buffer = io.BytesIO(payload)

        def read(self) -> bytes:
            return self._buffer.read()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def opener(request, timeout=120):
        assert request.full_url.endswith("/chat/completions")
        sent = json.loads(request.data.decode("utf-8"))
        assert sent["reasoning_effort"] == "none"
        assert sent["messages"][0]["role"] == "system"
        assert sent["messages"][1]["role"] == "user"
        if status != 200:
            import urllib.error

            raise urllib.error.HTTPError(
                request.full_url,
                status,
                "error",
                hdrs=None,
                fp=io.BytesIO(payload),
            )
        return _Response()

    return opener


def test_extract_openai_message_text_prefers_content() -> None:
    text = persona.extract_openai_message_text(
        {"content": "Vaccines train memory cells.", "reasoning_content": "ignore me"}
    )
    assert text == "Vaccines train memory cells."


def test_extract_openai_message_text_falls_back_to_reasoning() -> None:
    text = persona.extract_openai_message_text(
        {
            "content": "",
            "reasoning_content": "Think first. Vaccines prime the immune system safely.",
        }
    )
    assert text == "Vaccines prime the immune system safely."


def test_build_system_prompt_appends_persona_hint() -> None:
    prompt = persona.build_system_prompt("You are Mia, a true beginner.")
    assert "Profile note: You are Mia, a true beginner." in prompt
    assert persona.PERSONA_SYSTEM in prompt


def test_generate_openai_compatible_uses_mocked_http() -> None:
    text = persona.generate_openai_compatible(
        system_prompt="system",
        user_prompt="user",
        base_url="http://127.0.0.1:1234/v1",
        model="google/gemma-4-12b",
        api_key="lm-studio",
        opener=_mock_opener(
            {
                "choices": [
                    {
                        "message": {
                            "content": "A vaccine is a safe preview for the immune system.",
                        }
                    }
                ]
            }
        ),
    )
    assert text == "A vaccine is a safe preview for the immune system."


def test_extract_openai_message_text_rejects_reasoning_meta() -> None:
    with pytest.raises(RuntimeError, match="reasoning meta"):
        persona.extract_openai_message_text(
            {
                "content": "",
                "reasoning_content": "I should reply with one sentence only.",
            }
        )


def test_generate_persona_turn_openai_compatible(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PERSONA_LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("PERSONA_LLM_BASE_URL", "http://127.0.0.1:1234/v1")
    monkeypatch.setenv("PERSONA_LLM_MODEL", "google/gemma-4-12b")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    text = persona.generate_persona_turn(
        {
            "concept": "Immune memory",
            "learner_goal": "Explain vaccines",
            "phase": "cold_attempt",
            "awaiting_label": "cold attempt",
            "transcript_text": "Map shown.",
            "persona_hint": "You are Sam, grade 7.",
        },
        opener=_mock_opener(
            {
                "choices": [
                    {
                        "message": {
                            "content": "",
                            "reasoning_content": "Draft. Memory cells stay after exposure.",
                        }
                    }
                ]
            }
        ),
    )
    assert text == "Memory cells stay after exposure."
