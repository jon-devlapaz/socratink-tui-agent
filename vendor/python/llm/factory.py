"""Factory for building the configured LLMClient.

Reads:
  - ``LLM_PROVIDER`` (default: ``"gemini"``)
  - ``LLM_MODEL`` (default per provider — currently ``"gemini-2.5-flash"``)

Optional ``api_key`` argument lets callers (e.g., the /api/extract route)
override the env-resolved key with a per-request key. The adapter still
falls back to the env var if neither is provided.
"""
from __future__ import annotations

import os

from .client import LLMClient
from .gemini_adapter import GeminiAdapter

_DEFAULT_PROVIDER = "gemini"
_DEFAULT_MODELS = {"gemini": "gemini-2.5-flash"}


def build_llm_client(*, api_key: str | None = None) -> LLMClient:
    """Construct the configured LLMClient.

    Provider selection is via ``LLM_PROVIDER`` (default ``"gemini"``).
    Per-stage override env vars (``LLM_PROVIDER_<STAGE>``) are not yet
    implemented; the factory currently uses one global default.
    """
    provider = os.environ.get("LLM_PROVIDER", _DEFAULT_PROVIDER).strip().lower()
    if provider != "gemini":
        raise NotImplementedError(
            f"LLM provider {provider!r} not implemented. Currently supported: 'gemini'."
        )
    model = os.environ.get("LLM_MODEL", _DEFAULT_MODELS[provider]).strip()
    if not model:
        raise ValueError(f"LLM_MODEL must be non-empty for provider {provider!r}.")
    adapter = GeminiAdapter(api_key=api_key, model=model)
    return LLMClient(adapter=adapter)
