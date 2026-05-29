"""Public API for the LLM seam.

Application code imports everything it needs from ``llm`` directly.
Submodules (``types``, ``errors``, ``adapter``, ``client``, ``gemini_adapter``,
``factory``) are implementation detail; importing from them outside of
``llm/`` itself is discouraged. The architectural isolation test enforces
that the Gemini SDK is only imported in ``llm/gemini_adapter.py``.
"""
from .client import LLMClient
from .errors import (
    LLMClientError,
    LLMError,
    LLMMissingKeyError,
    LLMRateLimitError,
    LLMServiceError,
    LLMValidationError,
    RetriableLLMError,
)
from .factory import build_llm_client
from .types import StructuredLLMRequest, StructuredLLMResult, TokenUsage

__all__ = [
    "LLMClient",
    "LLMClientError",
    "LLMError",
    "LLMMissingKeyError",
    "LLMRateLimitError",
    "LLMServiceError",
    "LLMValidationError",
    "RetriableLLMError",
    "StructuredLLMRequest",
    "StructuredLLMResult",
    "TokenUsage",
    "build_llm_client",
]
