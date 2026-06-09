"""Canonical-input lookup table for fake bridge VCR stub."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from bridge_lib.fake.response import TEMPLATE_TO_ACTION, build_response_from_expect

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
EVALS_ROOT = WORKSPACE_ROOT / "evals" / "prompts"
GOLDEN_REPAIR_DIALOGUE = (
    WORKSPACE_ROOT / "fixtures" / "bridge_vcr" / "golden_repair_dialogue.json"
)
PROMOTED_REPAIR_DIALOGUE = (
    WORKSPACE_ROOT / "fixtures" / "bridge_vcr" / "promoted_repair_dialogue.jsonl"
)
INTEGRATION_REPAIR_DIALOGUE = (
    WORKSPACE_ROOT / "fixtures" / "bridge_vcr" / "integration_repair_dialogue.jsonl"
)

ACTION_KEY_FIELDS: dict[str, tuple[str, ...]] = {
    "repair-dialogue": (
        "node_label",
        "node_mechanism",
        "gap_id",
        "missing_operation",
        "before",
        "after",
        "learner_text",
        "turn_index",
    ),
    "evaluate-attempt": (
        "node_id",
        "node_label",
        "node_mechanism",
        "learner_text",
        "drill_mode",
        "repair_drill_context",
        "knowledge_map",
    ),
    "generate-route": ("concept",),
    "substrate-gate": (
        "concept",
        "launch_attempt",
        "substrate_refinement",
        "seed_already_offered",
    ),
    "repair-scaffold": (
        "node_label",
        "node_mechanism",
        "learner_text",
        "gap_description",
        "evidence_goal",
        "blank_hint",
        "is_misconception",
    ),
    "socratic-repair-drill": (
        "node_label",
        "repair_target",
        "hinge_focus",
        "contrast_prompt",
        "before",
        "missing_operation",
        "after",
        "learner_text",
        "question_style",
    ),
}


def canonical_payload(action: str, request: dict[str, Any]) -> dict[str, Any]:
    fields = ACTION_KEY_FIELDS.get(action)
    if fields is None:
        raise ValueError(f"unknown fake lookup action: {action}")
    result: dict[str, Any] = {}
    for field in fields:
        if field not in request:
            continue
        value = request[field]
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        if field == "turn_index":
            value = int(value)
        elif field == "seed_already_offered":
            value = bool(value)
        elif field == "is_misconception":
            value = bool(value)
        elif field == "knowledge_map" and value == {}:
            result[field] = value
            continue
        result[field] = value
    return result


def stable_key(action: str, request: dict[str, Any]) -> str:
    canonical = canonical_payload(action, request)
    normalized = json.dumps(canonical, sort_keys=True, ensure_ascii=True)
    return f"{action}:{normalized}"


LookupTable = dict[str, dict[str, Any]]


def _register_row(
    table: LookupTable,
    *,
    action: str,
    request: dict[str, Any],
    expect: dict[str, Any],
    source: str,
) -> None:
    key = stable_key(action, request)
    row = {
        "action": action,
        "input": request,
        "expect": expect,
        "source": source,
    }
    existing = table.get(key)
    if existing is not None and existing["expect"] != expect:
        raise ValueError(
            f"duplicate lookup key with differing expect ({source} vs {existing['source']}): {key}"
        )
    table[key] = row


def _load_eval_cases(table: LookupTable) -> None:
    for cases_path in sorted(EVALS_ROOT.glob("*/cases.jsonl")):
        for line in cases_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            case = json.loads(stripped)
            template = str(case.get("template") or "")
            action = TEMPLATE_TO_ACTION.get(template)
            if action is None:
                continue
            request = dict(case["input"])
            expect = dict(case["expect"])
            _register_row(
                table,
                action=action,
                request=request,
                expect=expect,
                source=str(cases_path),
            )


def _load_golden_repair_dialogue(table: LookupTable) -> None:
    if not GOLDEN_REPAIR_DIALOGUE.exists():
        return
    rows = json.loads(GOLDEN_REPAIR_DIALOGUE.read_text(encoding="utf-8"))
    for row in rows:
        _register_row(
            table,
            action=str(row["action"]),
            request=dict(row["input"]),
            expect=dict(row["expect"]),
            source=str(GOLDEN_REPAIR_DIALOGUE),
        )


def _load_promoted_repair_dialogue(table: LookupTable) -> None:
    if not PROMOTED_REPAIR_DIALOGUE.exists():
        return
    for line in PROMOTED_REPAIR_DIALOGUE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        row = json.loads(stripped)
        _register_row(
            table,
            action=str(row["action"]),
            request=dict(row["input"]),
            expect=dict(row["expect"]),
            source=str(PROMOTED_REPAIR_DIALOGUE),
        )


def _load_integration_repair_dialogue(table: LookupTable) -> None:
    if not INTEGRATION_REPAIR_DIALOGUE.exists():
        return
    for line in INTEGRATION_REPAIR_DIALOGUE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        row = json.loads(stripped)
        _register_row(
            table,
            action=str(row["action"]),
            request=dict(row["input"]),
            expect=dict(row["expect"]),
            source=str(INTEGRATION_REPAIR_DIALOGUE),
        )


def build_lookup() -> LookupTable:
    table: LookupTable = {}
    _load_eval_cases(table)
    _load_golden_repair_dialogue(table)
    _load_promoted_repair_dialogue(table)
    _load_integration_repair_dialogue(table)
    return table


def lookup_fake_response(
    table: LookupTable,
    action: str,
    request: dict[str, Any],
) -> dict[str, Any] | None:
    key = stable_key(action, request)
    row = table.get(key)
    if row is None:
        return None
    return build_response_from_expect(action, row["expect"], request)
