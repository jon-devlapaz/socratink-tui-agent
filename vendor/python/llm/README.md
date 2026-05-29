# llm/

The LLM seam. The single place provider SDKs live. Everything outside
`llm/` consumes `LLMClient` + the normalized request/result types and is
forbidden from importing a provider SDK directly.

## Public surface

Import from `llm` directly. Submodules are implementation detail.

| Export | What it is |
| :--- | :--- |
| `LLMClient` | Owns retry, telemetry, and the call-once contract. Wraps an `LLMAdapter`. |
| `build_llm_client(api_key=None)` | Factory. Reads `LLM_PROVIDER` (default `"gemini"`) and `LLM_MODEL`. Optional per-call `api_key` override. |
| `StructuredLLMRequest` | Input: prompt, response schema, generation config. |
| `StructuredLLMResult` | Output: `parsed` (instance of `request.response_schema`, never a dict), `usage`, `latency_ms`. |
| `TokenUsage` | `input_tokens`, `output_tokens`, `total_tokens`. Provider-normalized. |
| `LLMError` (+ subclasses) | Normalized exception hierarchy. Subclasses: `LLMClientError`, `LLMMissingKeyError`, `LLMRateLimitError`, `LLMServiceError`, `LLMValidationError`, `RetriableLLMError`. |

## Files

| File | Role |
| :--- | :--- |
| `__init__.py` | Public API surface. The only thing app code imports from. |
| `client.py` | `LLMClient`: retry policy, telemetry, the call-once orchestrator. |
| `factory.py` | `build_llm_client`: provider/model resolution from env. |
| `adapter.py` | `LLMAdapter` Protocol. Every provider implements `call_once`. |
| `gemini_adapter.py` | The **only** file allowed to import the Gemini SDK. |
| `types.py` | `StructuredLLMRequest`, `StructuredLLMResult`, `TokenUsage`. |
| `errors.py` | Normalized exception hierarchy. |

## Architectural rules (load-bearing)

- **Provider SDKs are isolated to adapter modules.** `google.genai` may be
  imported only from `llm/gemini_adapter.py`. There is an **architectural
  isolation test** that fails CI if any other module imports the Gemini SDK
  directly. Do not move the import to satisfy a refactor.
- **Adapters don't retry, don't log, don't cache.** `LLMClient` owns those.
  Adapters do one thing: translate request → SDK call → result (or normalized
  error). See the `LLMAdapter` docstring in `adapter.py`.
- **`StructuredLLMResult.parsed` is a model instance, not a dict.** Adapters
  call the response_schema constructor before returning. App code should be
  able to write `result.parsed.field` without a json-parse step.
- **Exceptions are normalized at the adapter, not the client.** Provider
  exceptions (`google.api_core.exceptions`, raw HTTP errors, etc.) must be
  translated into `LLMError` subclasses before leaving the adapter.

## Footguns

- **`LLM_PROVIDER` defaults to `"gemini"`; nothing else is implemented yet.**
  The factory raises `NotImplementedError` for any other value. Don't add a
  provider by editing `factory.py` only — add the adapter, wire the env, and
  add isolation tests for the new SDK.
- **Per-stage provider overrides are NOT implemented.** `LLM_PROVIDER_<STAGE>`
  env vars are documented as planned but ignored. The factory uses one global
  default.
- **Schema validation happens in the adapter.** If the provider returns
  unparseable JSON or a payload that doesn't match `response_schema`, the
  adapter raises `LLMValidationError`. App-side code should not re-validate.
- **Retry config is owned by `LLMClient`, not exposed to callers.** The
  retry policy is intentionally one-size for the MVP. Don't expose it as a
  knob to bypass the centralized policy.

## Related

- Tests: `tests/test_llm_client.py`, `tests/test_gemini_adapter.py`, `tests/test_llm_factory.py`, `tests/test_extract_route_error_mapping.py`.
- Env contract: `GEMINI_API_KEY` is the only required value when `LLM_PROVIDER=gemini`. `LLM_MODEL` defaults to `gemini-2.5-flash`.
- Architectural isolation test enforces: no Gemini SDK import outside `gemini_adapter.py`.
