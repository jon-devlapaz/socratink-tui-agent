"""Direct tests for bridge fake helpers and contract objects."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE_ROOT))
REGISTRY_PATH = WORKSPACE_ROOT / "lib" / "bridge" / "registry.json"

import prompt_templates


def _evaluation_request() -> dict[str, Any]:
    return {
        "node_id": "n1",
        "node_label": "Cache hit path",
        "node_mechanism": "Store then reuse",
        "learner_text": "Cache hit returns faster",
        "drill_mode": "cold_attempt",
    }


def _repair_request() -> dict[str, Any]:
    return {
        "node_label": "Immune memory",
        "node_mechanism": "A vaccine safely presents antigen and memory cells remain.",
        "gap_id": "gap-1",
        "missing_operation": "durable immune change",
        "before": "A safe preview presents antigen.",
        "after": "Later response is faster.",
        "learner_text": "memory cells remain and respond faster later",
        "turn_index": 1,
        "gap_description": "what changes during immune memory",
        "evidence_goal": "Explain immune memory.",
        "blank_hint": "Name what remains.",
    }


def test_fake_route_and_evaluator_helpers_are_importable_directly() -> None:
    from bridge_fake import (
        fake_map_uses_cache_route,
        has_fake_causal_chain,
        is_fake_fluent_shallow,
    )

    solid = (
        "On the first request the server computes and stores it; when the same "
        "request comes again it reads that stored result instead of recomputing, "
        "so the later response is faster."
    )
    shallow = (
        "Caching is a common performance optimization that stores data for "
        "faster retrieval and improved response times in distributed web systems."
    )

    assert fake_map_uses_cache_route("immune memory") is False
    assert fake_map_uses_cache_route("caching in apis") is True
    assert has_fake_causal_chain(solid) is True
    assert is_fake_fluent_shallow(shallow) is True
    assert has_fake_causal_chain(shallow) is False


def test_fake_substrate_gate_helper_covers_fast_slow_and_minimal() -> None:
    from bridge_fake import fake_substrate_gate

    fast = fake_substrate_gate(
        {
            "concept": "Immune memory",
            "launch_attempt": "Vaccines give a safe preview so later response is faster.",
        }
    )["substrate_gate"]
    slow = fake_substrate_gate(
        {
            "concept": "Immune memory",
            "launch_attempt": "I don't know.",
        }
    )["substrate_gate"]
    minimal = fake_substrate_gate(
        {
            "concept": "Immune memory",
            "launch_attempt": "I don't know.",
            "substrate_refinement": "unsure",
            "seed_already_offered": True,
        }
    )["substrate_gate"]

    assert fast["classification"] == "fast"
    assert fast["substrate_adequate"] is True
    assert slow["classification"] == "slow"
    assert slow["seed_text"]
    assert slow["refinement_prompt"]
    assert minimal["classification"] == "minimal"
    assert minimal["substrate_adequate"] is False
    assert minimal["graph_neutral"] is True
    assert minimal["score_eligible"] is False


def test_fake_evaluation_direct_helper_keeps_template_slot_validation() -> None:
    from bridge_fake import fake_evaluation

    original_dynamic: dict[str, Any] = dict(
        prompt_templates.TEMPLATES["evaluator"]["dynamic"]
    )
    prompt_templates.TEMPLATES["evaluator"]["dynamic"] = {
        **original_dynamic,
        "required_probe": "{nonexistent_required_field}",
    }
    try:
        with pytest.raises(KeyError, match="nonexistent_required_field"):
            fake_evaluation(_evaluation_request())
    finally:
        prompt_templates.TEMPLATES["evaluator"]["dynamic"] = original_dynamic


def test_fake_scaffold_and_dialogue_helpers_are_importable_directly() -> None:
    from bridge_fake import (
        fake_repair_dialogue,
        fake_repair_scaffold,
        fake_socratic_repair_drill,
    )

    request = _repair_request()

    scaffold = fake_repair_scaffold(request)
    assert scaffold["repair_scaffold"]["hinge_focus"]
    assert scaffold["llm_call"]["provider"] == "fake"

    drill = fake_socratic_repair_drill(
        {
            "before": request["before"],
            "after": request["after"],
            "hinge_focus": "memory cells remain",
            "contrast_prompt": "First antigen preview versus later exposure.",
            "question_style": "direct",
        }
    )
    assert drill["socratic_question"]
    assert drill["llm_call"]["model"] == "fake-socratic-repair-drill"

    dialogue = fake_repair_dialogue(request)
    judge = dialogue["repair_dialogue"]
    assert judge["graph_neutral"] is True
    assert judge["score_eligible"] is False
    assert judge["bridge_ready"] is True


def test_fake_repair_helpers_keep_template_slot_validation() -> None:
    from bridge_fake import (
        fake_repair_dialogue,
        fake_repair_scaffold,
        fake_socratic_repair_drill,
    )

    request = _repair_request()
    original_delta: dict[str, Any] = dict(prompt_templates.TEMPLATES["delta"]["dynamic"])
    original_drill: dict[str, Any] = dict(
        prompt_templates.TEMPLATES["socratic_repair_drill"]["dynamic"]
    )
    original_dialogue: dict[str, Any] = dict(
        prompt_templates.TEMPLATES["repair_dialogue"]["dynamic"]
    )
    try:
        prompt_templates.TEMPLATES["delta"]["dynamic"] = {
            **original_delta,
            "required_probe": "{nonexistent_delta_field}",
        }
        with pytest.raises(KeyError, match="nonexistent_delta_field"):
            fake_repair_scaffold(request)

        prompt_templates.TEMPLATES["repair_dialogue"]["dynamic"] = {
            **original_dialogue,
            "required_probe": "{nonexistent_dialogue_field}",
        }
        with pytest.raises(KeyError, match="nonexistent_dialogue_field"):
            fake_repair_dialogue(request)

        prompt_templates.TEMPLATES["socratic_repair_drill"]["dynamic"] = {
            **original_drill,
            "required_probe": "{nonexistent_drill_field}",
        }
        with pytest.raises(KeyError, match="nonexistent_drill_field"):
            fake_socratic_repair_drill(
                {
                    **request,
                    "repair_target": "name the missing process",
                    "hinge_focus": "memory cells remain",
                    "contrast_prompt": "First antigen preview versus later exposure.",
                    "question_style": "direct",
                }
            )
    finally:
        prompt_templates.TEMPLATES["delta"]["dynamic"] = original_delta
        prompt_templates.TEMPLATES["socratic_repair_drill"]["dynamic"] = original_drill
        prompt_templates.TEMPLATES["repair_dialogue"]["dynamic"] = original_dialogue


def test_contract_module_normalizes_ready_dialogue() -> None:
    from bridge_contracts import RepairDialogueJudge, normalize_repair_dialogue_judge

    judge = RepairDialogueJudge(
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

    normalized = normalize_repair_dialogue_judge(judge)

    assert normalized.next_action == "commit_repair"
    assert normalized.progression_state == "ready"
    assert normalized.improvement_observed is True


def test_registry_repair_dialogue_fields_match_contract_module() -> None:
    from bridge_contracts import RepairDialogueJudge

    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    fields = registry["actions"]["repair-dialogue"]["response"][
        "repair_dialogue_fields"
    ]

    assert fields == list(RepairDialogueJudge.model_fields)
