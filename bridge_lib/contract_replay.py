"""Replay saved bridge diagnostics against their hard contracts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from bridge_lib.contracts import SubstrateGateDecision

_ACTION_SCHEMAS: dict[str, type[BaseModel]] = {
    "substrate-gate": SubstrateGateDecision,
}


def _raw_text_from_diagnostic(diagnostic: dict[str, Any]) -> str:
    raw_text = (
        diagnostic.get("bridge", {})
        .get("parsed", {})
        .get("diagnostic", {})
        .get("raw_text")
    )
    return raw_text if isinstance(raw_text, str) else ""


def replay_bridge_diagnostic(path: str | Path) -> dict[str, Any]:
    diagnostic_path = Path(path)
    try:
        diagnostic = json.loads(diagnostic_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        return {
            "ok": False,
            "path": str(diagnostic_path),
            "error": "file-not-found",
            "message": str(exc),
        }
    except PermissionError as exc:
        return {
            "ok": False,
            "path": str(diagnostic_path),
            "error": "permission-denied",
            "message": str(exc),
        }
    except OSError as exc:
        return {
            "ok": False,
            "path": str(diagnostic_path),
            "error": "diagnostic-read-failed",
            "message": str(exc),
        }
    except json.JSONDecodeError as exc:
        return {
            "ok": False,
            "path": str(diagnostic_path),
            "error": "diagnostic-json-malformed",
            "message": str(exc),
        }

    action = str(diagnostic.get("action") or "")
    schema = _ACTION_SCHEMAS.get(action)
    base = {
        "ok": False,
        "path": str(diagnostic_path),
        "diagnostic_id": diagnostic.get("id"),
        "action": action,
        "schema": schema.__name__ if schema else None,
    }
    if not schema:
        return {**base, "error": "unsupported-action"}

    raw_text = _raw_text_from_diagnostic(diagnostic).strip()
    if not raw_text:
        return {**base, "error": "raw-text-missing"}

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        return {
            **base,
            "error": "raw-json-malformed",
            "message": str(exc),
            "raw_text_length": len(raw_text),
        }
    if not isinstance(payload, dict):
        return {
            **base,
            "error": "raw-json-not-object",
            "raw_text_length": len(raw_text),
        }

    try:
        parsed = schema.model_validate(payload)
    except ValidationError as exc:
        return {
            **base,
            "error": "schema-validation-failed",
            "validation_errors": exc.errors(),
            "raw_text_length": len(raw_text),
        }

    return {
        **base,
        "ok": True,
        "error": None,
        "parsed": parsed.model_dump(),
        "raw_text_length": len(raw_text),
    }
