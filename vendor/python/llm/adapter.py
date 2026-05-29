"""The LLMAdapter Protocol.

An adapter is the single place provider-specific code lives. It must:
  - translate a StructuredLLMRequest into a provider SDK call
  - extract a StructuredLLMResult from the provider's response
  - classify provider exceptions into normalized LLMError subclasses
  - validate the parsed content matches the requested schema, or raise
    LLMValidationError

It does NOT:
  - retry (LLMClient owns retry policy)
  - log (LLMClient owns telemetry)
  - cache (out of scope for MVP)
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from .types import StructuredLLMRequest, StructuredLLMResult


@runtime_checkable
class LLMAdapter(Protocol):
    """Provider adapter. Implements one primitive: ``call_once``.

    Adapters MUST raise normalized errors from ``llm.errors``:
      - LLMMissingKeyError when no API key is configured
      - LLMRateLimitError on 429 / equivalent
      - LLMServiceError on 5xx / transport / unknown failure
      - LLMValidationError when response cannot be parsed as
        ``request.response_schema``

    Adapters MUST populate ``StructuredLLMResult.parsed`` with an instance of
    ``request.response_schema``, never a dict.
    """

    def call_once(self, request: StructuredLLMRequest) -> StructuredLLMResult:
        ...
