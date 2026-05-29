"""L2 prompt evals: repair_dialogue judge routing fields (fake mode, CI gate)."""

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

CASES_PATH = (
    WORKSPACE_ROOT / "evals" / "prompts" / "repair_dialogue" / "cases.jsonl"
)
ROUTING_FIELDS = frozenset(
    {
        "bridge_ready",
        "next_action",
        "next_dialogue_action",
        "graph_neutral",
        "score_eligible",
        "contract_version",
        "progression_state",
    }
)
FORBIDDEN_EXPECT_KEYS = frozenset(
    {"final_node_state", "solidified", "classification"}
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
    yield
    os.environ.pop("SOCRATINK_TUI_FAKE_LLM", None)


def _assert_versions(case: dict[str, Any]) -> None:
    tmpl = prompt_templates.TEMPLATES["repair_dialogue"]
    assert case["template"] == "repair_dialogue"
    assert case["prompt_version"] == tmpl["version"]
    assert case["contract_version"] == "repair-dialogue-v2"


def _assert_expectations(case: dict[str, Any], judge: dict[str, Any]) -> None:
    expect = case["expect"]
    unknown = set(expect) - ROUTING_FIELDS
    assert not unknown, f"{case['case_id']}: unexpected expect keys {unknown}"
    forbidden = set(expect) & FORBIDDEN_EXPECT_KEYS
    assert not forbidden, f"{case['case_id']}: must not assert {forbidden}"
    for key, expected in expect.items():
        actual = judge.get(key)
        assert actual == expected, (
            f"{case['case_id']}.{key}: got {actual!r}, want {expected!r}"
        )


@pytest.mark.parametrize(
    "case",
    PROMPT_EVAL_CASES,
    ids=[case["case_id"] for case in PROMPT_EVAL_CASES],
)
def test_repair_dialogue_prompt_eval_case(case: dict[str, Any]) -> None:
    _assert_versions(case)
    payload = bridge.judge_repair_dialogue(case["input"])
    judge = payload["repair_dialogue"]
    assert isinstance(judge, dict)
    _assert_expectations(case, judge)


def test_prompt_eval_cases_pin_template_version() -> None:
    version = prompt_templates.TEMPLATES["repair_dialogue"]["version"]
    for case in PROMPT_EVAL_CASES:
        assert case["prompt_version"] == version
