"""L2 prompt evals: substrate_gate routing fields (fake mode, CI gate)."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import pytest

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE_ROOT))

import bridge
import prompt_templates

CASES_PATH = WORKSPACE_ROOT / "evals" / "prompts" / "substrate_gate" / "cases.jsonl"
ROUTING_FIELDS = frozenset(
    {
        "classification",
        "substrate_adequate",
        "graph_neutral",
        "score_eligible",
        "seed_text_present",
        "refinement_prompt_present",
    }
)
FORBIDDEN_EXPECT_KEYS = frozenset(
    {"final_node_state", "solidified", "cold_attempt", "classification_score"}
)


def _load_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for line in CASES_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped:
            cases.append(json.loads(stripped))
    if not cases:
        raise ValueError(f"no cases found in {CASES_PATH}")
    return cases


PROMPT_EVAL_CASES = _load_cases()


@pytest.fixture(autouse=True)
def fake_llm() -> None:
    os.environ["SOCRATINK_TUI_FAKE_LLM"] = "1"
    os.environ.pop("SOCRATINK_TUI_FAKE_SUBSTRATE_CLASSIFICATION", None)
    yield
    os.environ.pop("SOCRATINK_TUI_FAKE_LLM", None)
    os.environ.pop("SOCRATINK_TUI_FAKE_SUBSTRATE_CLASSIFICATION", None)


def _assert_versions(case: dict[str, Any]) -> None:
    tmpl = prompt_templates.TEMPLATES["substrate_gate"]
    assert case["template"] == "substrate_gate"
    assert case["prompt_version"] == tmpl["version"]
    assert case["contract_version"] == "substrate-gate-v1"


def _actual_field(decision: dict[str, Any], key: str) -> Any:
    if key == "seed_text_present":
        return bool(decision.get("seed_text"))
    if key == "refinement_prompt_present":
        return bool(decision.get("refinement_prompt"))
    return decision.get(key)


def _assert_expectations(case: dict[str, Any], decision: dict[str, Any]) -> None:
    expect = case["expect"]
    unknown = set(expect) - ROUTING_FIELDS
    assert not unknown, f"{case['case_id']}: unexpected expect keys {unknown}"
    forbidden = set(expect) & FORBIDDEN_EXPECT_KEYS
    assert not forbidden, f"{case['case_id']}: must not assert {forbidden}"
    for key, expected in expect.items():
        actual = _actual_field(decision, key)
        assert actual == expected, (
            f"{case['case_id']}.{key}: got {actual!r}, want {expected!r}"
        )


@pytest.mark.parametrize(
    "case",
    PROMPT_EVAL_CASES,
    ids=[case["case_id"] for case in PROMPT_EVAL_CASES],
)
def test_substrate_gate_prompt_eval_case(case: dict[str, Any]) -> None:
    _assert_versions(case)
    payload = bridge.substrate_gate(case["input"])
    decision = payload["substrate_gate"]
    assert isinstance(decision, dict)
    _assert_expectations(case, decision)


def test_prompt_eval_cases_pin_template_version() -> None:
    version = prompt_templates.TEMPLATES["substrate_gate"]["version"]
    for case in PROMPT_EVAL_CASES:
        assert case["prompt_version"] == version
