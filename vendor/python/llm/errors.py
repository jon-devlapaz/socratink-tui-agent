"""Normalized exception hierarchy for the LLM seam.

Application code catches these. Adapter code raises these. The mapping
from provider-specific exceptions to these lives inside each adapter.

Retry contract is encoded in the type system via ``RetriableLLMError``:
``LLMClient`` retries any exception that subclasses ``RetriableLLMError``.
Permanent failures (missing key, validation, client-side rejections) do
not subclass it, so adding a new permanent error type cannot accidentally
re-enable retries.
"""
from __future__ import annotations


class LLMError(Exception):
    """Base for all errors raised through the LLM seam."""


class RetriableLLMError(LLMError):
    """Marker base class: ``LLMClient`` retries these with exponential backoff.

    Concrete subclasses represent transient failures where retrying makes
    sense (rate limits clear, upstream services recover). New retriable
    error types should subclass this directly.

    Permanent failures must NOT subclass ``RetriableLLMError``. The retry
    loop catches ``except RetriableLLMError`` exactly, so this is the
    single source of truth for "should LLMClient retry?"
    """


class LLMMissingKeyError(LLMError):
    """The configured provider has no API key. Permanent (not retried)."""


class LLMRateLimitError(RetriableLLMError):
    """The provider rate-limited the request (e.g., Gemini 429). Retried."""


class LLMServiceError(RetriableLLMError):
    """The provider returned a transient transport / upstream failure
    (Gemini 5xx, network timeouts, malformed transport response). Retried.

    Distinct from ``LLMClientError`` (permanent 4xx) and
    ``LLMValidationError`` (provider returned content but it failed
    schema validation).
    """


class LLMClientError(LLMError):
    """A permanent client-side failure: Gemini rejected the request
    (HTTP 4xx other than 429). Causes include expired/invalid API key,
    unknown model name, malformed request, quota exhausted (non-rate-limit).

    NOT retried — retrying a 4xx wastes quota and time. The route layer
    maps this to a 503 to the learner (the cause is
    operator-misconfiguration, not a learner action) and surfaces the
    underlying message to the operator's logs only.
    """


class LLMValidationError(LLMError):
    """The provider returned content but it failed schema validation.

    Distinct from ``LLMServiceError`` — content arrived; it just was not
    shaped like the requested Pydantic model. Carries ``raw_text`` so callers
    can log, record, or refresh fixtures.
    """

    def __init__(self, message: str, *, raw_text: str | None = None):
        super().__init__(message)
        self.raw_text = raw_text
