"""Registry post_call_hooks must match bridge normalizer behavior."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = WORKSPACE_ROOT / "lib" / "bridge" / "registry.json"
VENDOR_PYTHON_ROOT = WORKSPACE_ROOT / "vendor" / "python"

sys.path.insert(0, str(WORKSPACE_ROOT))
sys.path.insert(0, str(VENDOR_PYTHON_ROOT))

import ai_service
import bridge


def _load_registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text())


def test_registry_post_call_hooks_exist() -> None:
    registry = _load_registry()
    assert "post_call_hooks" in registry
    assert "evaluate-attempt" in registry["post_call_hooks"]
    assert "repair-dialogue" in registry["post_call_hooks"]


def test_repair_dialogue_hook_invariant_bridge_ready() -> None:
    registry = _load_registry()
    hook = registry["post_call_hooks"]["repair-dialogue"]
    assert hook["function"] == "bridge._normalize_repair_dialogue_judge"

    judge = bridge.RepairDialogueJudge(
        classification="strong",
        score_eligible=False,
        graph_neutral=True,
        support_level="probe",
        causal_link_present=True,
        missing_operation_addressed=True,
        echo_risk=False,
        bridge_ready=True,
        next_dialogue_action="probe_again",
        judge_reason="ready",
        next_prompt="",
        not_mastery_reason="not mastery",
    )
    normalized = bridge._normalize_repair_dialogue_judge(judge)
    assert normalized.next_action == "commit_repair"
    assert normalized.next_dialogue_action == "commit_repair"
    assert normalized.progression_state == "ready"


def test_evaluate_attempt_hook_normalizes_substantive_cold() -> None:
    registry = _load_registry()
    hook = registry["post_call_hooks"]["evaluate-attempt"]
    assert hook["function"] == "bridge._normalize_tui_evaluation"

    evaluation = ai_service.DrillEvaluation(
        agent_response="Good start — keep going.",
        generative_commitment=False,
        answer_mode="help_request",
        score_eligible=False,
        classification=None,
        routing="SCAFFOLD",
        gap_description="Learner produced zero schema; nudge to guess.",
    )
    learner_text = (
        "Plants take in CO2 and water and use sunlight to make sugar "
        "and release oxygen."
    )
    normalized = bridge._normalize_tui_evaluation(
        evaluation,
        drill_mode="cold_attempt",
        learner_text=learner_text,
    )
    assert normalized.score_eligible is True
    assert normalized.classification == "shallow"
    assert normalized.answer_mode == "attempt"


def test_evaluate_attempt_hook_keeps_non_substantive_help() -> None:
    evaluation = ai_service.DrillEvaluation(
        agent_response="Try one rough causal guess in your own words.",
        score_eligible=False,
        classification=None,
        routing="SCAFFOLD",
    )
    normalized = bridge._normalize_tui_evaluation(
        evaluation,
        drill_mode="cold_attempt",
        learner_text="I'm not sure",
    )
    assert normalized.score_eligible is False
    assert normalized.answer_mode == "help_request"
    assert normalized.classification is None
