"""OpenAI-compatible provider adapter.

This adapter supports any OpenAI chat-completions-compatible endpoint,
including local LM Studio and similar providers.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from json import JSONDecodeError
from typing import Any, get_args, get_origin
from urllib import error as urllib_error
from urllib import request as urllib_request

from pydantic import BaseModel

from .errors import (
    LLMClientError,
    LLMMissingKeyError,
    LLMRateLimitError,
    LLMServiceError,
    LLMValidationError,
)
from .types import StructuredLLMRequest, StructuredLLMResult, TokenUsage

_DEFAULT_REQUEST_TIMEOUT_SECONDS = 120


def _request_timeout_seconds() -> int:
    raw = os.environ.get("LLM_REQUEST_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return _DEFAULT_REQUEST_TIMEOUT_SECONDS
    try:
        return max(1, int(raw))
    except ValueError:
        return _DEFAULT_REQUEST_TIMEOUT_SECONDS


def _field_accepts_str(annotation: Any) -> bool:
    if annotation is str:
        return True
    origin = get_origin(annotation)
    if origin is not None:
        return str in get_args(annotation)
    return False


def _coerce_missing_string_fields(
    data: dict[str, Any], schema: type[BaseModel]
) -> dict[str, Any]:
    """Local chat models often omit optional-looking string keys the schema requires."""
    coerced = dict(data)
    for name, field in schema.model_fields.items():
        if not field.is_required():
            continue
        existing = coerced.get(name)
        if isinstance(existing, str) and existing.strip():
            continue
        if _field_accepts_str(field.annotation):
            coerced[name] = existing if isinstance(existing, str) else ""
    return coerced


def _strip_json_fences(text: str) -> str:
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`").strip()
        first_newline = candidate.find("\n")
        if first_newline >= 0:
            candidate = candidate[first_newline + 1 :]
        if candidate.endswith("```"):
            candidate = candidate[:-3].rstrip()
    return candidate


def _resolve_env(name: str, *fallbacks: str) -> str:
    for key in (name, *fallbacks):
        if key and (value := os.environ.get(key, "").strip()):
            return value
    return ""


class _OpenAICompatibleConfig:
    provider: str
    base_url: str
    model: str
    api_key: str

    def __init__(self, *, provider: str, api_key: str | None, model: str) -> None:
        self.provider = provider
        self.model = model
        self.api_key = (api_key or "").strip()
        if not self.api_key:
            self.api_key = _resolve_env("LLM_API_KEY")
        if not self.api_key:
            raise LLMMissingKeyError(
                f"OpenAI-compatible API key missing for provider {provider!r}."
            )

        env_base_url = _resolve_env("LLM_BASE_URL")
        if not env_base_url:
            raise LLMClientError(
                f"OpenAI-compatible base URL missing for provider {provider!r}. "
                "Set LLM_BASE_URL."
            )
        self.base_url = env_base_url.rstrip("/")


class OpenAICompatibleAdapter:
    """Translate StructuredLLMRequest into chat/completions calls."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str,
        provider: str = "openai_compatible",
    ) -> None:
        provider = provider.strip().lower()
        if provider != "openai_compatible":
            provider = "openai_compatible"
        self._config = _OpenAICompatibleConfig(
            provider=provider,
            api_key=api_key,
            model=model,
        )
        self._provider = provider

    def call_once(self, request: StructuredLLMRequest) -> StructuredLLMResult:
        body: dict[str, Any] = {
            "model": self._config.model,
            "messages": [
                {"role": "system", "content": request.system_prompt},
                {"role": "user", "content": request.user_prompt},
            ],
            "temperature": request.temperature,
        }
        payload = json.dumps(body).encode("utf-8")
        endpoint = f"{self._config.base_url}/chat/completions"
        req = urllib_request.Request(
            endpoint,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._config.api_key}",
                "Accept": "application/json",
            },
        )

        start = time.perf_counter()
        try:
            with urllib_request.urlopen(
                req, timeout=_request_timeout_seconds()
            ) as response:
                raw_text = response.read().decode("utf-8", errors="replace")
        except urllib_error.HTTPError as err:
            raw_text = err.read().decode("utf-8", errors="replace")
            message = _extract_error_message(raw_text) or str(err)
            code = getattr(err, "code", None)
            if code == 429:
                raise LLMRateLimitError(
                    f"OpenAI-compatible rate-limited (HTTP {code}): {message}"
                ) from err
            if isinstance(code, int) and 400 <= code < 500:
                raise LLMClientError(
                    f"OpenAI-compatible API error (HTTP {code}): {message}"
                ) from err
            if isinstance(code, int) and 500 <= code < 600:
                raise LLMServiceError(
                    f"OpenAI-compatible service error (HTTP {code}): {message}"
                ) from err
            raise LLMServiceError(
                f"OpenAI-compatible request failed (HTTP {code}): {message}"
            ) from err
        except urllib_error.URLError as err:
            raise LLMServiceError(f"OpenAI-compatible transport failed: {err}") from err
        except Exception as err:  # pragma: no cover - safety net
            raise LLMServiceError(f"OpenAI-compatible request failed: {err}") from err
        finally:
            latency_ms = (time.perf_counter() - start) * 1000.0

        try:
            response = json.loads(raw_text)
        except JSONDecodeError as err:
            raise LLMValidationError(
                "OpenAI-compatible provider returned malformed JSON.",
                raw_text=raw_text,
            ) from err

        content = _extract_content(response)
        raw_payload = content.strip()
        if not raw_payload:
            raise LLMServiceError("OpenAI-compatible provider returned empty message content.")
        raw_payload = _strip_json_fences(raw_payload)

        try:
            payload = json.loads(raw_payload)
        except JSONDecodeError as err:
            raise LLMValidationError(
                "OpenAI-compatible provider returned malformed JSON.",
                raw_text=raw_payload,
            ) from err
        if not isinstance(payload, dict):
            raise LLMValidationError(
                "OpenAI-compatible provider returned a non-object JSON payload.",
                raw_text=raw_payload,
            )

        try:
            parsed = request.response_schema.model_validate(payload)
        except Exception:
            repaired = _coerce_missing_string_fields(payload, request.response_schema)
            try:
                parsed = request.response_schema.model_validate(repaired)
                raw_payload = json.dumps(repaired, ensure_ascii=False)
            except Exception as err:
                raise LLMValidationError(
                    f"OpenAI-compatible response did not match "
                    f"{request.response_schema.__name__}.",
                    raw_text=raw_payload,
                ) from err

        usage = _extract_usage(response)
        return StructuredLLMResult(
            parsed=parsed,
            raw_text=raw_payload,
            usage=usage,
            model=self._config.model,
            provider=self._provider,
            latency_ms=latency_ms,
            raw_provider_metadata=response,
        )

def _extract_error_message(raw_text: str) -> str:
    if not raw_text:
        return ""
    try:
        parsed = json.loads(raw_text)
    except JSONDecodeError:
        return raw_text.strip()
    for key in ("error", "message"):
        value = parsed.get(key)
        if isinstance(value, str):
            return value
    if isinstance(parsed, dict):
        message = parsed.get("message")
        if isinstance(message, str):
            return message
        nested_error = parsed.get("error")
        if isinstance(nested_error, dict):
            nested_message = nested_error.get("message")
            if isinstance(nested_message, str):
                return nested_message
    return ""


def _extract_content(response: dict[str, Any]) -> str:
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise LLMValidationError("OpenAI-compatible response is missing choices.")
    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise LLMValidationError("OpenAI-compatible response has invalid choice payload.")
    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise LLMValidationError("OpenAI-compatible response is missing message content.")
    content = message.get("content")
    if not isinstance(content, str):
        raise LLMValidationError(
            "OpenAI-compatible response is missing message content."
        )
    return content


def _extract_usage(response: dict[str, Any]) -> TokenUsage:
    usage = response.get("usage")
    if not isinstance(usage, dict):
        return TokenUsage(input_tokens=0, output_tokens=0)
    return TokenUsage(
        input_tokens=int(usage.get("prompt_tokens", 0) or 0),
        output_tokens=int(usage.get("completion_tokens", 0) or 0),
    )

