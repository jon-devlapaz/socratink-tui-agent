"""Safe default responses when fake bridge lookup misses."""

from __future__ import annotations

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

from bridge_fake_response import build_response_from_expect

UNKNOWN_LAUNCH_MARKERS = (
    "i don't know",
    "i dont know",
    "do not know",
    "don't know",
    "dont know",
    "not sure",
    "no idea",
    "unsure",
)


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
        entry_prompt = (
            "In your own words, why does saving a computed result make the later request faster?"
        )
        expected_shape = (
            "first compute -> store result -> cache hit -> faster later response"
        )
        sentence_starter = "Caching helps because..."
        blank_hint = "Name the store-and-reuse step."
        evidence_goal = (
            "The learner reconstructs how storing an earlier result enables a faster repeat response."
        )
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


def _launch_is_unknown(text: str) -> bool:
    normalized = " ".join(text.lower().split())
    if not normalized:
        return True
    return any(
        marker == normalized or marker in normalized for marker in UNKNOWN_LAUNCH_MARKERS
    )


def default_substrate_gate(request: dict[str, Any]) -> dict[str, Any]:
    substrate_refinement = str(request.get("substrate_refinement") or "").strip()
    seed_already_offered = bool(request.get("seed_already_offered"))
    launch_attempt = str(request.get("launch_attempt") or "")

    if substrate_refinement and seed_already_offered:
        classification = "minimal"
    elif _launch_is_unknown(launch_attempt):
        classification = "slow"
    else:
        classification = "fast"

    expect: dict[str, Any] = {
        "classification": classification,
        "substrate_adequate": classification == "fast",
        "graph_neutral": True,
        "score_eligible": False,
    }
    if classification == "slow":
        expect["seed_text_present"] = True
        expect["refinement_prompt_present"] = True
    else:
        expect["seed_text_present"] = False
        expect["refinement_prompt_present"] = False
    return build_response_from_expect("substrate-gate", expect, request)


def default_evaluate_attempt(request: dict[str, Any]) -> dict[str, Any]:
    mode = str(request.get("drill_mode") or "cold_attempt")
    routing = "PROBE" if mode == "gap_drill" else "NEXT"
    return build_response_from_expect(
        "evaluate-attempt",
        {
            "classification": "shallow",
            "answer_mode": "attempt",
            "score_eligible": True,
            "routing": routing,
            "help_request_reason": "none",
        },
        request,
    )


def default_repair_dialogue(request: dict[str, Any]) -> dict[str, Any]:
    return build_response_from_expect(
        "repair-dialogue",
        {
            "bridge_ready": False,
            "next_dialogue_action": "probe_again",
            "next_action": "resume_repair",
            "progression_state": "no_change",
        },
        request,
    )


def default_repair_scaffold(request: dict[str, Any]) -> dict[str, Any]:
    node_label = str(request.get("node_label") or "core mechanism")
    gap_description = str(request.get("gap_description") or "").strip()
    return build_response_from_expect(
        "repair-scaffold",
        {
            "repair_target": f"Name what has to happen for {node_label} to hold.",
            "missing_operation": gap_description or "the missing transition",
        },
        request,
    )


def default_socratic_repair_drill(request: dict[str, Any]) -> dict[str, Any]:
    return build_response_from_expect("socratic-repair-drill", {}, request)
