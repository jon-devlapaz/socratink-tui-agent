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


def _sequence_opener(response_bodies: list[dict]):
    calls = []
    bodies = list(response_bodies)

    def opener(request, timeout=120):
        calls.append(json.loads(request.data.decode("utf-8")))
        if not bodies:
            raise AssertionError("unexpected extra persona request")
        return _mock_opener(bodies.pop(0))(request, timeout=timeout)

    opener.calls = calls
    return opener


def test_extract_openai_message_text_prefers_content() -> None:
    text = persona.extract_openai_message_text(
        {"content": "Vaccines train memory cells.", "reasoning_content": "ignore me"}
    )
    assert text == "Vaccines train memory cells."


def test_extract_openai_message_text_unwraps_json_content_field() -> None:
    text = persona.extract_openai_message_text(
        {
            "content": json.dumps(
                {
                    "thought": "I should answer like a student.",
                    "content": "It predicts words from patterns, not checked facts.",
                }
            )
        }
    )
    assert text == "It predicts words from patterns, not checked facts."


def test_extract_openai_message_text_rejects_thought_only_json() -> None:
    with pytest.raises(RuntimeError, match="thought"):
        persona.extract_openai_message_text(
            {"content": json.dumps({"thought": "I should answer like a student."})}
        )


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


def test_build_user_prompt_includes_current_prompt_text() -> None:
    prompt = persona.build_user_prompt(
        {
            "concept": "Immune memory",
            "learner_goal": "Explain vaccines",
            "phase": "spaced_redrill",
            "awaiting_label": "Spaced re-drill",
            "awaiting_text": "Name what stays and what it does faster next time.",
            "transcript_text": "Earlier text",
        }
    )
    assert "Current prompt text: Name what stays" in prompt
    assert "what it does faster next time" in prompt


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


def test_generate_openai_compatible_retries_thought_only_json() -> None:
    opener = _sequence_opener(
        [
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"thought": "I should answer like a learner."}
                            )
                        }
                    }
                ]
            },
            {
                "choices": [
                    {
                        "message": {
                            "content": "It predicts likely words, not whether they are true."
                        }
                    }
                ]
            },
        ]
    )

    text = persona.generate_openai_compatible(
        system_prompt="system",
        user_prompt="user",
        base_url="http://127.0.0.1:1234/v1",
        model="google/gemma-4-12b",
        api_key="lm-studio",
        opener=opener,
    )

    assert text == "It predicts likely words, not whether they are true."
    assert len(opener.calls) == 2
    assert "not accepted" in opener.calls[1]["messages"][1]["content"]


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


def test_openai_compatible_persona_inherits_unified_router_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PERSONA_LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("PERSONA_LLM_TARGET", "router")
    monkeypatch.delenv("PERSONA_LLM_BASE_URL", raising=False)
    monkeypatch.delenv("PERSONA_LLM_MODEL", raising=False)
    monkeypatch.delenv("PERSONA_LLM_API_KEY", raising=False)
    monkeypatch.setenv("LLM_ROUTER_BASE_URL", "http://openai-router.test/v1")
    monkeypatch.setenv("LLM_ROUTER_API_KEY", "router-key")
    monkeypatch.setenv("LLM_OPENAI_COMPAT_MODEL", "auto")

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
                            "content": "Memory cells respond faster after a safe preview.",
                        }
                    }
                ]
            }
        ),
    )
    assert text == "Memory cells respond faster after a safe preview."


def test_cloud_persona_uses_persona_model_not_tutor_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured = {}

    def fake_generate_gemini(**kwargs):
        captured.update(kwargs)
        return "Cloud student reply."

    monkeypatch.delenv("PERSONA_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "local-tutor-model")
    monkeypatch.setenv("PERSONA_GEMINI_MODEL", "gemini-student-model")
    monkeypatch.setattr(persona, "generate_gemini", fake_generate_gemini)

    text = persona.generate_persona_turn(
        {
            "concept": "Immune memory",
            "learner_goal": "Explain vaccines",
            "phase": "cold_attempt",
            "awaiting_label": "cold attempt",
            "transcript_text": "Map shown.",
            "persona_hint": "You are Sam.",
        }
    )

    assert text == "Cloud student reply."
    assert captured["model"] == "gemini-student-model"
