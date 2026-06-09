"""Lookup table coverage for fake bridge VCR stub."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE_ROOT))

from bridge_lib.fake.lookup import build_lookup, lookup_fake_response, stable_key


def test_build_lookup_loads_without_duplicate_conflicts() -> None:
    table = build_lookup()
    assert len(table) >= 30


def test_lookup_returns_bridge_ready_for_immune_memory_keyword_case() -> None:
    table = build_lookup()
    request = {
        "node_label": "Immune memory",
        "node_mechanism": "A vaccine safely presents antigen and memory cells remain.",
        "gap_id": "gap-1",
        "missing_operation": "durable immune change",
        "before": "A safe preview presents antigen.",
        "after": "Later response is faster.",
        "learner_text": "memory cells remain and respond faster later",
        "turn_index": 1,
    }
    out = lookup_fake_response(table, "repair-dialogue", request)
    assert out is not None
    assert out["repair_dialogue"]["bridge_ready"] is True
    assert out["repair_dialogue"]["next_dialogue_action"] == "commit_repair"


def test_lookup_fixture_golden_circular_repair_turns() -> None:
    table = build_lookup()
    turn1 = {
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
    }
    turn2 = {
        **turn1,
        "learner_text": (
            "The preview leaves memory cells behind, so a later antigen match "
            "can trigger a faster response."
        ),
        "turn_index": 2,
    }
    out1 = lookup_fake_response(table, "repair-dialogue", turn1)
    out2 = lookup_fake_response(table, "repair-dialogue", turn2)
    assert out1 is not None and out1["repair_dialogue"]["bridge_ready"] is False
    assert out2 is not None and out2["repair_dialogue"]["bridge_ready"] is True


def test_lookup_evaluator_solid_case() -> None:
    table = build_lookup()
    request = {
        "node_id": "c1_s1",
        "node_label": "Cache hit path",
        "node_mechanism": (
            "The first request computes and stores the result; later identical "
            "requests read from cache and return faster."
        ),
        "learner_text": (
            "On the first request the server computes the answer and stores it; "
            "when the same request comes again it reads that stored result "
            "instead of recomputing, so the later response is faster."
        ),
        "drill_mode": "cold_attempt",
        "repair_drill_context": None,
        "knowledge_map": {},
    }
    out = lookup_fake_response(table, "evaluate-attempt", request)
    assert out is not None
    assert out["evaluation"]["classification"] == "solid"


def test_stable_key_ignores_log_raw_llm_fields() -> None:
    base = {
        "node_label": "Immune memory",
        "node_mechanism": "Antigen preview then memory.",
        "gap_id": "gap-1",
        "missing_operation": "selection and memory",
        "before": "Before state.",
        "after": "After state.",
        "learner_text": "before state and after state without the step",
        "turn_index": 2,
    }
    with_extra = {**base, "log_raw_llm": True}
    assert stable_key("repair-dialogue", base) == stable_key(
        "repair-dialogue", with_extra
    )
