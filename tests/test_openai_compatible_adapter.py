"""Offline tests for the OpenAI-compatible LLM adapter and factory routing."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from pydantic import BaseModel

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
VENDOR_PYTHON_ROOT = WORKSPACE_ROOT / "vendor" / "python"
sys.path.insert(0, str(VENDOR_PYTHON_ROOT))

from llm import build_llm_client  # noqa: E402
from llm.errors import LLMMissingKeyError  # noqa: E402
from llm.openai_compatible_adapter import OpenAICompatibleAdapter  # noqa: E402
from llm.types import StructuredLLMRequest  # noqa: E402


class _EchoPayload(BaseModel):
    message: str


class _JudgePayload(BaseModel):
    label: str
    judge_reason: str


def _mock_urlopen(response_body: dict):
    payload = json.dumps(response_body).encode("utf-8")

    class _Response:
        def read(self) -> bytes:
            return payload

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def opener(request, timeout=120):
        assert timeout >= 120
        assert request.full_url.endswith("/chat/completions")
        sent = json.loads(request.data.decode("utf-8"))
        assert sent["messages"][0]["role"] == "system"
        assert sent["messages"][1]["role"] == "user"
        return _Response()

    return opener


def test_factory_unknown_provider_includes_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    with pytest.raises(NotImplementedError, match="'anthropic'"):
        build_llm_client()


def test_factory_builds_openai_compatible_adapter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("LLM_BASE_URL", "http://127.0.0.1:1234/v1")
    monkeypatch.setenv("LLM_API_KEY", "lm-studio")
    monkeypatch.setenv("LLM_MODEL", "google/gemma-4-12b")

    client = build_llm_client()
    assert isinstance(client.adapter, OpenAICompatibleAdapter)


def test_adapter_parses_json_message(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_BASE_URL", "http://127.0.0.1:1234/v1")
    adapter = OpenAICompatibleAdapter(
        api_key="lm-studio",
        model="google/gemma-4-12b",
        provider="openai_compatible",
    )
    request = StructuredLLMRequest(
        system_prompt="system",
        user_prompt="user",
        response_schema=_EchoPayload,
        temperature=0.2,
        task_name="echo",
        prompt_version="v1",
    )
    with patch(
        "llm.openai_compatible_adapter.urllib_request.urlopen",
        _mock_urlopen(
            {
                "choices": [{"message": {"content": '{"message":"hello"}'}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 5},
            }
        ),
    ):
        result = adapter.call_once(request)

    assert result.parsed.message == "hello"
    assert result.provider == "openai_compatible"
    assert result.usage.input_tokens == 3
    assert result.usage.output_tokens == 5


def test_adapter_honors_llm_request_timeout_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_BASE_URL", "http://127.0.0.1:1234/v1")
    monkeypatch.setenv("LLM_REQUEST_TIMEOUT_SECONDS", "240")
    adapter = OpenAICompatibleAdapter(
        api_key="lm-studio",
        model="google/gemma-4-12b",
        provider="openai_compatible",
    )
    request = StructuredLLMRequest(
        system_prompt="system",
        user_prompt="user",
        response_schema=_EchoPayload,
        temperature=0.2,
        task_name="echo",
        prompt_version="v1",
    )

    def opener(request, timeout=120):
        assert timeout == 240
        return _mock_urlopen(
            {"choices": [{"message": {"content": '{"message":"ok"}'}}]}
        )(request, timeout)

    with patch("llm.openai_compatible_adapter.urllib_request.urlopen", opener):
        result = adapter.call_once(request)
    assert result.parsed.message == "ok"


def test_adapter_coerces_missing_required_string_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_BASE_URL", "http://127.0.0.1:1234/v1")
    adapter = OpenAICompatibleAdapter(
        api_key="lm-studio",
        model="google/gemma-4-12b",
        provider="openai_compatible",
    )
    request = StructuredLLMRequest(
        system_prompt="system",
        user_prompt="user",
        response_schema=_JudgePayload,
        temperature=0.2,
        task_name="judge",
        prompt_version="v1",
    )
    with patch(
        "llm.openai_compatible_adapter.urllib_request.urlopen",
        _mock_urlopen(
            {
                "choices": [{"message": {"content": '{"label":"slow"}'}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 5},
            }
        ),
    ):
        result = adapter.call_once(request)

    assert result.parsed.label == "slow"
    assert result.parsed.judge_reason == ""


def test_adapter_missing_api_key_raises_normalized_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.setenv("LLM_BASE_URL", "http://127.0.0.1:1234/v1")
    with pytest.raises(LLMMissingKeyError, match="API key missing"):
        OpenAICompatibleAdapter(
            api_key=None,
            model="google/gemma-4-12b",
            provider="openai_compatible",
        )
