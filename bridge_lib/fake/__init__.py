"""Thin fake bridge facade: knobs → lookup → defaults."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import prompt_templates

from bridge_lib.fake.defaults import (
    default_evaluate_attempt,
    default_repair_dialogue,
    default_repair_scaffold,
    default_socratic_repair_drill,
    default_substrate_gate,
    fake_map,
    fake_map_uses_cache_route,
    fake_map_uses_immune_route,
)
from bridge_lib.fake.knobs import (
    evaluate_attempt_override,
    repair_scaffold_override,
    substrate_gate_override,
)
from bridge_lib.fake.lookup import build_lookup, lookup_fake_response

__all__ = [
    "fake_map",
    "fake_map_uses_cache_route",
    "fake_map_uses_immune_route",
    "fake_evaluation",
    "fake_substrate_gate",
    "fake_repair_scaffold",
    "fake_socratic_repair_drill",
    "fake_repair_dialogue",
]

Template = dict[str, Any]


@lru_cache(maxsize=1)
def _lookup_table() -> dict[str, dict[str, Any]]:
    return build_lookup()


def _pick_template_mode(template: Template, mode: str | None) -> str | None:
    fixed = template.get("fixed")
    if not isinstance(fixed, dict):
        return None
    modes = fixed.get("modes")
    if not isinstance(modes, dict):
        return None
    return mode if mode in modes else None


def fake_substrate_gate(request: dict[str, Any]) -> dict[str, Any]:
    tmpl = prompt_templates.TEMPLATES["substrate_gate"]
    substrate_refinement = str(request.get("substrate_refinement") or "").strip()
    seed_already_offered = bool(request.get("seed_already_offered"))
    prompt_templates.build_prompt(
        tmpl,
        {
            "concept": str(request.get("concept") or ""),
            "learner_goal": request.get("learner_goal") or None,
            "launch_attempt": str(request.get("launch_attempt") or ""),
            "substrate_refinement": substrate_refinement or None,
            "seed_already_offered": str(seed_already_offered).lower(),
        },
    )
    if hit := substrate_gate_override(request):
        return hit
    if hit := lookup_fake_response(_lookup_table(), "substrate-gate", request):
        return hit
    return default_substrate_gate(request)


def fake_evaluation(request: dict[str, Any]) -> dict[str, Any]:
    eval_tmpl = prompt_templates.TEMPLATES["evaluator"]
    fake_drill_mode = str(request.get("drill_mode") or "cold_attempt")
    mode = _pick_template_mode(eval_tmpl, fake_drill_mode) or "re_drill"
    prompt_templates.build_prompt(
        eval_tmpl,
        {
            "node_id": str(request.get("node_id") or ""),
            "node_label": str(request.get("node_label") or ""),
            "node_mechanism": str(request.get("node_mechanism") or ""),
            "learner_text": str(request.get("learner_text") or ""),
            "drill_mode": fake_drill_mode,
            "repair_drill_context": request.get("repair_drill_context") or None,
            "knowledge_map": request.get("knowledge_map") or {},
        },
        mode=mode,
    )
    if hit := evaluate_attempt_override(request):
        return hit
    if hit := lookup_fake_response(_lookup_table(), "evaluate-attempt", request):
        return hit
    return default_evaluate_attempt(request)


def fake_repair_scaffold(request: dict[str, Any]) -> dict[str, Any]:
    prompt_templates.build_prompt(
        prompt_templates.TEMPLATES["delta"],
        {
            "node_label": str(request.get("node_label") or ""),
            "node_mechanism": str(request.get("node_mechanism") or ""),
            "learner_text": str(request.get("learner_text") or ""),
            "gap_description": str(request.get("gap_description") or ""),
            "evidence_goal": str(request.get("evidence_goal") or ""),
            "blank_hint": str(request.get("blank_hint") or ""),
            "is_misconception": str(bool(request.get("is_misconception"))).lower(),
        },
    )
    if hit := repair_scaffold_override(request):
        return hit
    if hit := lookup_fake_response(_lookup_table(), "repair-scaffold", request):
        return hit
    return default_repair_scaffold(request)


def fake_socratic_repair_drill(request: dict[str, Any]) -> dict[str, Any]:
    before = str(request.get("before") or "").strip()
    after = str(request.get("after") or "").strip()
    question_style = str(request.get("question_style") or "direct").strip()
    hinge = str(
        request.get("hinge_focus")
        or request.get("missing_operation")
        or "the key process"
    )
    contrast = str(
        request.get("contrast_prompt")
        or f"Picture {before} versus later when {after}"
    )
    prompt_templates.build_prompt(
        prompt_templates.TEMPLATES["socratic_repair_drill"],
        {
            "node_label": str(request.get("node_label") or "repair target"),
            "repair_target": str(
                request.get("repair_target") or "name the missing process"
            ),
            "hinge_focus": hinge,
            "contrast_prompt": contrast,
            "before": before,
            "missing_operation": str(request.get("missing_operation") or hinge),
            "after": after,
            "learner_text": str(request.get("learner_text") or ""),
            "question_style": question_style,
        },
    )
    if hit := lookup_fake_response(_lookup_table(), "socratic-repair-drill", request):
        return hit
    return default_socratic_repair_drill(request)


def fake_repair_dialogue(request: dict[str, Any]) -> dict[str, Any]:
    prompt_templates.build_prompt(
        prompt_templates.TEMPLATES["repair_dialogue"],
        {
            "node_label": str(request.get("node_label") or ""),
            "node_mechanism": str(request.get("node_mechanism") or ""),
            "learner_text": str(request.get("learner_text") or ""),
            "turn_index": str(int(request.get("turn_index") or 1)),
            "gap_id": str(request.get("gap_id") or ""),
            "before": str(request.get("before") or ""),
            "missing_operation": str(request.get("missing_operation") or ""),
            "after": str(request.get("after") or ""),
        },
    )
    if hit := lookup_fake_response(_lookup_table(), "repair-dialogue", request):
        return hit
    return default_repair_dialogue(request)
