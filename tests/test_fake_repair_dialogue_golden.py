"""Golden table: fake repair dialogue judge must match promoted trace bridge_ready."""

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

CASES_PATH = WORKSPACE_ROOT / "learning_cases" / "cases.jsonl"

# Explicit regression rows (fixtures + known failure modes from cases.jsonl).
FIXTURE_GOLDEN_ROWS = [
    {
        "label": "circular_repair_script turn 1",
        "request": {
            "node_label": "Immune memory",
            "node_mechanism": (
                "A vaccine safely presents antigen and memory cells remain; "
                "those cells respond faster later."
            ),
            "gap_id": "gap-c1_s1-1",
            "missing_operation": "durable immune change after the preview",
            "before": "A safe preview presents the antigen.",
            "after": "Later response is faster.",
            "learner_text": "The preview helps because it gives a preview.",
            "turn_index": 1,
        },
        "expected_bridge_ready": False,
    },
    {
        "label": "circular_repair_script turn 2",
        "request": {
            "node_label": "Immune memory",
            "node_mechanism": (
                "A vaccine safely presents antigen and memory cells remain; "
                "those cells respond faster later."
            ),
            "gap_id": "gap-c1_s1-1",
            "missing_operation": "durable immune change after the preview",
            "before": "A safe preview presents the antigen.",
            "after": "Later response is faster.",
            "learner_text": (
                "The preview leaves memory cells behind, so a later antigen match "
                "can trigger a faster response."
            ),
            "turn_index": 2,
        },
        "expected_bridge_ready": True,
    },
    {
        "label": "correlation confounder turn 2",
        "request": {
            "node_label": "Correlation vs causation",
            "node_mechanism": "Confounders can make two variables correlate without direct causation.",
            "gap_id": "gap-c1_s1-1",
            "missing_operation": "the causal step that links the before state to the after state",
            "before": "Name what remains after the preview.",
            "after": "The learner reconstructs how immune memory links safe exposure to faster response.",
            "learner_text": (
                "Hot weather is the confounder: summer heat raises swimming and ice cream "
                "demand independently, so the correlation does not imply ice cream causes drowning."
            ),
            "turn_index": 2,
        },
        "expected_bridge_ready": True,
    },
]


def load_cases() -> list[dict[str, Any]]:
    rows = []
    for line in CASES_PATH.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            rows.append(json.loads(line))
    return rows


def load_session(session_log: str) -> dict[str, Any]:
    path = WORKSPACE_ROOT / session_log
    return json.loads(path.read_text(encoding="utf8"))


def gap_context(session: dict[str, Any]) -> tuple[dict[str, Any], str]:
    for event in session.get("events") or []:
        if event.get("type") != "gap_identified":
            continue
        scaffold = event.get("repair_scaffold") or event.get("gap_log") or {}
        gap_id = event.get("gap_id") or scaffold.get("kc_id") or "gap-unknown"
        return scaffold, str(gap_id)
    raise ValueError("gap_identified event with scaffold required")


def judge_request_from_turn(
    session: dict[str, Any],
    turn: dict[str, Any],
    scaffold: dict[str, Any],
    gap_id: str,
) -> dict[str, Any]:
    node = session["route"]["first_node"]
    gap_delta = turn.get("gap_delta") or {}
    return {
        "node_label": node["label"],
        "node_mechanism": node["mechanism"],
        "gap_id": turn.get("gap_id") or gap_id,
        "missing_operation": gap_delta.get("missing_operation") or scaffold["missing_operation"],
        "before": scaffold["before"],
        "after": scaffold["after"],
        "learner_text": turn["text"],
        "turn_index": turn["turn_index"],
    }


def fake_judge_bridge_ready(request: dict[str, Any]) -> bool:
    os.environ["SOCRATINK_TUI_FAKE_LLM"] = "1"
    try:
        payload = bridge.judge_repair_dialogue(request)
    finally:
        os.environ.pop("SOCRATINK_TUI_FAKE_LLM", None)
    return bool(payload["repair_dialogue"]["bridge_ready"])


def promoted_dialogue_rows() -> list[tuple[str, int, dict[str, Any], bool]]:
    rows: list[tuple[str, int, dict[str, Any], bool]] = []
    for case in load_cases():
        invariants = case.get("expected_invariants") or {}
        if not invariants.get("repair_dialogue_turn_count"):
            continue
        session = load_session(case["session_log"])
        scaffold, gap_id = gap_context(session)
        for turn in session.get("events") or []:
            if turn.get("type") != "repair_dialogue_turn":
                continue
            request = judge_request_from_turn(session, turn, scaffold, gap_id)
            rows.append(
                (
                    case["case_id"],
                    int(turn["turn_index"]),
                    request,
                    bool(turn["bridge_ready"]),
                )
            )
    return rows


@pytest.mark.parametrize(
    ("label", "bridge_request", "expected_bridge_ready"),
    [(row["label"], row["request"], row["expected_bridge_ready"]) for row in FIXTURE_GOLDEN_ROWS],
)
def test_fake_repair_dialogue_fixture_golden(
    label: str,
    bridge_request: dict[str, Any],
    expected_bridge_ready: bool,
) -> None:
    assert fake_judge_bridge_ready(bridge_request) is expected_bridge_ready, label


@pytest.mark.parametrize(
    ("case_id", "turn_index", "bridge_request", "expected_bridge_ready"),
    promoted_dialogue_rows(),
    ids=lambda value: (
        f"{value[0]}:turn{value[1]}"
        if isinstance(value, tuple) and len(value) == 4
        else str(value)
    ),
)
def test_fake_repair_dialogue_matches_promoted_trace(
    case_id: str,
    turn_index: int,
    bridge_request: dict[str, Any],
    expected_bridge_ready: bool,
) -> None:
    assert fake_judge_bridge_ready(bridge_request) is expected_bridge_ready, (
        f"{case_id} turn {turn_index}"
    )


def test_fake_repair_dialogue_first_and_last_bridge_ready_shape() -> None:
    """Harness lesson: inner repair gates bridge on last dialogue turn only."""
    rows = {
        (case_id, turn_index): expected
        for case_id, turn_index, _request, expected in promoted_dialogue_rows()
    }
    inner = "inner-repair-dialogue-gates-model-bridge-2026-05-26"
    assert rows[(inner, 1)] is False
    assert rows[(inner, 2)] is True

    cold_help = "cold-help-turn-routing-2026-05-28"
    for turn_index in range(1, 6):
        assert rows[(cold_help, turn_index)] is False

    correlation = "correlation-edge-substantive-cold-2026-05-28"
    assert rows[(correlation, 1)] is False
    assert rows[(correlation, 2)] is True
