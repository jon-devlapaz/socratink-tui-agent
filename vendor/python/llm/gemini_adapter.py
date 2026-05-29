"""Gemini provider adapter.

This is the only file in the repo that imports the google-genai SDK.
Enforced by ``tests/test_llm_seam_isolation.py``. All Gemini-specific
quirks live here: SDK call shape, error code classification,
``response.parsed`` extraction, token usage extraction.

Application code never imports this module directly; it constructs an
``LLMClient`` via ``llm.build_llm_client(...)`` instead.
"""
from __future__ import annotations

import os
import time
from typing import Any

from google import genai
from google.genai import types as genai_types
from google.genai.errors import APIError

from .errors import (
    LLMClientError,
    LLMMissingKeyError,
    LLMRateLimitError,
    LLMServiceError,
    LLMValidationError,
)
from .types import StructuredLLMRequest, StructuredLLMResult, TokenUsage

_PROVIDER = "gemini"
_RATE_LIMIT_CODE = 429
# 5xx are transient upstream failures that LLMClient retries.
_RETRYABLE_SERVICE_CODES = {500, 502, 503, 504}


class GeminiAdapter:
    """Translates StructuredLLMRequest into a google-genai SDK call.

    Constructed by ``llm.build_llm_client`` with an explicit model name.
    Resolves the API key from constructor argument first, then falls back
    to the ``GEMINI_API_KEY`` environment variable.
    """

    def __init__(self, *, api_key: str | None = None, model: str):
        self._explicit_key = api_key
        self._model = model

    def _resolve_key(self) -> str:
        key = self._explicit_key or os.environ.get("GEMINI_API_KEY")
        if not key:
            raise LLMMissingKeyError(
                "No Gemini API key configured. "
                "Set GEMINI_API_KEY or pass api_key=... to build_llm_client()."
            )
        return key

    def call_once(self, request: StructuredLLMRequest) -> StructuredLLMResult:
        key = self._resolve_key()
        client = genai.Client(api_key=key)
        config = genai_types.GenerateContentConfig(
            system_instruction=request.system_prompt,
            temperature=request.temperature,
            response_schema=request.response_schema,
            response_mime_type="application/json",
        )

        start = time.perf_counter()
        try:
            response = client.models.generate_content(
                model=self._model,
                contents=request.user_prompt,
                config=config,
            )
        except APIError as err:
            self._raise_normalized(err)
        finally:
            latency_ms = (time.perf_counter() - start) * 1000.0

        parsed = getattr(response, "parsed", None)
        if not isinstance(parsed, request.response_schema):
            raw_text = getattr(response, "text", None) or ""
            if not raw_text:
                raise LLMServiceError("Gemini returned an empty response.")
            raise LLMValidationError(
                f"Gemini response did not match {request.response_schema.__name__}.",
                raw_text=raw_text,
            )

        usage = self._extract_usage(response)
        raw_text = getattr(response, "text", "") or ""

        return StructuredLLMResult(
            parsed=parsed,
            raw_text=raw_text,
            usage=usage,
            model=self._model,
            provider=_PROVIDER,
            latency_ms=latency_ms,
        )

    @staticmethod
    def _raise_normalized(err: Exception) -> None:
        code = getattr(err, "code", None)
        message = getattr(err, "message", None) or str(err)
        if code == _RATE_LIMIT_CODE:
            raise LLMRateLimitError(f"Gemini rate-limited: {message}") from err
        if code in _RETRYABLE_SERVICE_CODES:
            raise LLMServiceError(f"Gemini service error (HTTP {code}): {message}") from err
        if isinstance(code, int) and 400 <= code < 500:
            # Permanent client-side failure (expired key, invalid model,
            # malformed request, quota exhausted). NOT retried.
            raise LLMClientError(f"Gemini API error (HTTP {code}): {message}") from err
        # Unknown / non-HTTP error — treat as transient service to be safe.
        raise LLMServiceError(f"Gemini API error (HTTP {code}): {message}") from err

    @staticmethod
    def _extract_usage(response: Any) -> TokenUsage:
        meta = getattr(response, "usage_metadata", None)
        if meta is None:
            return TokenUsage(input_tokens=0, output_tokens=0)
        return TokenUsage(
            input_tokens=getattr(meta, "prompt_token_count", 0) or 0,
            output_tokens=getattr(meta, "candidates_token_count", 0) or 0,
        )
