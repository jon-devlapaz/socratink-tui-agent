"""Environment knobs for fake bridge VCR stub."""

from __future__ import annotations

import os
from typing import Any

from bridge_lib.fake.response import build_response_from_expect

COLD_CLASSIFICATION_ENV = "SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION"
SPACED_CLASSIFICATION_ENV = "SOCRATINK_TUI_FAKE_SPACED_CLASSIFICATION"
SUBSTRATE_CLASSIFICATION_ENV = "SOCRATINK_TUI_FAKE_SUBSTRATE_CLASSIFICATION"
LEAKY_SCAFFOLD_ENV = "SOCRATINK_TUI_FAKE_LEAKY_SCAFFOLD"

EVAL_CLASSIFICATIONS = frozenset(
    {"solid", "shallow", "thin", "misconception", "deep"}
)
SUBSTRATE_CLASSIFICATIONS = frozenset({"fast", "slow", "minimal"})


def evaluate_attempt_override(request: dict[str, Any]) -> dict[str, Any] | None:
    from models.drill_attempts import has_substantive_attempt

    mode = str(request.get("drill_mode") or "cold_attempt")
    learner_text = str(request.get("learner_text") or "")

    if mode == "cold_attempt" and not has_substantive_attempt(learner_text):
        return build_response_from_expect(
            "evaluate-attempt",
            {
                "answer_mode": "help_request",
                "score_eligible": False,
                "classification": None,
                "routing": "SCAFFOLD",
                "help_request_reason": "explicit_unknown",
            },
            request,
        )

    override = None
    if mode == "cold_attempt":
        override = os.environ.get(COLD_CLASSIFICATION_ENV)
    elif mode == "spaced_redrill":
        override = os.environ.get(SPACED_CLASSIFICATION_ENV)

    if override in EVAL_CLASSIFICATIONS:
        if override == "misconception":
            routing = "SCAFFOLD"
        elif override == "solid":
            routing = "NEXT"
        elif override == "deep":
            routing = "PROBE"
        elif mode in ("gap_drill", "spaced_redrill"):
            routing = "PROBE"
        else:
            routing = "PROBE" if override != "solid" else "NEXT"
        return build_response_from_expect(
            "evaluate-attempt",
            {
                "classification": override,
                "answer_mode": "attempt",
                "score_eligible": True,
                "routing": routing,
                "help_request_reason": "none",
            },
            request,
        )
    return None


def substrate_gate_override(request: dict[str, Any]) -> dict[str, Any] | None:
    override = os.environ.get(SUBSTRATE_CLASSIFICATION_ENV)
    if override not in SUBSTRATE_CLASSIFICATIONS:
        return None
    expect: dict[str, Any] = {
        "classification": override,
        "substrate_adequate": override == "fast",
        "graph_neutral": True,
        "score_eligible": False,
    }
    if override == "slow":
        expect["seed_text_present"] = True
        expect["refinement_prompt_present"] = True
    else:
        expect["seed_text_present"] = False
        expect["refinement_prompt_present"] = False
    return build_response_from_expect("substrate-gate", expect, request)


def repair_scaffold_override(request: dict[str, Any]) -> dict[str, Any] | None:
    if os.environ.get(LEAKY_SCAFFOLD_ENV) != "1":
        return None
    return build_response_from_expect(
        "repair-scaffold",
        {
            "repair_target": "Repair the full agent feedback loop.",
            "before": "The agent calls a tool.",
            "missing_operation": (
                "observe the tool result, compare it to the goal, update context, "
                "refine the plan, and choose the next action"
            ),
            "after": "The agent chooses a better next action.",
            "question_style": "direct",
            "socratic_question": (
                "How does the agent observe the tool result, compare it to the goal, "
                "update context, refine the plan, and choose the next action?"
            ),
            "analogical_prompt": (
                "If a chef tastes the soup before adding more salt, what must the chef "
                "do with that taste before deciding the next ingredient?"
            ),
            "micro_scaffold_prompt": (
                "The agent calls a tool, ___ the result, then chooses the next action."
            ),
        },
        request,
    )
