"""ProvisionalMap — the typed cognitive artifact contract.

Mirrors the JSON schemas described in ``app_prompts/extract-system-v1.txt``
and ``app_prompts/generate-smallest-route-system-v1.txt``. Application code
that consumes generated map output sees this type, never a dict. Structural
integrity is enforced at parse time:

  - Every id (backbone, cluster, subnode) matches the identifier grammar
  - Every subnode lives in its declared cluster (c1_s2 must be inside c1)
  - Every cluster id referenced by backbone, relationships, or frameworks exists
  - Every cluster is covered by at least one backbone's dependent_clusters
  - Every cluster has at least one subnode (MINIMUM DRILLABILITY RULE)
  - Learning-prerequisite edges form a DAG (no self-loops, no cycles, no reciprocals)

What is NOT enforced here:
  - Quality minimums (>=N nodes total): governed by the prompt
  - Framework quality gates: governed by the prompt
  - Smallest-route profile rules: governed by ``ai_service._validate_smallest_route``
    (for example, ``learner_scaffold`` is optional generally but required there)

Models do NOT use ``extra="forbid"`` because Gemini's response_schema
parameter rejects the resulting JSON Schema (additionalProperties: false).
See ``models/repair_reps.py:parse_repair_reps_response`` for the same precedent.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .identifiers import IdKind, parse_id


# --- Leaf shapes -------------------------------------------------------------


class Metadata(BaseModel):
    source_title: str
    core_thesis: str
    architecture_type: Literal[
        "causal_chain", "problem_solution", "comparison", "system_description"
    ]
    difficulty: Literal["easy", "medium", "hard"]
    governing_assumptions: List[str] = Field(default_factory=list)
    low_density: bool = False


class LearnerScaffold(BaseModel):
    """Non-answer task shape for the learner's local reconstruction attempt.

    Bloom is internal scaffolding metadata. The learner sees plain task labels,
    prompts, and hints, never the taxonomy label itself.
    """

    bloom_level: Literal["remember", "understand", "apply"]
    learner_move: str
    task_label: str
    task_cue: str
    tailoring_anchor: str
    entry_prompt: str
    expected_shape: str
    sentence_starter: str
    blank_hint: str
    evidence_goal: str


class Subnode(BaseModel):
    id: str
    label: str
    mechanism: str
    learner_scaffold: Optional[LearnerScaffold] = None
    drill_status: Optional[str] = None
    gap_type: Optional[str] = None
    gap_description: Optional[str] = None
    last_drilled: Optional[str] = None

    @field_validator("id")
    @classmethod
    def _subnode_only(cls, v: str) -> str:
        kind, _ = parse_id(v)
        if kind is not IdKind.SUBNODE:
            raise ValueError(f"subnode id must match c<N>_s<M>, got {v!r}")
        return v


class Cluster(BaseModel):
    id: str
    label: str
    description: str
    subnodes: List[Subnode] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _cluster_only(cls, v: str) -> str:
        kind, _ = parse_id(v)
        if kind is not IdKind.CLUSTER:
            raise ValueError(f"cluster id must match c<N>, got {v!r}")
        return v

    @model_validator(mode="after")
    def _subnodes_belong_to_this_cluster(self) -> "Cluster":
        for sn in self.subnodes:
            kind, parsed = parse_id(sn.id)
            assert kind is IdKind.SUBNODE
            if parsed.cluster_id != self.id:  # type: ignore[union-attr]
                raise ValueError(
                    f"subnode {sn.id!r} does not belong to cluster {self.id!r}"
                )
        return self

    @model_validator(mode="after")
    def _at_least_one_subnode(self) -> "Cluster":
        # Per extract prompt MINIMUM DRILLABILITY RULE.
        if not self.subnodes:
            raise ValueError(
                f"cluster {self.id!r} must contain at least one subnode (drillability rule)"
            )
        return self


class BackboneItem(BaseModel):
    id: str
    principle: str
    dependent_clusters: List[str] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _backbone_only(cls, v: str) -> str:
        kind, _ = parse_id(v)
        if kind is not IdKind.BACKBONE:
            raise ValueError(f"backbone id must match b<N>, got {v!r}")
        return v


class DomainMechanic(BaseModel):
    # populate_by_name lets construction via from_=... work even though the
    # JSON key is "from" (a Python keyword). Validation accepts either.
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    type: Literal["causal", "bidirectional", "amplifies", "suppresses", "tension"]
    mechanism: str


class LearningPrereq(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    rationale: str


class Relationships(BaseModel):
    domain_mechanics: List[DomainMechanic] = Field(default_factory=list)
    learning_prerequisites: List[LearningPrereq] = Field(default_factory=list)


class Framework(BaseModel):
    id: str
    name: str
    statement: str
    source_clusters: List[str] = Field(default_factory=list)
    external_application: str


# --- Top-level shape ---------------------------------------------------------


class ProvisionalMap(BaseModel):
    """A typed knowledge map. Consumed by drill, repair-reps, traversal."""

    metadata: Metadata
    backbone: List[BackboneItem]
    clusters: List[Cluster]
    relationships: Relationships
    frameworks: List[Framework] = Field(default_factory=list)

    # --- Closure validators ---

    @model_validator(mode="after")
    def _every_id_unique(self) -> "ProvisionalMap":
        ids = [c.id for c in self.clusters]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate cluster ids")
        bb_ids = [b.id for b in self.backbone]
        if len(bb_ids) != len(set(bb_ids)):
            raise ValueError("duplicate backbone ids")
        return self

    @model_validator(mode="after")
    def _backbone_dependent_clusters_exist(self) -> "ProvisionalMap":
        cluster_ids = {c.id for c in self.clusters}
        for bb in self.backbone:
            for ref in bb.dependent_clusters:
                if ref not in cluster_ids:
                    raise ValueError(
                        f"backbone {bb.id!r} lists unknown dependent_cluster {ref!r}"
                    )
        return self

    @model_validator(mode="after")
    def _every_cluster_covered_by_some_backbone(self) -> "ProvisionalMap":
        # Per BACKBONE COVERAGE RULE in extract-system-v1.txt.
        covered: set[str] = set()
        for bb in self.backbone:
            covered.update(bb.dependent_clusters)
        cluster_ids = {c.id for c in self.clusters}
        orphans = cluster_ids - covered
        if orphans:
            raise ValueError(
                f"clusters not covered by any backbone: {sorted(orphans)}"
            )
        return self

    @model_validator(mode="after")
    def _relationship_endpoints_exist(self) -> "ProvisionalMap":
        cluster_ids = {c.id for c in self.clusters}
        for dm in self.relationships.domain_mechanics:
            for ref in (dm.from_, dm.to):
                if ref not in cluster_ids:
                    raise ValueError(
                        f"domain_mechanics edge references unknown cluster {ref!r}"
                    )
        for lp in self.relationships.learning_prerequisites:
            for ref in (lp.from_, lp.to):
                if ref not in cluster_ids:
                    raise ValueError(
                        f"learning_prerequisites edge references unknown cluster {ref!r}"
                    )
            if lp.from_ == lp.to:
                raise ValueError(f"learning_prerequisite self-loop on {lp.from_!r}")
        return self

    @model_validator(mode="after")
    def _learning_prerequisites_acyclic(self) -> "ProvisionalMap":
        # Per GRAPH-SAFETY RULES FOR PREREQUISITES.
        edges: dict[str, list[str]] = {}
        prereqs = list(self.relationships.learning_prerequisites)

        # Reciprocal pair check (O(n^2) is fine for small n).
        seen_pairs: set[tuple[str, str]] = set()
        for lp in prereqs:
            pair = (lp.from_, lp.to)
            reverse = (lp.to, lp.from_)
            if reverse in seen_pairs:
                raise ValueError(
                    f"reciprocal learning prerequisite: {lp.from_!r}<->{lp.to!r}"
                )
            seen_pairs.add(pair)
            edges.setdefault(lp.from_, []).append(lp.to)

        # DFS cycle detection.
        WHITE, GRAY, BLACK = 0, 1, 2
        colors: dict[str, int] = {}

        def visit(node: str) -> None:
            colors[node] = GRAY
            for nb in edges.get(node, []):
                state = colors.get(nb, WHITE)
                if state == GRAY:
                    raise ValueError(
                        f"learning prerequisite cycle through {node!r}->{nb!r}"
                    )
                if state == WHITE:
                    visit(nb)
            colors[node] = BLACK

        for node in list(edges.keys()):
            if colors.get(node, WHITE) == WHITE:
                visit(node)
        return self

    @model_validator(mode="after")
    def _framework_source_clusters_exist(self) -> "ProvisionalMap":
        cluster_ids = {c.id for c in self.clusters}
        for fw in self.frameworks:
            for ref in fw.source_clusters:
                if ref not in cluster_ids:
                    raise ValueError(
                        f"framework {fw.id!r} references unknown cluster {ref!r}"
                    )
        return self
