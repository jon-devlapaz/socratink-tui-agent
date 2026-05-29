"""LLMClient — wraps an adapter with retry, telemetry, and timing.

This is the public surface application code uses. The application calls
``client.generate_structured(request)`` and gets a ``StructuredLLMResult``
or one of the normalized exceptions from ``llm.errors``.

The adapter does one thing: translate request -> SDK call -> result, or
raise a normalized error. The client does policy: retry on transient
provider failures (rate-limit, service errors), but never retry on
schema-validation or missing-key failures. It also emits a structured
log line per call (success or failure) for telemetry.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, replace

from .adapter import LLMAdapter
from .errors import RetriableLLMError
from .types import StructuredLLMRequest, StructuredLLMResult

logger = logging.getLogger(__name__)


@dataclass
class LLMClient:
    """Application-facing client. Owns retry policy and telemetry."""

    adapter: LLMAdapter

    def generate_structured(self, request: StructuredLLMRequest) -> StructuredLLMResult:
        last_exc: Exception | None = None
        for attempt in range(request.max_retries + 1):
            start = time.perf_counter()
            try:
                result = self.adapter.call_once(request)
            except RetriableLLMError as exc:
                latency_ms = (time.perf_counter() - start) * 1000.0
                self._log_failure(request, exc, attempt=attempt, latency_ms=latency_ms)
                last_exc = exc
                if attempt < request.max_retries:
                    self._sleep_backoff(attempt)
                    continue
                raise
            except Exception as exc:
                latency_ms = (time.perf_counter() - start) * 1000.0
                self._log_failure(request, exc, attempt=attempt, latency_ms=latency_ms)
                raise
            else:
                latency_ms = (time.perf_counter() - start) * 1000.0
                final_result = replace(result, latency_ms=latency_ms)
                self._log_success(request, final_result, attempt=attempt)
                return final_result
        # Defensive — only reachable if max_retries < 0.
        if last_exc is not None:
            raise last_exc
        raise RuntimeError("LLMClient exhausted retries without raising")  # pragma: no cover

    @staticmethod
    def _sleep_backoff(attempt: int) -> None:
        time.sleep(2 ** attempt)

    @staticmethod
    def _log_success(
        request: StructuredLLMRequest,
        result: StructuredLLMResult,
        *,
        attempt: int,
    ) -> None:
        logger.info(
            "llm.call_succeeded",
            extra={
                "task_name": request.task_name,
                "prompt_version": request.prompt_version,
                "provider": result.provider,
                "model": result.model,
                "input_tokens": result.usage.input_tokens,
                "output_tokens": result.usage.output_tokens,
                "latency_ms": result.latency_ms,
                "attempt": attempt,
            },
        )

    @staticmethod
    def _log_failure(
        request: StructuredLLMRequest,
        exc: Exception,
        *,
        attempt: int,
        latency_ms: float,
    ) -> None:
        logger.warning(
            "llm.call_failed",
            extra={
                "task_name": request.task_name,
                "prompt_version": request.prompt_version,
                "error_class": type(exc).__name__,
                "error_message": str(exc),
                "attempt": attempt,
                "latency_ms": latency_ms,
            },
        )
