"""Structured bridge contracts shared by live and fake bridge paths."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class RepairScaffold(BaseModel):
    repair_target: str = Field(
        description="One direct sentence naming the gap boundary without completing the answer."
    )
    hinge_focus: str = Field(
        default="",
        description=(
            "Verb-led name for the one process the learner must explain (<=8 words), "
            "e.g. 'memory cells form and persist' — not meta labels like 'the missing link'."
        ),
    )
    contrast_prompt: str = Field(
        default="",
        description=(
            "In-domain contrast that sparks curiosity: two situations in the same topic "
            "(e.g. first germ exposure vs later re-exposure). One short question fragment."
        ),
    )
    before: str = Field(
        description=(
            "Concrete situational anchor the learner can picture (e.g. 'your body meets "
            "the germ for the first time') — not meta 'before state' phrasing."
        )
    )
    missing_operation: str = Field(
        description=(
            "Same as hinge_focus: a terse verb-led process name, not a full mechanism "
            "or meta placeholder."
        )
    )
    after: str = Field(
        description=(
            "The observable outcome the process leads to, in plain learner-facing words "
            "(<=10 words). State the RESULT only, never the mechanism."
        )
    )
    internal_bloom_lens: str = Field(
        description="Internal route lens: remember, understand, apply, analyze, evaluate, or create. Never show this to the learner."
    )
    question_style: str = Field(
        description="direct or analogical. Use analogical when the learner model is vague or low-resolution."
    )
    socratic_question: str = Field(
        description=(
            "One curious, learner-facing question that uses contrast_prompt and hinge_focus. "
            "Must stay in the topic domain. Never use meta before/after state phrasing."
        )
    )
    analogical_prompt: str = Field(
        description=(
            "An in-domain contrast question (same topic as the node): compare two "
            "situations and ask what process connects them. Must not use unrelated "
            "domains (sports balls, cooking) unless the node is about that domain."
        )
    )
    micro_scaffold_prompt: str = Field(
        description="A narrow fill-in-the-blank prompt like 'X leads to ___ which causes Y.' Must not complete the missing operation. The blank targets the missing operation."
    )
    misconception_counter: str | None = Field(
        default=None,
        description="If the learner holds a misconception, one sentence explaining why their model cannot be correct. Shown before the Socratic question.",
    )


class SocraticRepairDrill(BaseModel):
    socratic_question: str = Field(
        description=(
            "One curious learner-facing question using contrast_prompt and hinge_focus "
            "from the repair slot. Stay in the topic domain; do not import unrelated "
            "analogies (balls, engines, cooking) unless the topic is that domain."
        )
    )


class SubstrateGateDecision(BaseModel):
    contract_version: str = Field(
        default="substrate-gate-v1",
        description="Substrate gate contract version for routing/replay compatibility.",
    )
    classification: Literal["fast", "slow", "minimal"] = Field(
        description=(
            "fast means the launch/refinement is adequate now; slow means offer the "
            "seed/refinement prompt; minimal means continue with conservative novice grain."
        )
    )
    substrate_adequate: bool = Field(
        description="True only when learner text is adequate to route without conservative fallback."
    )
    seed_text: str | None = Field(
        default=None,
        description=(
            "One tiny in-domain substrate seed when launch substrate is inadequate. "
            "Context only; never an answer key or full mechanism."
        ),
    )
    refinement_prompt: str | None = Field(
        default=None,
        description="One short prompt asking for a post-seed generative line.",
    )
    judge_reason: str = Field(
        description="One plain sentence explaining why the gate chose this path."
    )
    graph_neutral: bool = Field(
        default=True,
        description="Always true; substrate gate context cannot mutate graph truth.",
    )
    score_eligible: bool = Field(
        default=False,
        description="Always false; launch/refinement text is routing context, not evidence.",
    )

    @model_validator(mode="before")
    @classmethod
    def infer_legacy_classification(cls, data: Any) -> Any:
        if not isinstance(data, dict) or data.get("classification") is not None:
            return data
        return {
            **data,
            "classification": "fast" if data.get("substrate_adequate") is True else "minimal",
        }

    @field_validator("classification", mode="before")
    @classmethod
    def normalize_classification(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip().lower()
        if normalized in {"route", "launch", "provisional"}:
            return "fast"
        if normalized in {"refine", "refinement", "seed"}:
            return "slow"
        return normalized


class RepairDialogueJudge(BaseModel):
    contract_version: str = Field(
        default="repair-dialogue-v2",
        description="Judge contract version for routing/replay compatibility.",
    )
    classification: str = Field(
        description="thin, partial, wrong_direction, or strong for this graph-neutral repair turn."
    )
    score_eligible: bool = Field(
        description="Always false; inner repair dialogue is not graph evidence."
    )
    graph_neutral: bool = Field(
        description="Always true; dialogue routing cannot mutate graph truth."
    )
    support_level: str = Field(
        description="probe, hint, micro_scaffold, or direct_explanation."
    )
    causal_link_present: bool = Field(
        description="Whether the learner expressed a before -> operation -> after link."
    )
    missing_operation_addressed: bool = Field(
        description="Whether the named missing operation was addressed."
    )
    echo_risk: bool = Field(
        description="Whether the learner appears to echo words without reconstructing the causal link."
    )
    bridge_ready: bool = Field(
        description="Whether model bridge may be revealed after this own-words repair."
    )
    next_action: Literal[
        "commit_repair", "resume_repair", "recover_once", "abandon"
    ] = Field(
        default="resume_repair",
        description="Bounded next action used by routing policy.",
    )
    progression_state: Literal["no_change", "improved", "ready"] = Field(
        default="no_change",
        description="Progression state between turns for policy and telemetry.",
    )
    improvement_observed: bool = Field(
        default=False,
        description="Whether the latest response improved over prior turn.",
    )
    improvement_note: str = Field(
        default="",
        description="One short note describing observed improvement when present.",
    )
    next_dialogue_action: str = Field(
        description="commit_repair, probe_again, micro_scaffold, or abandon."
    )
    judge_reason: str = Field(description="One plain sentence explaining the decision.")
    next_prompt: str = Field(
        description="The next prompt if another dialogue turn is needed, otherwise an empty string."
    )
    not_mastery_reason: str = Field(
        description="Why this turn is not graph mastery evidence."
    )


def normalize_repair_dialogue_judge(
    judge: RepairDialogueJudge,
) -> RepairDialogueJudge:
    if not judge.contract_version:
        judge.contract_version = "repair-dialogue-v2"
    if judge.bridge_ready:
        judge.next_action = "commit_repair"
        judge.progression_state = "ready"
        judge.improvement_observed = True
        judge.next_dialogue_action = "commit_repair"
        if not judge.improvement_note:
            judge.improvement_note = (
                "Learner now reconstructs the causal bridge in their own words."
            )
        return judge
    if judge.next_dialogue_action in ("probe_again", "micro_scaffold"):
        if judge.next_action not in ("resume_repair", "recover_once"):
            judge.next_action = "resume_repair"
    elif judge.next_dialogue_action == "abandon":
        judge.next_action = "abandon"
    elif judge.next_dialogue_action == "commit_repair":
        judge.next_action = "commit_repair"
        judge.progression_state = "ready"
    else:
        judge.next_dialogue_action = "probe_again"
        if judge.next_action not in ("resume_repair", "recover_once"):
            judge.next_action = "resume_repair"
    if not judge.improvement_note:
        judge.improvement_note = (
            "Learner response quality changed from the prior turn."
            if judge.improvement_observed
            else "No clear structural improvement yet."
        )
    return judge
