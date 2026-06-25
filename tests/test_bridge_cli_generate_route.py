"""Bridge CLI contract tests for route-adjacent bridge actions."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
BRIDGE = WORKSPACE_ROOT / "bridge.py"


def run_generate_route(
    payload: dict,
    *,
    env_extra: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return run_bridge("generate-route", payload, env_extra=env_extra)


def run_bridge(
    action: str,
    payload: dict,
    *,
    fake_llm: bool = True,
    env_extra: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    if fake_llm:
        env["SOCRATINK_TUI_FAKE_LLM"] = "1"
    else:
        env.pop("SOCRATINK_TUI_FAKE_LLM", None)
    if env_extra:
        env.update(env_extra)
    return subprocess.run(
        [sys.executable, str(BRIDGE), action],
        cwd=WORKSPACE_ROOT,
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )


def test_generate_route_cli_returns_route_and_raw_prompt() -> None:
    result = run_generate_route(
        {
            "concept": "Caching in APIs",
            "launch_attempt": "Store a result, then reuse it.",
            "substrate_adequacy": "minimal",
            "learner_goal": "Explain cache hits.",
            "log_raw_llm": True,
        }
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["first_node"]["id"]
    assert payload["first_node"]["learner_prompt"]
    assert payload["provisional_map"]["clusters"]
    raw_prompt = payload["llm_call"]["raw_prompt"]["user_prompt"]
    assert "<substrate_adequacy>minimal</substrate_adequacy>" in raw_prompt
    assert "<learner_goal>Explain cache hits.</learner_goal>" in raw_prompt


def test_generate_route_cli_reports_validation_errors_as_json() -> None:
    result = run_generate_route(
        {
            "concept": "Caching in APIs",
            "launch_attempt": "Store a result, then reuse it.",
            "substrate_adequacy": "bogus",
        }
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload == {
        "error": "ValueError",
        "message": "substrate-adequacy-invalid",
    }


def test_generate_route_fake_fail_once_knob_only_blocks_first_attempt() -> None:
    request = {
        "concept": "Caching in APIs",
        "launch_attempt": "Store a result, then reuse it.",
    }
    env = {"SOCRATINK_TUI_FAKE_ROUTE_FAIL_ONCE": "1"}

    first = run_generate_route({**request, "route_attempt": 1}, env_extra=env)
    retry = run_generate_route({**request, "route_attempt": 2}, env_extra=env)

    assert first.returncode == 1
    first_payload = json.loads(first.stdout)
    assert first_payload["error"] == "SmallestRouteCapExceeded"
    assert "sentence_starter copies hidden mechanism" in first_payload["message"]
    assert retry.returncode == 0, retry.stderr
    assert json.loads(retry.stdout)["first_node"]["id"]


def test_substrate_gate_cli_returns_graph_neutral_decision() -> None:
    result = run_bridge(
        "substrate-gate",
        {
            "concept": "Caching in APIs",
            "launch_attempt": "Store a result, then reuse it.",
        },
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    decision = payload["substrate_gate"]
    assert decision["contract_version"] == "substrate-gate-v1"
    assert decision["graph_neutral"] is True
    assert decision["score_eligible"] is False
    assert "llm_call" in payload


def test_substrate_gate_cli_reports_missing_input_as_json() -> None:
    result = run_bridge("substrate-gate", {"concept": "Caching in APIs"}, fake_llm=False)

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload == {
        "error": "ValueError",
        "message": "launch-attempt-or-refinement-required",
    }


def test_evaluate_attempt_cli_honors_gap_drill_mode() -> None:
    request = {
        "node_id": "c1_s1",
        "node_label": "Cache hit path",
        "node_mechanism": "The first request stores a result for later reuse.",
        "learner_text": "A cache stores the result.",
        "drill_mode": "gap_drill",
        "log_raw_llm": True,
    }
    result = run_bridge("evaluate-attempt", request)

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    evaluation = payload["evaluation"]
    assert evaluation["classification"] == "shallow"
    assert evaluation["score_eligible"] is True
    assert evaluation["routing"] == "PROBE"
    assert payload["llm_call"]["model"] == "fake-drill-evaluator"
    assert payload["llm_call"]["raw_prompt"]["drill_mode"] == "gap_drill"


def test_evaluate_attempt_cli_reports_missing_learner_text_as_json() -> None:
    result = run_bridge(
        "evaluate-attempt",
        {
            "node_id": "c1_s1",
            "node_label": "Cache hit path",
            "node_mechanism": "The first request stores a result for later reuse.",
        },
        fake_llm=False,
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload == {
        "error": "ValueError",
        "message": "learner-text-required",
    }


def test_repair_scaffold_cli_returns_mechanism_fields() -> None:
    request = {
        "node_label": "Cache hit path",
        "node_mechanism": "The first request stores a result for later reuse.",
        "learner_text": "A cache stores the result but I missed the reuse step.",
        "gap_description": "connect store to later reuse",
        "log_raw_llm": True,
    }
    result = run_bridge("repair-scaffold", request)

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    scaffold = payload["repair_scaffold"]
    assert scaffold["repair_target"]
    assert scaffold["hinge_focus"]
    assert scaffold["contrast_prompt"]
    assert scaffold["missing_operation"] == "connect store to later reuse"
    assert payload["llm_call"]["model"] == "fake-repair-scaffold"
    assert payload["llm_call"]["raw_prompt"]["gap_description"] == "connect store to later reuse"


def test_repair_scaffold_cli_reports_missing_context_as_json() -> None:
    result = run_bridge(
        "repair-scaffold",
        {
            "node_label": "Cache hit path",
            "node_mechanism": "The first request stores a result for later reuse.",
        },
        fake_llm=False,
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload == {
        "error": "ValueError",
        "message": "repair-scaffold-context-required",
    }


def test_socratic_repair_drill_cli_returns_question_and_raw_prompt() -> None:
    result = run_bridge(
        "socratic-repair-drill",
        {
            "before": "A first request has no stored answer.",
            "after": "A later request can reuse the stored answer.",
            "hinge_focus": "store then reuse the result",
            "contrast_prompt": "Compare first request versus later request.",
            "question_style": "direct",
            "log_raw_llm": True,
        },
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert "store then reuse the result" in payload["socratic_question"]
    assert payload["llm_call"]["model"] == "fake-socratic-repair-drill"
    assert payload["llm_call"]["raw_prompt"]["question_style"] == "direct"


def test_socratic_repair_drill_cli_reports_missing_context_as_json() -> None:
    result = run_bridge(
        "socratic-repair-drill",
        {
            "before": "A first request has no stored answer.",
            "after": "A later request can reuse the stored answer.",
        },
        fake_llm=False,
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload == {
        "error": "ValueError",
        "message": "socratic-drill-context-required",
    }


def test_repair_dialogue_cli_returns_graph_neutral_judge_and_raw_prompt() -> None:
    result = run_bridge(
        "repair-dialogue",
        {
            "node_label": "Cache hit path",
            "node_mechanism": "The first request stores a result for later reuse.",
            "missing_operation": "store then reuse the result",
            "before": "A first request has no stored answer.",
            "after": "A later request can reuse the stored answer.",
            "learner_text": "The first request stores the answer, so the next request can reuse it.",
            "turn_index": 1,
            "log_raw_llm": True,
        },
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    judge = payload["repair_dialogue"]
    assert judge["graph_neutral"] is True
    assert judge["score_eligible"] is False
    assert judge["contract_version"] == "repair-dialogue-v2"
    assert payload["llm_call"]["model"] == "fake-repair-dialogue"
    assert payload["llm_call"]["raw_prompt"]["missing_operation"] == "store then reuse the result"


def test_repair_dialogue_cli_reports_missing_context_as_json() -> None:
    result = run_bridge(
        "repair-dialogue",
        {
            "node_label": "Cache hit path",
            "learner_text": "The first request stores the answer.",
        },
        fake_llm=False,
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload == {
        "error": "ValueError",
        "message": "repair-dialogue-context-required",
    }
