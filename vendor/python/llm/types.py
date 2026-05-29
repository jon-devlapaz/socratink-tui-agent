"""Request / result / usage types for the LLM seam.

These are the contract between application code and any LLM provider.
The application sees only these shapes, never provider-native objects.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel


@dataclass(frozen=True)
class StructuredLLMRequest:
    """A request for a validated cognitive artifact.

    The application asks for a Pydantic model; the adapter returns one
    or raises a normalized error. The application never sees raw text
    unless it explicitly inspects ``StructuredLLMResult.raw_text``.
    """

    system_prompt: str
    user_prompt: str
    response_schema: type[BaseModel]
    temperature: float = 0.0
    max_retries: int = 2
    task_name: str | None = None
    prompt_version: str | None = None

    def __post_init__(self) -> None:
        if self.max_retries < 0:
            raise ValueError(f"max_retries cannot be negative (got {self.max_retries})")


@dataclass(frozen=True)
class TokenUsage:
    """Provider-agnostic token usage."""

    input_tokens: int
    output_tokens: int


@dataclass(frozen=True)
class StructuredLLMResult:
    """A validated cognitive artifact, plus the metadata to debug it.

    ``parsed`` is already a Pydantic instance of the requested schema.
    ``raw_text`` is preserved for logging and golden-fixture refresh.
    ``raw_provider_metadata`` is an escape hatch — provider-specific data
    that would otherwise pollute the normalized shape.
    """

    parsed: BaseModel
    raw_text: str
    usage: TokenUsage
    model: str
    provider: str
    latency_ms: float
    raw_provider_metadata: dict[str, Any] | None = None
