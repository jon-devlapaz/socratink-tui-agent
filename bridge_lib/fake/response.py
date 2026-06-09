"""Build full bridge JSON envelopes from L2 expect rows."""

from __future__ import annotations

from typing import Any

from bridge_lib.contracts import (
    RepairDialogueJudge,
    RepairScaffold,
    SocraticRepairDrill,
    SubstrateGateDecision,
    normalize_repair_dialogue_judge,
)

SUBSTRATE_SEED_TEXT = (
    "A safe preview lets the body notice a pattern without the full illness."
)
SUBSTRATE_REFINEMENT_PROMPT = (
    "Add one starting link in your own words: what changes after that preview?"
)

TEMPLATE_TO_ACTION = {
    "repair_dialogue": "repair-dialogue",
    "evaluator": "evaluate-attempt",
    "substrate_gate": "substrate-gate",
}


def _evaluation_agent_response(
    *,
    classification: str | None,
    answer_mode: str,
    node_label: str,
) -> str:
    if classification == "solid":
        return (
            "You named what starts it, what changes, and what results — "
            "that is a full causal chain in your own words."
        )
    if classification == "misconception":
        return (
            "That story cannot work as written — what would have to change "
            "in the mechanism for the outcome to make sense?"
        )
    if classification == "deep":
        return (
            "You have the starting situation and the outcome — name the key "
            "process that connects them in your own words."
        )
    if answer_mode == "help_request":
        return (
            "What do you think has to happen the first time versus "
            "when it happens again?"
        )
    return (
        f"You named pieces of {node_label}, but not the key process yet — "
        "what has to happen between the first time and the next time?"
    )


def _build_repair_dialogue_response(
    expect: dict[str, Any],
    request: dict[str, Any],
) -> dict[str, Any]:
    missing_operation = str(
        request.get("missing_operation") or "the missing operation"
    )
    bridge_ready = bool(expect.get("bridge_ready", False))
    next_dialogue_action = str(
        expect.get("next_dialogue_action")
        or ("commit_repair" if bridge_ready else "probe_again")
    )
    judge = RepairDialogueJudge(
        contract_version=str(expect.get("contract_version") or "repair-dialogue-v2"),
        classification=str(
            expect.get("classification") or ("strong" if bridge_ready else "thin")
        ),
        score_eligible=bool(expect.get("score_eligible", False)),
        graph_neutral=bool(expect.get("graph_neutral", True)),
        support_level=str(expect.get("support_level") or "probe"),
        causal_link_present=bool(
            expect.get("causal_link_present", bridge_ready)
        ),
        missing_operation_addressed=bool(
            expect.get("missing_operation_addressed", bridge_ready)
        ),
        echo_risk=bool(expect.get("echo_risk", not bridge_ready)),
        bridge_ready=bridge_ready,
        next_action=str(
            expect.get("next_action")
            or ("commit_repair" if bridge_ready else "resume_repair")
        ),
        progression_state=str(
            expect.get("progression_state")
            or ("ready" if bridge_ready else "no_change")
        ),
        improvement_observed=bool(
            expect.get("improvement_observed", bridge_ready)
        ),
        improvement_note=str(
            expect.get("improvement_note")
            or (
                "Learner now connects the hinge process to the outcome."
                if bridge_ready
                else "Learner repeated setup language without causal bridge."
            )
        ),
        next_dialogue_action=next_dialogue_action,
        judge_reason=str(
            expect.get("judge_reason")
            or (
                "The learner connected the starting situation to the outcome through the key process."
                if bridge_ready
                else "The learner named pieces but didn't connect the key process to the outcome."
            )
        ),
        next_prompt=str(
            expect.get("next_prompt")
            if "next_prompt" in expect
            else (
                ""
                if bridge_ready
                else (
                    f"Stay on this link: what has to happen — {missing_operation} — "
                    "to get from the starting situation to the outcome?"
                )
            )
        ),
        not_mastery_reason=str(
            expect.get("not_mastery_reason")
            or (
                "Inner repair dialogue is scaffold-adjacent practice; only spaced reconstruction can prove durable evidence."
                if bridge_ready
                else "This turn is dialogue routing, not independent spaced reconstruction evidence."
            )
        ),
    )
    judge = normalize_repair_dialogue_judge(judge)
    return {
        "repair_dialogue": judge.model_dump(),
        "llm_call": _fake_llm_call(
            model="fake-repair-dialogue",
            request=request,
            raw_text=judge.model_dump_json(),
        ),
    }


def _build_evaluate_attempt_response(
    expect: dict[str, Any],
    request: dict[str, Any],
) -> dict[str, Any]:
    classification = expect.get("classification")
    answer_mode = str(expect.get("answer_mode") or "attempt")
    score_eligible = bool(expect.get("score_eligible", True))
    help_reason = str(expect.get("help_request_reason") or "none")
    routing = str(expect.get("routing") or "NEXT")
    node_label = str(request.get("node_label") or "").strip() or "this target node"

    if answer_mode == "help_request":
        from models.drill_attempts import infer_help_request_reason

        help_reason = infer_help_request_reason(
            str(request.get("learner_text") or "")
        ) or help_reason or "explicit_unknown"
        evaluation = {
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
            "routing": routing or "SCAFFOLD",
            "response_tier": None,
            "response_band": None,
            "tier_reason": None,
        }
    else:
        gap_description = None
        if classification and classification != "solid":
            gap_description = f"what changes during {node_label.lower()}"
        evaluation = {
            "agent_response": _evaluation_agent_response(
                classification=classification,
                answer_mode=answer_mode,
                node_label=node_label,
            ),
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
        }

    raw_text = (
        '{"answer_mode":"help_request"}'
        if answer_mode == "help_request"
        else f'{{"classification":{json_quote(classification)}}}'
    )
    return {
        "evaluation": evaluation,
        "llm_call": _fake_llm_call(
            model="fake-drill-evaluator",
            request=request,
            raw_text=raw_text,
        ),
    }


def json_quote(value: Any) -> str:
    import json

    return json.dumps(value)


def _build_substrate_gate_response(
    expect: dict[str, Any],
    request: dict[str, Any],
) -> dict[str, Any]:
    classification = str(expect.get("classification") or "slow")
    substrate_adequate = bool(expect.get("substrate_adequate", classification == "fast"))
    seed_text = expect.get("seed_text")
    refinement_prompt = expect.get("refinement_prompt")
    if "seed_text_present" in expect:
        seed_text = SUBSTRATE_SEED_TEXT if expect["seed_text_present"] else None
    if "refinement_prompt_present" in expect:
        refinement_prompt = (
            SUBSTRATE_REFINEMENT_PROMPT
            if expect["refinement_prompt_present"]
            else None
        )
    if classification == "fast":
        seed_text = None
        refinement_prompt = None
        judge_reason = "Learner supplied an in-domain starting link."
    elif classification == "minimal":
        seed_text = None
        refinement_prompt = None
        judge_reason = "The post-seed refinement still has too little causal substrate."
    else:
        if seed_text is None and expect.get("seed_text_present", True):
            seed_text = SUBSTRATE_SEED_TEXT
        if refinement_prompt is None and expect.get("refinement_prompt_present", True):
            refinement_prompt = SUBSTRATE_REFINEMENT_PROMPT
        judge_reason = "The launch attempt is blank, unknown, or too label-only to route from."

    decision = SubstrateGateDecision(
        classification=classification,  # type: ignore[arg-type]
        substrate_adequate=substrate_adequate,
        seed_text=seed_text,
        refinement_prompt=refinement_prompt,
        judge_reason=str(expect.get("judge_reason") or judge_reason),
        graph_neutral=bool(expect.get("graph_neutral", True)),
        score_eligible=bool(expect.get("score_eligible", False)),
    )
    return {
        "substrate_gate": decision.model_dump(),
        "llm_call": _fake_llm_call(
            model="fake-substrate-gate",
            request=request,
            raw_text=decision.model_dump_json(),
        ),
    }


def _build_repair_scaffold_response(
    expect: dict[str, Any],
    request: dict[str, Any],
) -> dict[str, Any]:
    node_label = str(request.get("node_label") or "core mechanism")
    gap_description = str(request.get("gap_description") or "").strip()
    scaffold = RepairScaffold(
        repair_target=str(
            expect.get("repair_target")
            or f"Name what has to happen for {node_label} to hold."
        ),
        hinge_focus=str(expect.get("hinge_focus") or "memory cells form and stay ready"),
        contrast_prompt=str(
            expect.get("contrast_prompt")
            or "Your body meets a germ for the first time versus the second time"
        ),
        before=str(
            expect.get("before") or "your body meets the germ for the first time"
        ),
        missing_operation=str(
            expect.get("missing_operation") or "memory cells form and stay ready"
        ),
        after=str(
            expect.get("after") or "the response is faster on the next exposure"
        ),
        internal_bloom_lens=str(expect.get("internal_bloom_lens") or "understand"),
        question_style=str(expect.get("question_style") or "direct"),
        socratic_question=str(
            expect.get("socratic_question")
            or (
                "The first time versus the second time your body sees a germ — "
                "what has to happen so the response is faster?"
            )
        ),
        analogical_prompt=str(
            expect.get("analogical_prompt")
            or (
                "Compare meeting a new kid at school versus recognizing them again — "
                "what had to happen between those two moments?"
            )
        ),
        micro_scaffold_prompt=str(
            expect.get("micro_scaffold_prompt")
            or "First exposure leads to ___ which makes the next response faster."
        ),
    )
    return {
        "repair_scaffold": scaffold.model_dump(),
        "llm_call": _fake_llm_call(model="fake-repair-scaffold", request=request),
    }


def _build_socratic_repair_drill_response(
    expect: dict[str, Any],
    request: dict[str, Any],
) -> dict[str, Any]:
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
    question = str(
        expect.get("socratic_question")
        or (
            f"{contrast} What process — {hinge} — would explain the difference?"
            if question_style == "analogical"
            else f"{contrast} What has to happen: {hinge}?"
        )
    )
    drill = SocraticRepairDrill(socratic_question=question)
    return {
        "socratic_question": drill.socratic_question,
        "llm_call": _fake_llm_call(
            model="fake-socratic-repair-drill",
            request=request,
        ),
    }


def _fake_llm_call(
    *,
    model: str,
    request: dict[str, Any],
    raw_text: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "provider": "fake",
        "model": model,
        "latency_ms": 0,
        "usage": {"input_tokens": 0, "output_tokens": 0},
    }
    if request.get("log_raw_llm"):
        if raw_text is not None:
            payload["raw_text"] = raw_text
        payload["raw_prompt"] = request
    return payload


def build_response_from_expect(
    action: str,
    expect: dict[str, Any],
    request: dict[str, Any],
) -> dict[str, Any]:
    if action == "repair-dialogue":
        return _build_repair_dialogue_response(expect, request)
    if action == "evaluate-attempt":
        return _build_evaluate_attempt_response(expect, request)
    if action == "substrate-gate":
        return _build_substrate_gate_response(expect, request)
    if action == "repair-scaffold":
        return _build_repair_scaffold_response(expect, request)
    if action == "socratic-repair-drill":
        return _build_socratic_repair_drill_response(expect, request)
    raise ValueError(f"unsupported fake action for expect lookup: {action}")
