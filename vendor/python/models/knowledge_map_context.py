"""Shared helpers for validating and pruning knowledge-map wire shapes.

These helpers operate on the dict form accepted by the drill and Repair Reps
routes. They do not mutate graph truth; they only verify map shape and produce
the target-local context sent into an LLM prompt.
"""
from __future__ import annotations

from typing import Any


def validate_knowledge_map(knowledge_map: dict[str, Any]) -> None:
    if not isinstance(knowledge_map, dict):
        raise ValueError("knowledge_map must be an object.")
    if not isinstance(knowledge_map.get("metadata"), dict):
        raise ValueError("knowledge_map.metadata must be an object.")
    if not isinstance(knowledge_map.get("backbone"), list):
        raise ValueError("knowledge_map.backbone must be a list.")
    if not isinstance(knowledge_map.get("clusters"), list):
        raise ValueError("knowledge_map.clusters must be a list.")
    relationships = knowledge_map.get("relationships")
    if relationships is not None and not isinstance(relationships, dict):
        raise ValueError("knowledge_map.relationships must be an object.")
    frameworks = knowledge_map.get("frameworks")
    if frameworks is not None and not isinstance(frameworks, list):
        raise ValueError("knowledge_map.frameworks must be a list.")


def knowledge_map_has_node(knowledge_map: dict[str, Any], node_id: str) -> bool:
    if node_id == "core-thesis":
        return True

    for backbone_item in knowledge_map.get("backbone", []):
        if isinstance(backbone_item, dict) and backbone_item.get("id") == node_id:
            return True

    for cluster in knowledge_map.get("clusters", []):
        if not isinstance(cluster, dict):
            continue
        if cluster.get("id") == node_id:
            return True
        for subnode in cluster.get("subnodes", []):
            if isinstance(subnode, dict) and subnode.get("id") == node_id:
                return True

    return False


def resolve_target_cluster_id(
    knowledge_map: dict[str, Any], target_node_id: str
) -> str | None:
    if target_node_id.startswith("c") and "_s" not in target_node_id:
        return target_node_id

    for cluster in knowledge_map.get("clusters", []):
        if not isinstance(cluster, dict):
            continue
        cluster_id = cluster.get("id")
        if isinstance(cluster_id, str) and cluster_id == target_node_id:
            return cluster_id
        for subnode in cluster.get("subnodes", []):
            if (
                isinstance(cluster_id, str)
                and isinstance(subnode, dict)
                and subnode.get("id") == target_node_id
            ):
                return cluster_id

    return None


def prune_context(knowledge_map: dict[str, Any], target_node_id: str) -> dict[str, Any]:
    metadata = knowledge_map.get("metadata") or {}
    pruned: dict[str, Any] = {
        "metadata": {
            "thesis": metadata.get("core_thesis"),
            "governing_assumptions": metadata.get("governing_assumptions") or [],
            "starting_map_context": metadata.get("starting_map_context"),
            "learner_goal": metadata.get("learner_goal"),
        }
    }
    relationships = knowledge_map.get("relationships") or {}
    frameworks = knowledge_map.get("frameworks") or []

    if target_node_id == "core-thesis" or target_node_id.startswith("b"):
        target_backbone = next(
            (
                item
                for item in knowledge_map.get("backbone", [])
                if isinstance(item, dict)
                and (
                    target_node_id == "core-thesis" or item.get("id") == target_node_id
                )
            ),
            None,
        )
        if target_backbone is None and knowledge_map.get("backbone"):
            target_backbone = knowledge_map["backbone"][0]

        dependent_cluster_ids = (
            set(target_backbone.get("dependent_clusters") or [])
            if isinstance(target_backbone, dict)
            else set()
        )
        cluster_shells = [
            {
                "id": cluster.get("id"),
                "label": cluster.get("label"),
                "description": cluster.get("description"),
            }
            for cluster in knowledge_map.get("clusters", [])
            if isinstance(cluster, dict) and cluster.get("id") in dependent_cluster_ids
        ]

        pruned["backbone"] = [target_backbone] if target_backbone else []
        pruned["clusters"] = cluster_shells
        pruned["relationships"] = relationships
        pruned["frameworks"] = frameworks
        return pruned

    target_cluster_id = resolve_target_cluster_id(knowledge_map, target_node_id)
    target_cluster = next(
        (
            cluster
            for cluster in knowledge_map.get("clusters", [])
            if isinstance(cluster, dict) and cluster.get("id") == target_cluster_id
        ),
        None,
    )

    pruned["clusters"] = [target_cluster] if target_cluster else []
    pruned["backbone"] = [
        item
        for item in knowledge_map.get("backbone", [])
        if isinstance(item, dict)
        and target_cluster_id in (item.get("dependent_clusters") or [])
    ]
    pruned["relationships"] = {
        "learning_prerequisites": [
            rel
            for rel in relationships.get("learning_prerequisites", [])
            if isinstance(rel, dict)
            and (
                rel.get("from") == target_cluster_id
                or rel.get("to") == target_cluster_id
            )
        ]
    }
    pruned["frameworks"] = [
        framework
        for framework in frameworks
        if isinstance(framework, dict)
        and target_cluster_id in (framework.get("source_clusters") or [])
    ]
    return pruned
