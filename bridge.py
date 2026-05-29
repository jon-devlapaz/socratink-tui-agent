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
from typing import Any, Literal

WORKSPACE_ROOT = Path(__file__).resolve().parent
VENDOR_PYTHON_ROOT = WORKSPACE_ROOT / "vendor" / "python"
if not (VENDOR_PYTHON_ROOT / "ai_service.py").exists():
    raise RuntimeError(
        f"vendored Python seam not found at {VENDOR_PYTHON_ROOT}. Run "
        "./scripts/sync-canon-from-app.sh to populate vendor/python/."
    )
sys.path.insert(0, str(VENDOR_PYTHON_ROOT))

import ai_service
from llm import StructuredLLMRequest, build_llm_client
from llm.types import StructuredLLMResult
from models.provisional_map import (
    BackboneItem,
    Cluster,
    LearnerScaffold,
    Metadata,
    ProvisionalMap,
    Relationships,
    Subnode,
)
from pydantic import BaseModel, Field

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


def _normalize_repair_dialogue_judge(
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


def _fake_map_uses_cache_route(concept_token: str) -> bool:
    """Match cache-themed concepts without treating 'memory' as 'memo'."""
    if any(token in concept_token for token in ("cache", "caching", "redis")):
        return True
    return any(
        token in concept_token
        for token in ("memoization", "memoize", "memoized", "memoizing")
    )


def _fake_map_uses_immune_route(concept_token: str) -> bool:
    """Immune-memory fixture route for vaccine/immunity dogfood scripts only."""
    return any(
        token in concept_token
        for token in ("immune", "vaccine", "antigen", "antibody", "immunity")
    )


def _fake_map(concept: str) -> ProvisionalMap:
    concept_clean = concept.strip() or "Core concept"
    concept_token = concept_clean.lower()
    cluster_label = "Memory bridge"
    backbone_principle = "Safe preview creates durable response memory."
    if _fake_map_uses_cache_route(concept_token):
        bridge_label = "Cache hit path"
        cluster_label = "Cache bridge"
        backbone_principle = "Storing a result makes a later identical request faster."
        mechanism = (
            "The first request computes and stores the result, then later identical "
            "requests read from cache and return faster."
        )
        entry_prompt = (
            "In your own words, why does saving a computed result make the later request faster?"
        )
        expected_shape = "first compute -> store result -> cache hit -> faster later response"
        sentence_starter = "Caching helps because..."
        blank_hint = "Name the store-and-reuse step."
        evidence_goal = (
            "The learner reconstructs how storing an earlier result enables a faster repeat response."
        )
        core_thesis = f"{concept_clean} depends on storing and reusing prior computation."
    elif _fake_map_uses_immune_route(concept_token):
        bridge_label = "Immune memory"
        mechanism = (
            "A vaccine safely presents antigen, matching immune cells expand, "
            "memory cells remain, and those cells respond faster later."
        )
        entry_prompt = (
            "In your own words, why does a safe preview make the later response faster?"
        )
        expected_shape = (
            "safe preview -> immune selection -> memory -> faster later response"
        )
        sentence_starter = "A safe preview helps because..."
        blank_hint = "Name what remains after the preview."
        evidence_goal = (
            "The learner reconstructs how immune memory links safe exposure to faster response."
        )
        core_thesis = (
            f"{concept_clean} depends on a safe preview creating durable response memory."
        )
    else:
        bridge_label = concept_clean
        cluster_label = f"{concept_clean} bridge"
        backbone_principle = (
            f"An early pass at {concept_clean} shapes how you respond when it appears again."
        )
        mechanism = (
            f"A first encounter with {concept_clean} leaves a trace, and a later encounter "
            "can build on that trace instead of starting from zero."
        )
        entry_prompt = (
            f"In your own words, how does an earlier encounter with {concept_clean} "
            "change a later response?"
        )
        expected_shape = (
            f"first encounter with {concept_clean} -> retained trace -> later reuse -> changed response"
        )
        sentence_starter = f"When {concept_clean} shows up again,"
        blank_hint = f"Name what carries over from the first {concept_clean} encounter."
        evidence_goal = (
            f"The learner reconstructs how {concept_clean} links an earlier encounter to a later response."
        )
        core_thesis = (
            f"{concept_clean} depends on carrying something forward from an earlier encounter."
        )

    scaffold = LearnerScaffold(
        bloom_level="understand",
        learner_move="reconstruct the causal link",
        task_label=f"Explain the {bridge_label.lower()} mechanism",
        task_cue="Use your own words before reading the study note.",
        tailoring_anchor="Connect the launch attempt to one local causal bridge.",
        entry_prompt=entry_prompt,
        expected_shape=expected_shape,
        sentence_starter=sentence_starter,
        blank_hint=blank_hint,
        evidence_goal=evidence_goal,
    )
    return ProvisionalMap(
        metadata=Metadata(
            source_title=f"{concept_clean} source-less route",
            core_thesis=core_thesis,
            architecture_type="causal_chain",
            difficulty="easy",
            governing_assumptions=[
                "Source-less route is provisional until learner evidence accumulates."
            ],
            low_density=False,
        ),
        backbone=[
            BackboneItem(
                id="b1",
                principle=backbone_principle,
                dependent_clusters=["c1"],
            )
        ],
        clusters=[
            Cluster(
                id="c1",
                label=cluster_label,
                description=f"The local bridge for {concept_clean}.",
                subnodes=[
                    Subnode(
                        id="c1_s1",
                        label=bridge_label,
                        mechanism=mechanism,
                        learner_scaffold=scaffold,
                    )
                ],
            )
        ],
        relationships=Relationships(domain_mechanics=[], learning_prerequisites=[]),
        frameworks=[],
    )


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
                "system_prompt": "fake source-less route prompt",
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


def _has_fake_causal_chain(learner_text: str) -> bool:
    """Heuristic for L2 evaluator evals: first → store/read → later, with a causal link."""
    normalized = " ".join(learner_text.lower().split())
    first_markers = (
        "first request",
        "first call",
        "on the first",
        "first compute",
        "from scratch",
    )
    later_markers = (
        "later",
        "second request",
        "repeat request",
        "comes again",
        "next time",
        "later response",
        "later identical",
    )
    store_markers = ("store", "stores", "stored", "save", "saves", "saving")
    read_markers = (
        "read",
        "reads",
        "retrieve",
        "reuse",
        "from cache",
        "cache instead",
        "stored result",
    )
    causal_markers = (
        "because",
        "so ",
        "therefore",
        "leads to",
        "which makes",
        "instead of",
        "when the same",
        "so the later",
    )
    has_first = any(marker in normalized for marker in first_markers)
    has_later = any(marker in normalized for marker in later_markers)
    has_store = any(marker in normalized for marker in store_markers)
    has_read = any(marker in normalized for marker in read_markers)
    has_causal = any(marker in normalized for marker in causal_markers)
    return (
        has_first
        and has_later
        and has_store
        and has_read
        and has_causal
    )


def _is_fake_misconception_cache(learner_text: str) -> bool:
    normalized = learner_text.lower()
    return (
        "cache hit" in normalized
        and "compute" in normalized
        and ("then save" in normalized or "then stores" in normalized or "only then saves" in normalized)
    )


def _is_fake_deep_partial(learner_text: str) -> bool:
    normalized = learner_text.lower()
    return (
        "have not explained" in normalized
        or "haven't explained" in normalized
        or "not explained what happens" in normalized
    )


def _is_fake_fluent_shallow(learner_text: str) -> bool:
    if _has_fake_causal_chain(learner_text):
        return False
    normalized = learner_text.lower()
    label_terms = (
        "caching",
        "cache",
        "performance",
        "retrieval",
        "optimization",
        "distributed",
    )
    return any(term in normalized for term in label_terms) and len(normalized.split()) >= 12


def _is_fake_label_only_shallow(learner_text: str) -> bool:
    if _has_fake_causal_chain(learner_text):
        return False
    normalized = learner_text.lower()
    return (
        "caching stores" in normalized
        or ("cache" in normalized and len(normalized.split()) <= 10)
    )


def _fake_evaluator_classification(
    learner_text: str,
    *,
    drill_mode: str,
) -> tuple[str | None, str, bool, str | None, str]:
    """Fake L2 classifier aligned with evaluator v6 causal rubric (CI only)."""
    from models.drill_attempts import has_substantive_attempt, infer_help_request_reason

    if drill_mode == "cold_attempt" and not has_substantive_attempt(learner_text):
        reason = infer_help_request_reason(learner_text) or "explicit_unknown"
        return None, "help_request", False, reason, "SCAFFOLD"

    if _is_fake_misconception_cache(learner_text):
        return "misconception", "attempt", True, "none", "SCAFFOLD"

    if _is_fake_deep_partial(learner_text):
        return "deep", "attempt", True, "none", "PROBE"

    if _has_fake_causal_chain(learner_text):
        return "solid", "attempt", True, "none", "NEXT"

    if _is_fake_fluent_shallow(learner_text) or _is_fake_label_only_shallow(learner_text):
        routing = (
            "PROBE"
            if drill_mode in ("gap_drill", "spaced_redrill")
            else "NEXT"
        )
        return "shallow", "attempt", True, "none", routing

    if drill_mode == "gap_drill":
        return "shallow", "attempt", True, "none", "PROBE"
    return "shallow", "attempt", True, "none", "NEXT"


def _fake_cold_help_evaluation(learner_text: str) -> dict[str, Any]:
    from models.drill_attempts import infer_help_request_reason

    help_reason = infer_help_request_reason(learner_text) or "explicit_unknown"
    return {
        "agent_response": (
            "Try one rough guess in your own words — what do you think has to happen "
            "the first time versus the next time? We have not scored this yet."
        ),
        "generative_commitment": False,
        "answer_mode": "help_request",
        "score_eligible": False,
        "help_request_reason": help_reason,
        "classification": None,
        "gap_description": "Learner produced zero schema; nudge to guess.",
        "routing": "SCAFFOLD",
        "response_tier": None,
        "response_band": None,
        "tier_reason": None,
    }


def _fake_evaluation(request: dict[str, Any]) -> dict[str, Any]:
    from models.drill_attempts import has_substantive_attempt

    _eval_tmpl = prompt_templates.TEMPLATES["evaluator"]
    _fake_drill_mode = str(request.get("drill_mode") or "cold_attempt")
    prompt_templates.build_prompt(
        _eval_tmpl,
        {
            "node_id": str(request.get("node_id") or ""),
            "node_label": str(request.get("node_label") or ""),
            "node_mechanism": str(request.get("node_mechanism") or ""),
            "learner_text": str(request.get("learner_text") or ""),
            "drill_mode": _fake_drill_mode,
            "repair_drill_context": request.get("repair_drill_context") or None,
            "knowledge_map": request.get("knowledge_map") or {},
        },
        mode=(
            _fake_drill_mode
            if _fake_drill_mode in _eval_tmpl["fixed"]["modes"]
            else "re_drill"
        ),
    )

    mode = str(request.get("drill_mode") or "cold_attempt")
    learner_text = str(request.get("learner_text") or "")
    node_label = str(request.get("node_label") or "").strip() or "this target node"

    if mode == "cold_attempt" and not has_substantive_attempt(learner_text):
        evaluation = _fake_cold_help_evaluation(learner_text)
        return {
            "evaluation": evaluation,
            "llm_call": {
                "provider": "fake",
                "model": "fake-drill-evaluator",
                "latency_ms": 0,
                "usage": {"input_tokens": 0, "output_tokens": 0},
                **(
                    {"raw_text": '{"answer_mode":"help_request"}'}
                    if request.get("log_raw_llm")
                    else {}
                ),
                **({"raw_prompt": request} if request.get("log_raw_llm") else {}),
            },
        }

    classification, answer_mode, score_eligible, help_reason, routing = (
        _fake_evaluator_classification(learner_text, drill_mode=mode)
    )
    if mode == "cold_attempt" and os.environ.get("SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION"):
        classification = os.environ["SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION"]
        answer_mode = "attempt"
        score_eligible = True
        help_reason = "none"
        routing = "NEXT" if classification == "solid" else "PROBE"
    elif mode == "spaced_redrill" and os.environ.get("SOCRATINK_TUI_FAKE_SPACED_CLASSIFICATION"):
        classification = os.environ["SOCRATINK_TUI_FAKE_SPACED_CLASSIFICATION"]
        answer_mode = "attempt"
        score_eligible = True
        help_reason = "none"
        routing = "NEXT" if classification == "solid" else "PROBE"

    if classification == "solid":
        response = (
            "You named what starts it, what changes, and what results — "
            "that is a full causal chain in your own words."
        )
    elif classification == "misconception":
        response = (
            "That story cannot work as written — what would have to change "
            "in the mechanism for the outcome to make sense?"
        )
    elif classification == "deep":
        response = (
            "You have the starting situation and the outcome — name the key "
            "process that connects them in your own words."
        )
    elif answer_mode == "help_request":
        response = (
            "What do you think has to happen the first time versus "
            "when it happens again?"
        )
    else:
        response = (
            f"You named pieces of {node_label}, but not the key process yet — "
            "what has to happen between the first time and the next time?"
        )

    gap_description = None
    if classification and classification != "solid":
        label = node_label.lower()
        gap_description = f"what changes during {label}"

    return {
        "evaluation": {
            "agent_response": response,
            "generative_commitment": answer_mode == "attempt",
            "answer_mode": answer_mode,
            "score_eligible": score_eligible,
            "help_request_reason": help_reason,
            "classification": classification,
            "gap_description": gap_description,
            "routing": routing,
            "response_tier": 4 if classification == "solid" else 3 if classification else None,
            "response_band": "clear" if classification == "solid" else "chain" if classification else None,
            "tier_reason": (
                "The response names the key causal transition."
                if classification == "solid"
                else None
            ),
        },
        "llm_call": {
            "provider": "fake",
            "model": "fake-drill-evaluator",
            "latency_ms": 0,
            "usage": {"input_tokens": 0, "output_tokens": 0},
            **(
                {"raw_text": '{"classification":"solid"}'}
                if request.get("log_raw_llm")
                else {}
            ),
            **({"raw_prompt": request} if request.get("log_raw_llm") else {}),
        },
    }


def _is_vague_learner_text(text: str) -> bool:
    normalized = text.lower()
    return (
        "dont know" in normalized
        or "don't know" in normalized
        or "do not know" in normalized
        or "i believe other things" in normalized
        or "not sure" in normalized
    )


def _fake_repair_scaffold(request: dict[str, Any]) -> dict[str, Any]:
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

    node_label = str(request.get("node_label") or "core mechanism")
    node_mechanism = str(request.get("node_mechanism") or "the missing mechanism")
    gap_description = str(request.get("gap_description") or "").strip()
    if os.environ.get("SOCRATINK_TUI_FAKE_LEAKY_SCAFFOLD") == "1":
        scaffold = RepairScaffold(
            repair_target="Repair the full agent feedback loop.",
            before="The agent calls a tool.",
            missing_operation=(
                "observe the tool result, compare it to the goal, update context, "
                "refine the plan, and choose the next action"
            ),
            after="The agent chooses a better next action.",
            internal_bloom_lens="understand",
            question_style="direct",
            socratic_question=(
                "How does the agent observe the tool result, compare it to the goal, "
                "update context, refine the plan, and choose the next action?"
            ),
            analogical_prompt="If a chef tastes the soup before adding more salt, what must the chef do with that taste before deciding the next ingredient?",
            micro_scaffold_prompt="The agent calls a tool, ___ the result, then chooses the next action.",
        )
        return {
            "repair_scaffold": scaffold.model_dump(),
            "llm_call": {
                "provider": "fake",
                "model": "fake-leaky-repair-scaffold",
                "latency_ms": 0,
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        }

    learner_text = str(request.get("learner_text") or "")
    if _is_vague_learner_text(learner_text):
        scaffold = RepairScaffold(
            repair_target=f"Repair {node_label} by naming what changes between before and after.",
            before="The learner has a rough setup but not the missing transition.",
            missing_operation=gap_description or "the missing transition",
            after=f"The {node_label} explanation now links to the intended outcome.",
            internal_bloom_lens="understand",
            question_style="analogical",
            socratic_question=(
                "Using your own analogy, what change must happen between the before-state "
                "and after-state to make this mechanism work?"
            ),
            analogical_prompt=(
                "Imagine this as a before/after workflow: what intermediate change makes the after-state possible?"
            ),
            micro_scaffold_prompt=(
                f"{node_label} works when ___ connects the before-state to the after-state."
            ),
        )
        return {
            "repair_scaffold": scaffold.model_dump(),
            "llm_call": {
                "provider": "fake",
                "model": "fake-repair-scaffold",
                "latency_ms": 0,
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        }

    scaffold = RepairScaffold(
        repair_target=f"Name what has to happen for {node_label} to hold.",
        hinge_focus="memory cells form and stay ready",
        contrast_prompt=(
            "Your body meets a germ for the first time versus the second time"
        ),
        before="your body meets the germ for the first time",
        missing_operation="memory cells form and stay ready",
        after="the response is faster on the next exposure",
        internal_bloom_lens="understand",
        question_style="direct",
        socratic_question=(
            "The first time versus the second time your body sees a germ — "
            "what has to happen so the response is faster?"
        ),
        analogical_prompt=(
            "Compare meeting a new kid at school versus recognizing them again — "
            "what had to happen between those two moments?"
        ),
        micro_scaffold_prompt="First exposure leads to ___ which makes the next response faster.",
    )
    return {
        "repair_scaffold": scaffold.model_dump(),
        "llm_call": {
            "provider": "fake",
            "model": "fake-repair-scaffold",
            "latency_ms": 0,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        },
    }


def _fake_repair_dialogue(request: dict[str, Any]) -> dict[str, Any]:
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

    learner_text = str(request.get("learner_text") or "").lower()
    missing_operation = str(request.get("missing_operation") or "the missing operation")
    node_label = str(request.get("node_label") or "").lower()
    node_mechanism = str(request.get("node_mechanism") or "").lower()
    stopwords = {
        "before",
        "after",
        "state",
        "causal",
        "links",
        "link",
        "step",
        "missing",
        "operation",
        "target",
    }
    keywords = {
        token
        for token in (
            missing_operation.lower().split()
            + node_label.split()
            + node_mechanism.split()
        )
        if len(token) >= 5 and token not in stopwords
    }
    keyword_hits = sum(1 for token in keywords if token in learner_text)
    keyword_hit = keyword_hits >= 2
    confounder_bridge = "confound" in learner_text and (
        "correlation" in learner_text or "causation" in learner_text
    )
    if (
        keyword_hit
        or ("memory" in learner_text and "faster" in learner_text)
        or ("cache" in learner_text and "faster" in learner_text)
        or confounder_bridge
    ):
        judge = RepairDialogueJudge(
            contract_version="repair-dialogue-v2",
            classification="strong",
            score_eligible=False,
            graph_neutral=True,
            support_level="probe",
            causal_link_present=True,
            missing_operation_addressed=True,
            echo_risk=False,
            bridge_ready=True,
            next_action="commit_repair",
            progression_state="ready",
            improvement_observed=True,
            improvement_note="Learner now connects the hinge process to the outcome.",
            next_dialogue_action="commit_repair",
            judge_reason="The learner connected the starting situation to the outcome through the key process.",
            next_prompt="",
            not_mastery_reason="Inner repair dialogue is scaffold-adjacent practice; only spaced reconstruction can prove durable evidence.",
        )
    else:
        judge = RepairDialogueJudge(
            contract_version="repair-dialogue-v2",
            classification="thin",
            score_eligible=False,
            graph_neutral=True,
            support_level="probe",
            causal_link_present=False,
            missing_operation_addressed=False,
            echo_risk=True,
            bridge_ready=False,
            next_action="resume_repair",
            progression_state="no_change",
            improvement_observed=False,
            improvement_note="Learner repeated setup language without causal bridge.",
            next_dialogue_action="probe_again",
            judge_reason="The learner named pieces but didn't connect the key process to the outcome.",
            next_prompt=(
                f"Stay on this link: what has to happen — {missing_operation} — "
                "to get from the starting situation to the outcome?"
            ),
            not_mastery_reason="This turn is dialogue routing, not independent spaced reconstruction evidence.",
        )
    return {
        "repair_dialogue": judge.model_dump(),
        "llm_call": {
            "provider": "fake",
            "model": "fake-repair-dialogue",
            "latency_ms": 0,
            "usage": {"input_tokens": 0, "output_tokens": 0},
            **(
                {"raw_text": judge.model_dump_json()}
                if request.get("log_raw_llm")
                else {}
            ),
            **({"raw_prompt": request} if request.get("log_raw_llm") else {}),
        },
    }


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
        hinge = str(request.get("hinge_focus") or request.get("missing_operation") or "the key process")
        contrast = str(
            request.get("contrast_prompt")
            or f"Picture {before} versus later when {after}"
        )
        if question_style == "analogical":
            question = (
                f"{contrast} What process — {hinge} — would explain the difference?"
            )
        else:
            question = f"{contrast} What has to happen: {hinge}?"
        return {
            "socratic_question": question,
            "llm_call": {
                "provider": "fake",
                "model": "fake-socratic-repair-drill",
                "latency_ms": 0,
                "usage": {"input_tokens": 0, "output_tokens": 0},
            },
        }

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
