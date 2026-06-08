"""Contract hardening tests for repair dialogue judge output."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE_ROOT))

import bridge
import prompt_templates


def test_fake_repair_dialogue_includes_v2_contract_fields() -> None:
    os.environ["SOCRATINK_TUI_FAKE_LLM"] = "1"
    try:
        payload = bridge.judge_repair_dialogue(
            {
                "node_label": "Immune memory",
                "node_mechanism": "A vaccine safely presents antigen and memory cells remain.",
                "gap_id": "gap-1",
                "missing_operation": "durable immune change",
                "before": "A safe preview presents antigen.",
                "after": "Later response is faster.",
                "learner_text": "memory cells remain and respond faster later",
                "turn_index": 1,
            }
        )
    finally:
        os.environ.pop("SOCRATINK_TUI_FAKE_LLM", None)

    judge = payload["repair_dialogue"]
    assert judge["contract_version"] == "repair-dialogue-v2"
    assert judge["next_action"] in {
        "commit_repair",
        "resume_repair",
        "recover_once",
        "abandon",
    }
    assert judge["progression_state"] in {"no_change", "improved", "ready"}
    assert isinstance(judge["improvement_observed"], bool)
    assert isinstance(judge["improvement_note"], str)
    assert judge["improvement_note"]


def test_fake_repair_dialogue_accepts_confounder_bridge() -> None:
    os.environ["SOCRATINK_TUI_FAKE_LLM"] = "1"
    try:
        payload = bridge.judge_repair_dialogue(
            {
                "node_label": "Immune memory",
                "node_mechanism": "Preview then later response.",
                "gap_id": "gap-1",
                "missing_operation": "confounder",
                "before": "Two variables rise together.",
                "after": "Causation is not implied.",
                "learner_text": (
                    "Hot weather is the confounder: correlation does not imply causation."
                ),
                "turn_index": 2,
            }
        )
    finally:
        os.environ.pop("SOCRATINK_TUI_FAKE_LLM", None)

    judge = payload["repair_dialogue"]
    assert judge["bridge_ready"] is True
    assert judge["next_action"] == "commit_repair"


def test_normalize_repair_dialogue_maps_ready_to_commit() -> None:
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
    assert normalized.progression_state == "ready"
    assert normalized.improvement_observed is True


def test_fake_route_varies_first_node_by_concept() -> None:
    os.environ["SOCRATINK_TUI_FAKE_LLM"] = "1"
    try:
        vaccine = bridge.generate_route(
            {"concept": "Vaccines", "launch_attempt": "A safe preview trains response."}
        )
        cache = bridge.generate_route(
            {"concept": "Caching in APIs", "launch_attempt": "Store then reuse result."}
        )
        immune_memory = bridge.generate_route(
            {
                "concept": "Immune memory",
                "launch_attempt": "Vaccines train a faster later response.",
            }
        )
    finally:
        os.environ.pop("SOCRATINK_TUI_FAKE_LLM", None)

    v_node = vaccine["first_node"]
    c_node = cache["first_node"]
    im_node = immune_memory["first_node"]
    assert v_node["label"] != c_node["label"]
    assert v_node["mechanism"] != c_node["mechanism"]
    assert im_node["label"] == "Immune memory"
    assert "cache" not in im_node["mechanism"].lower()


def test_fake_route_immune_memory_not_cache() -> None:
    from bridge_fake_defaults import fake_map_uses_cache_route

    assert fake_map_uses_cache_route("immune memory") is False
    assert fake_map_uses_cache_route("caching in apis") is True
    assert fake_map_uses_cache_route("memoization layer") is True


def test_fake_mode_validates_prompt_template_slots() -> None:
    os.environ["SOCRATINK_TUI_FAKE_LLM"] = "1"
    original_dynamic: dict[str, Any] = dict(prompt_templates.TEMPLATES["evaluator"]["dynamic"])
    prompt_templates.TEMPLATES["evaluator"]["dynamic"] = {
        **original_dynamic,
        "required_probe": "{nonexistent_required_field}",
    }
    try:
        try:
            bridge.evaluate_attempt(
                {
                    "node_id": "n1",
                    "node_label": "Cache hit path",
                    "node_mechanism": "Store then reuse",
                    "learner_text": "Cache hit returns faster",
                    "drill_mode": "cold_attempt",
                }
            )
            assert False, "expected fake mode to validate template slots"
        except KeyError as exc:
            assert str(exc) == "'nonexistent_required_field'"
    finally:
        prompt_templates.TEMPLATES["evaluator"]["dynamic"] = original_dynamic
        os.environ.pop("SOCRATINK_TUI_FAKE_LLM", None)
