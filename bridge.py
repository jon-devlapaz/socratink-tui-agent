#!/usr/bin/env python3
"""Python LLM bridge for the founder-facing Socratink terminal dogfood app.

The terminal UI stays in Node so it can reuse the vendored browser
training-store and training-derive modules (lib/canon/). This bridge keeps LLM
calls on the vendored Python seam under vendor/python/.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any

WORKSPACE_ROOT = Path(__file__).resolve().parent
VENDOR_PYTHON_ROOT = WORKSPACE_ROOT / "vendor" / "python"
if not (VENDOR_PYTHON_ROOT / "ai_service.py").exists():
    raise RuntimeError(
        f"vendored Python seam not found at {VENDOR_PYTHON_ROOT}. Run "
        "./scripts/sync-canon-from-app.sh to populate vendor/python/."
    )
sys.path.insert(0, str(VENDOR_PYTHON_ROOT))

import ai_service
import bridge_fake
from llm import StructuredLLMRequest, build_llm_client
from llm.types import StructuredLLMResult
from models.provisional_map import ProvisionalMap

from bridge_contracts import (
    RepairDialogueJudge,
    RepairScaffold,
    SocraticRepairDrill,
    normalize_repair_dialogue_judge as _normalize_repair_dialogue_judge,
)
import prompt_templates

# Fail closed on the vendored ai_service seam the bridge depends on. If a sync
# from the app drops or renames this, surface it clearly at import time instead
# of an opaque AttributeError mid-evaluation. Guarded by tests/test_app_contract.py.
if not hasattr(ai_service, "_normalize_drill_evaluation"):
    raise RuntimeError(
        "vendored ai_service is missing _normalize_drill_evaluation; the TUI "
        "bridge depends on this evaluation-normalization seam. Re-run "
        "./scripts/sync-canon-from-app.sh or update bridge._normalize_tui_evaluation."
    )

_fake_evaluation = bridge_fake.fake_evaluation
_fake_map = bridge_fake.fake_map
_fake_map_uses_cache_route = bridge_fake.fake_map_uses_cache_route
_has_fake_causal_chain = bridge_fake.has_fake_causal_chain
_is_fake_fluent_shallow = bridge_fake.is_fake_fluent_shallow
_fake_repair_scaffold = bridge_fake.fake_repair_scaffold
_fake_repair_dialogue = bridge_fake.fake_repair_dialogue
_fake_socratic_repair_drill = bridge_fake.fake_socratic_repair_drill


def _read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def _write_response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, indent=2))
    sys.stdout.write("\n")


def _call_metadata(result: StructuredLLMResult, *, include_raw: bool) -> dict[str, Any]:
    payload = {
        "provider": result.provider,
        "model": result.model,
        "latency_ms": result.latency_ms,
        "usage": asdict(result.usage),
    }
    if include_raw:
        payload["raw_text"] = result.raw_text
    return payload


def _route_user_prompt(
    *,
    concept: str,
    launch_attempt: str,
    learner_goal: str | None,
) -> str:
    parts = [
        f"<concept>{concept}</concept>",
        f"<threshold>{launch_attempt}</threshold>",
    ]
    if learner_goal:
        parts.append(f"<learner_goal>{learner_goal}</learner_goal>")
    return "\n\n".join(parts)


def _first_node(pm: ProvisionalMap) -> dict[str, Any]:
    for cluster in pm.clusters:
        for node in cluster.subnodes:
            scaffold = node.learner_scaffold
            return {
                "id": node.id,
                "label": node.label,
                "mechanism": node.mechanism,
                "learner_prompt": scaffold.entry_prompt
                if scaffold
                else f"Reconstruct {node.label}.",
                "task_label": scaffold.task_label if scaffold else node.label,
                "blank_hint": scaffold.blank_hint if scaffold else "",
                "evidence_goal": scaffold.evidence_goal if scaffold else "",
            }
    raise ValueError("generated route has no drillable node")


def generate_route(request: dict[str, Any]) -> dict[str, Any]:
    concept = str(request.get("concept") or "").strip()
    launch_attempt = str(request.get("launch_attempt") or "").strip()
    if not concept:
        raise ValueError("concept-required")
    if not launch_attempt:
        raise ValueError("launch-attempt-required")

    include_raw = bool(request.get("log_raw_llm"))
    learner_goal = str(request.get("learner_goal") or "").strip() or None
    route_attempt = int(request.get("route_attempt") or 1)
    retry_guidance = str(request.get("route_retry_reason") or "").strip() or None
    if os.environ.get("SOCRATINK_TUI_FAKE_ROUTE_FAIL_ALWAYS") == "1":
        raise ai_service.SmallestRouteCapExceeded(
            "smallest route subnode 'fake' sentence_starter copies hidden mechanism"
        )
    if (
        os.environ.get("SOCRATINK_TUI_FAKE_ROUTE_FAIL_ONCE") == "1"
        and route_attempt <= 1
    ):
        raise ai_service.SmallestRouteCapExceeded(
            "smallest route subnode 'fake' sentence_starter copies hidden mechanism"
        )
    if os.environ.get("SOCRATINK_TUI_FAKE_LLM") == "1":
        pm = _fake_map(concept)
        llm_call = {
            "provider": "fake",
            "model": "fake-source-less-route",
            "latency_ms": 0,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }
        if include_raw:
            llm_call["raw_text"] = pm.model_dump_json(by_alias=True)
            llm_call["raw_prompt"] = {
                "system_prompt": ai_service.GENERATE_SMALLEST_ROUTE_PROMPT_PATH.read_text(),
                "user_prompt": _route_user_prompt(
                    concept=concept,
                    launch_attempt=launch_attempt,
                    learner_goal=learner_goal,
                ),
            }
    else:
        captured: dict[str, Any] = {}

        def on_call_complete(result: StructuredLLMResult) -> None:
            captured.update(_call_metadata(result, include_raw=include_raw))

        pm = ai_service.generate_smallest_provisional_map(
            concept=concept,
            threshold=launch_attempt,
            learner_goal=learner_goal,
            retry_guidance=retry_guidance,
            on_call_complete=on_call_complete,
        )
        llm_call = captured
        if include_raw:
            llm_call["raw_prompt"] = {
                "system_prompt": ai_service.GENERATE_SMALLEST_ROUTE_PROMPT_PATH.read_text(),
                "user_prompt": _route_user_prompt(
                    concept=concept,
                    launch_attempt=launch_attempt,
                    learner_goal=learner_goal,
                ),
            }

    return {
        "provisional_map": pm.model_dump(by_alias=True),
        "first_node": _first_node(pm),
        "llm_call": llm_call,
    }


def _normalize_tui_evaluation(
    evaluation: ai_service.DrillEvaluation,
    *,
    drill_mode: str,
    learner_text: str,
) -> ai_service.DrillEvaluation:
    return ai_service._normalize_drill_evaluation(
        evaluation,
        session_phase="drill",
        drill_mode=drill_mode,
        probe_count=0,
        latest_learner_message=learner_text,
    )


def build_repair_scaffold(request: dict[str, Any]) -> dict[str, Any]:
    if os.environ.get("SOCRATINK_TUI_FAKE_LLM") == "1":
        return _fake_repair_scaffold(request)

    node_label = str(request.get("node_label") or "").strip()
    node_mechanism = str(request.get("node_mechanism") or "").strip()
    learner_text = str(request.get("learner_text") or "").strip()
    gap_description = str(request.get("gap_description") or "").strip()
    evidence_goal = str(request.get("evidence_goal") or "").strip()
    blank_hint = str(request.get("blank_hint") or "").strip()
    include_raw = bool(request.get("log_raw_llm"))
    if not node_label or not node_mechanism or not learner_text:
        raise ValueError("repair-scaffold-context-required")

    tmpl = prompt_templates.TEMPLATES["delta"]
    prompts = prompt_templates.build_prompt(
        tmpl,
        {
            "node_label": node_label,
            "node_mechanism": node_mechanism,
            "learner_text": learner_text,
            "gap_description": gap_description or "",
            "evidence_goal": evidence_goal or "",
            "blank_hint": blank_hint or "",
            "is_misconception": str(bool(request.get("is_misconception"))).lower(),
        },
    )
    llm_request = StructuredLLMRequest(
        system_prompt=prompts["system_prompt"],
        user_prompt=prompts["user_prompt"],
        response_schema=RepairScaffold,
        temperature=0.2,
        task_name="socratink_tui_repair_scaffold",
        prompt_version=tmpl["version"],
    )
    result = build_llm_client().generate_structured(llm_request)
    scaffold = result.parsed
    if not isinstance(scaffold, RepairScaffold):
        raise ValueError("invalid-repair-scaffold")
    return {
        "repair_scaffold": scaffold.model_dump(),
        "llm_call": {
            **_call_metadata(result, include_raw=include_raw),
            **(
                {
                    "raw_prompt": {
                        "system_prompt": prompts["system_prompt"],
                        "user_prompt": prompts["user_prompt"],
                    }
                }
                if include_raw
                else {}
            ),
        },
    }


def build_socratic_repair_drill(request: dict[str, Any]) -> dict[str, Any]:
    before = str(request.get("before") or "").strip()
    after = str(request.get("after") or "").strip()
    question_style = str(request.get("question_style") or "direct").strip()
    if not before or not after:
        raise ValueError("socratic-drill-boundaries-required")

    if os.environ.get("SOCRATINK_TUI_FAKE_LLM") == "1":
        return _fake_socratic_repair_drill(request)

    node_label = str(request.get("node_label") or "").strip()
    repair_target = str(request.get("repair_target") or "").strip()
    missing_operation = str(request.get("missing_operation") or "").strip()
    hinge_focus = str(request.get("hinge_focus") or missing_operation).strip()
    contrast_prompt = str(request.get("contrast_prompt") or "").strip()
    learner_text = str(request.get("learner_text") or "").strip()
    include_raw = bool(request.get("log_raw_llm"))
    if not node_label or not repair_target or not missing_operation:
        raise ValueError("socratic-drill-context-required")

    tmpl = prompt_templates.TEMPLATES["socratic_repair_drill"]
    prompts = prompt_templates.build_prompt(
        tmpl,
        {
            "node_label": node_label,
            "repair_target": repair_target,
            "hinge_focus": hinge_focus,
            "contrast_prompt": contrast_prompt,
            "before": before,
            "missing_operation": missing_operation,
            "after": after,
            "learner_text": learner_text,
            "question_style": question_style,
        },
    )
    llm_request = StructuredLLMRequest(
        system_prompt=prompts["system_prompt"],
        user_prompt=prompts["user_prompt"],
        response_schema=SocraticRepairDrill,
        temperature=0.2,
        task_name="socratink_tui_socratic_repair_drill",
        prompt_version=tmpl["version"],
    )
    result = build_llm_client().generate_structured(llm_request)
    drill = result.parsed
    if not isinstance(drill, SocraticRepairDrill):
        raise ValueError("invalid-socratic-repair-drill")
    return {
        "socratic_question": drill.socratic_question,
        "llm_call": {
            **_call_metadata(result, include_raw=include_raw),
            **(
                {
                    "raw_prompt": {
                        "system_prompt": prompts["system_prompt"],
                        "user_prompt": prompts["user_prompt"],
                    }
                }
                if include_raw
                else {}
            ),
        },
    }


def judge_repair_dialogue(request: dict[str, Any]) -> dict[str, Any]:
    if os.environ.get("SOCRATINK_TUI_FAKE_LLM") == "1":
        return _fake_repair_dialogue(request)

    node_label = str(request.get("node_label") or "").strip()
    node_mechanism = str(request.get("node_mechanism") or "").strip()
    missing_operation = str(request.get("missing_operation") or "").strip()
    before = str(request.get("before") or "").strip()
    after = str(request.get("after") or "").strip()
    learner_text = str(request.get("learner_text") or "").strip()
    turn_index = int(request.get("turn_index") or 1)
    if (
        not node_label
        or not node_mechanism
        or not missing_operation
        or not before
        or not after
    ):
        raise ValueError("repair-dialogue-context-required")
    if not learner_text:
        raise ValueError("learner-text-required")

    tmpl = prompt_templates.TEMPLATES["repair_dialogue"]
    prompts = prompt_templates.build_prompt(
        tmpl,
        {
            "node_label": node_label,
            "node_mechanism": node_mechanism,
            "learner_text": learner_text,
            "turn_index": str(turn_index),
            "gap_id": request.get("gap_id") or "",
            "before": before,
            "missing_operation": missing_operation,
            "after": after,
        },
    )
    llm_request = StructuredLLMRequest(
        system_prompt=prompts["system_prompt"],
        user_prompt=prompts["user_prompt"],
        response_schema=RepairDialogueJudge,
        temperature=0.2,
        task_name="socratink_tui_repair_dialogue",
        prompt_version=tmpl["version"],
    )
    result = build_llm_client().generate_structured(llm_request)
    judge = result.parsed
    if not isinstance(judge, RepairDialogueJudge):
        raise ValueError("invalid-repair-dialogue")
    judge = _normalize_repair_dialogue_judge(judge)
    return {
        "repair_dialogue": judge.model_dump(),
        "llm_call": {
            **_call_metadata(result, include_raw=bool(request.get("log_raw_llm"))),
            **(
                {
                    "raw_prompt": {
                        "system_prompt": prompts["system_prompt"],
                        "user_prompt": prompts["user_prompt"],
                    }
                }
                if request.get("log_raw_llm")
                else {}
            ),
        },
    }


def evaluate_attempt(request: dict[str, Any]) -> dict[str, Any]:
    if os.environ.get("SOCRATINK_TUI_FAKE_LLM") == "1":
        return _fake_evaluation(request)

    node_id = str(request.get("node_id") or "").strip()
    node_label = str(request.get("node_label") or "").strip()
    node_mechanism = str(request.get("node_mechanism") or "").strip()
    learner_text = str(request.get("learner_text") or "").strip()
    drill_mode = str(request.get("drill_mode") or "cold_attempt").strip()
    if not node_id or not node_label or not node_mechanism:
        raise ValueError("node-context-required")
    if not learner_text:
        raise ValueError("learner-text-required")

    tmpl = prompt_templates.TEMPLATES["evaluator"]
    mode_key = drill_mode if drill_mode in tmpl["fixed"]["modes"] else "re_drill"
    prompts = prompt_templates.build_prompt(
        tmpl,
        {
            "node_id": node_id,
            "node_label": node_label,
            "node_mechanism": node_mechanism,
            "learner_text": learner_text,
            "drill_mode": drill_mode,
            "repair_drill_context": request.get("repair_drill_context") or None,
            "knowledge_map": request.get("knowledge_map") or {},
        },
        mode=mode_key,
    )
    system_prompt = prompts["system_prompt"]
    user_prompt = prompts["user_prompt"]

    llm_request = StructuredLLMRequest(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_schema=ai_service.DrillEvaluation,
        temperature=ai_service.DRILL_TEMPERATURE,
        task_name=f"socratink_tui_{drill_mode}",
        prompt_version=tmpl["version"],
    )
    result = build_llm_client().generate_structured(llm_request)
    evaluation = result.parsed
    if not isinstance(evaluation, ai_service.DrillEvaluation):
        raise ValueError("invalid-drill-evaluation")
    evaluation = _normalize_tui_evaluation(
        evaluation,
        drill_mode=drill_mode,
        learner_text=learner_text,
    )
    return {
        "evaluation": evaluation.model_dump(),
        "llm_call": {
            **_call_metadata(result, include_raw=bool(request.get("log_raw_llm"))),
            **(
                {
                    "raw_prompt": {
                        "system_prompt": system_prompt,
                        "user_prompt": user_prompt,
                    }
                }
                if request.get("log_raw_llm")
                else {}
            ),
        },
    }


def main() -> int:
    if len(sys.argv) != 2:
        sys.stderr.write(
            "usage: bridge.py "
            "<generate-route|evaluate-attempt|repair-scaffold|"
            "socratic-repair-drill|repair-dialogue>\n"
        )
        return 2
    try:
        request = _read_request()
        if sys.argv[1] == "generate-route":
            _write_response(generate_route(request))
            return 0
        if sys.argv[1] == "repair-scaffold":
            _write_response(build_repair_scaffold(request))
            return 0
        if sys.argv[1] == "socratic-repair-drill":
            _write_response(build_socratic_repair_drill(request))
            return 0
        if sys.argv[1] == "repair-dialogue":
            _write_response(judge_repair_dialogue(request))
            return 0
        if sys.argv[1] == "evaluate-attempt":
            _write_response(evaluate_attempt(request))
            return 0
        raise ValueError(f"unknown-action:{sys.argv[1]}")
    except Exception as exc:  # pragma: no cover - exercised through subprocess
        _write_response({"error": type(exc).__name__, "message": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
