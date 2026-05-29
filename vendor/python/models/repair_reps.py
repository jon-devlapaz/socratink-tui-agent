"""Repair Reps response contracts and validation helpers.

Repair Reps are optional typed micro-practice. These models and helpers keep
the LLM response graph-neutral: no routing, scoring, or graph-truth mutation
fields are accepted or returned.
"""
from __future__ import annotations

from typing import Literal, TypedDict

from pydantic import BaseModel, ConfigDict, Field


class RepairRep(BaseModel):
    id: str = Field(
        description="Stable identifier for this rep within the generated set"
    )
    kind: Literal["missing_bridge", "next_step", "cause_effect"] = Field(
        description="The causal micro-practice shape."
    )
    prompt: str = Field(
        description="Typed causal prompt shown before the answer bridge is revealed."
    )
    target_bridge: str = Field(
        description="Short model bridge revealed only after the learner types."
    )
    feedback_cue: str = Field(
        description="Short comparison cue after the bridge is revealed."
    )


class RepairRepsEvaluation(BaseModel):
    reps: list[RepairRep] = Field(
        description="Exactly three typed causal repair reps.",
        min_length=3,
        max_length=3,
    )


class _StrictRepairRep(RepairRep):
    model_config = ConfigDict(extra="forbid")


class _StrictRepairRepsEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reps: list[_StrictRepairRep] = Field(
        description="Exactly three typed causal repair reps.",
        min_length=3,
        max_length=3,
    )


class RepairRepsResult(TypedDict):
    node_id: str
    prompt_version: str
    reps: list[dict[str, str]]


def validate_repair_reps_result(
    evaluation: RepairRepsEvaluation, *, expected_count: int
) -> None:
    if len(evaluation.reps) != expected_count:
        raise ValueError(
            f"Repair reps response must include exactly {expected_count} reps."
        )

    seen_ids: set[str] = set()
    for index, rep in enumerate(evaluation.reps, start=1):
        rep_id = rep.id.strip()
        if not rep_id:
            raise ValueError(f"Repair rep {index} is missing an id.")
        if rep_id in seen_ids:
            raise ValueError(f"Repair rep id is duplicated: {rep_id}")
        seen_ids.add(rep_id)

        if not rep.prompt.strip():
            raise ValueError(f"Repair rep {index} is missing a prompt.")
        if not rep.target_bridge.strip():
            raise ValueError(f"Repair rep {index} is missing a target bridge.")
        if not rep.feedback_cue.strip():
            raise ValueError(f"Repair rep {index} is missing a feedback cue.")


def parse_repair_reps_response(response: object) -> RepairRepsEvaluation:
    raw_text = getattr(response, "text", None)
    if raw_text:
        try:
            strict = _StrictRepairRepsEvaluation.model_validate_json(raw_text)
        except Exception as err:
            raise ValueError(
                "Gemini returned an invalid structured repair reps response."
            ) from err
        return RepairRepsEvaluation.model_validate(strict.model_dump())

    evaluation = getattr(response, "parsed", None)
    if isinstance(evaluation, RepairRepsEvaluation):
        return evaluation
    if isinstance(evaluation, dict):
        try:
            strict = _StrictRepairRepsEvaluation.model_validate(evaluation)
        except Exception as err:
            raise ValueError(
                "Gemini returned an invalid structured repair reps response."
            ) from err
        return RepairRepsEvaluation.model_validate(strict.model_dump())
    raise ValueError("Gemini returned an invalid structured repair reps response.")
