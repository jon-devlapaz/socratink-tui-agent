"""Fake LLM harness for bridge subprocess contract tests."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

WORKSPACE_ROOT = Path(__file__).resolve().parent
VENDOR_PYTHON_ROOT = WORKSPACE_ROOT / "vendor" / "python"
if str(VENDOR_PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(VENDOR_PYTHON_ROOT))

from models.provisional_map import (
    BackboneItem,
    Cluster,
    LearnerScaffold,
    Metadata,
    ProvisionalMap,
    Relationships,
    Subnode,
)

import prompt_templates
from bridge_contracts import RepairDialogueJudge, RepairScaffold, SocraticRepairDrill


def fake_map_uses_cache_route(concept_token: str) -> bool:
    """Match cache-themed concepts without treating 'memory' as 'memo'."""
    if any(token in concept_token for token in ("cache", "caching", "redis")):
        return True
    return any(
        token in concept_token
        for token in ("memoization", "memoize", "memoized", "memoizing")
    )


def fake_map_uses_immune_route(concept_token: str) -> bool:
    """Immune-memory fixture route for vaccine/immunity dogfood scripts only."""
    return any(
        token in concept_token
        for token in ("immune", "vaccine", "antigen", "antibody", "immunity")
    )


def fake_map(concept: str) -> ProvisionalMap:
    concept_clean = concept.strip() or "Core concept"
    concept_token = concept_clean.lower()
    cluster_label = "Memory bridge"
    backbone_principle = "Safe preview creates durable response memory."
    if fake_map_uses_cache_route(concept_token):
        bridge_label = "Cache hit path"
        cluster_label = "Cache bridge"
        backbone_principle = "Storing a result makes a later identical request faster."
        mechanism = (
            "The first request computes and stores the result, then later identical "
            "requests read from cache and return faster."
        )
        entry_prompt = "In your own words, why does saving a computed result make the later request faster?"
        expected_shape = (
            "first compute -> store result -> cache hit -> faster later response"
        )
        sentence_starter = "Caching helps because..."
        blank_hint = "Name the store-and-reuse step."
        evidence_goal = "The learner reconstructs how storing an earlier result enables a faster repeat response."
        core_thesis = (
            f"{concept_clean} depends on storing and reusing prior computation."
        )
    elif fake_map_uses_immune_route(concept_token):
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
        evidence_goal = "The learner reconstructs how immune memory links safe exposure to faster response."
        core_thesis = f"{concept_clean} depends on a safe preview creating durable response memory."
    else:
        bridge_label = concept_clean
        cluster_label = f"{concept_clean} bridge"
        backbone_principle = f"An early pass at {concept_clean} shapes how you respond when it appears again."
        mechanism = (
            f"A first encounter with {concept_clean} leaves a trace, and a later encounter "
            "can build on that trace instead of starting from zero."
        )
        entry_prompt = (
            f"In your own words, how does an earlier encounter with {concept_clean} "
            "change a later response?"
        )
        expected_shape = f"first encounter with {concept_clean} -> retained trace -> later reuse -> changed response"
        sentence_starter = f"When {concept_clean} shows up again,"
        blank_hint = f"Name what carries over from the first {concept_clean} encounter."
        evidence_goal = f"The learner reconstructs how {concept_clean} links an earlier encounter to a later response."
        core_thesis = f"{concept_clean} depends on carrying something forward from an earlier encounter."

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


def has_fake_causal_chain(learner_text: str) -> bool:
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
    return has_first and has_later and has_store and has_read and has_causal


def is_fake_misconception_cache(learner_text: str) -> bool:
    normalized = learner_text.lower()
    return (
        "cache hit" in normalized
        and "compute" in normalized
        and (
            "then save" in normalized
            or "then stores" in normalized
            or "only then saves" in normalized
        )
    )


def is_fake_deep_partial(learner_text: str) -> bool:
    normalized = learner_text.lower()
    return (
        "have not explained" in normalized
        or "haven't explained" in normalized
        or "not explained what happens" in normalized
    )


def is_fake_fluent_shallow(learner_text: str) -> bool:
    if has_fake_causal_chain(learner_text):
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
    return (
        any(term in normalized for term in label_terms)
        and len(normalized.split()) >= 12
    )


def is_fake_label_only_shallow(learner_text: str) -> bool:
    if has_fake_causal_chain(learner_text):
        return False
    normalized = learner_text.lower()
    return "caching stores" in normalized or (
        "cache" in normalized and len(normalized.split()) <= 10
    )


def fake_evaluator_classification(
    learner_text: str,
    *,
    drill_mode: str,
) -> tuple[str | None, str, bool, str | None, str]:
    """Fake L2 classifier aligned with evaluator v6 causal rubric (CI only)."""
    from models.drill_attempts import has_substantive_attempt, infer_help_request_reason

    if drill_mode == "cold_attempt" and not has_substantive_attempt(learner_text):
        reason = infer_help_request_reason(learner_text) or "explicit_unknown"
        return None, "help_request", False, reason, "SCAFFOLD"

    if is_fake_misconception_cache(learner_text):
        return "misconception", "attempt", True, "none", "SCAFFOLD"

    if is_fake_deep_partial(learner_text):
        return "deep", "attempt", True, "none", "PROBE"

    if has_fake_causal_chain(learner_text):
        return "solid", "attempt", True, "none", "NEXT"

    if is_fake_fluent_shallow(learner_text) or is_fake_label_only_shallow(
        learner_text
    ):
        routing = "PROBE" if drill_mode in ("gap_drill", "spaced_redrill") else "NEXT"
        return "shallow", "attempt", True, "none", routing

    if drill_mode == "gap_drill":
        return "shallow", "attempt", True, "none", "PROBE"
    return "shallow", "attempt", True, "none", "NEXT"


def fake_cold_help_evaluation(learner_text: str) -> dict[str, Any]:
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


def fake_evaluation(request: dict[str, Any]) -> dict[str, Any]:
    from models.drill_attempts import has_substantive_attempt

    eval_tmpl = prompt_templates.TEMPLATES["evaluator"]
    fake_drill_mode = str(request.get("drill_mode") or "cold_attempt")
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
        mode=(
            fake_drill_mode
            if fake_drill_mode in eval_tmpl["fixed"]["modes"]
            else "re_drill"
        ),
    )

    mode = str(request.get("drill_mode") or "cold_attempt")
    learner_text = str(request.get("learner_text") or "")
    node_label = str(request.get("node_label") or "").strip() or "this target node"

    if mode == "cold_attempt" and not has_substantive_attempt(learner_text):
        evaluation = fake_cold_help_evaluation(learner_text)
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
        fake_evaluator_classification(learner_text, drill_mode=mode)
    )
    if mode == "cold_attempt" and os.environ.get(
        "SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION"
    ):
        classification = os.environ["SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION"]
        answer_mode = "attempt"
        score_eligible = True
        help_reason = "none"
        routing = "NEXT" if classification == "solid" else "PROBE"
    elif mode == "spaced_redrill" and os.environ.get(
        "SOCRATINK_TUI_FAKE_SPACED_CLASSIFICATION"
    ):
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
            "response_tier": 4
            if classification == "solid"
            else 3
            if classification
            else None,
            "response_band": "clear"
            if classification == "solid"
            else "chain"
            if classification
            else None,
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


def is_vague_learner_text(text: str) -> bool:
    normalized = text.lower()
    return (
        "dont know" in normalized
        or "don't know" in normalized
        or "do not know" in normalized
        or "i believe other things" in normalized
        or "not sure" in normalized
    )


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

    node_label = str(request.get("node_label") or "core mechanism")
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
    if is_vague_learner_text(learner_text):
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
            "repair_target": str(request.get("repair_target") or "name the missing process"),
            "hinge_focus": hinge,
            "contrast_prompt": contrast,
            "before": before,
            "missing_operation": str(request.get("missing_operation") or hinge),
            "after": after,
            "learner_text": str(request.get("learner_text") or ""),
            "question_style": question_style,
        },
    )
    if question_style == "analogical":
        question = (
            f"{contrast} What process — {hinge} — would explain the difference?"
        )
    else:
        question = f"{contrast} What has to happen: {hinge}?"
    drill = SocraticRepairDrill(socratic_question=question)
    return {
        "socratic_question": drill.socratic_question,
        "llm_call": {
            "provider": "fake",
            "model": "fake-socratic-repair-drill",
            "latency_ms": 0,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        },
    }


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
