"""Identifier grammar for ProvisionalMap nodes.

Grammar:
  - ``"core-thesis"`` — the single root concept of a map
  - ``"b<N>"`` — backbone node, N in 1..99
  - ``"c<N>"`` — cluster node, N in 1..99
  - ``"c<N>_s<M>"`` — subnode of cluster c<N>, M in 1..99

Parsing rejects everything else. This is the contract enforced at the
ProvisionalMap boundary.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Tuple, Union

CORE_THESIS = "core-thesis"

_BACKBONE_RE = re.compile(r"^b([1-9][0-9]?)$")
_CLUSTER_RE = re.compile(r"^c([1-9][0-9]?)$")
_SUBNODE_RE = re.compile(r"^(c[1-9][0-9]?)_s([1-9][0-9]?)$")


class IdKind(Enum):
    CORE_THESIS = "core-thesis"
    BACKBONE = "backbone"
    CLUSTER = "cluster"
    SUBNODE = "subnode"


@dataclass(frozen=True)
class BackboneId:
    raw: str

    def __str__(self) -> str:
        return self.raw


@dataclass(frozen=True)
class ClusterId:
    raw: str

    def __str__(self) -> str:
        return self.raw


@dataclass(frozen=True)
class SubnodeId:
    raw: str
    cluster_id: str

    def __str__(self) -> str:
        return self.raw


ParsedId = Union[str, BackboneId, ClusterId, SubnodeId]


def parse_id(value: str) -> Tuple[IdKind, ParsedId]:
    """Return ``(kind, parsed)``. Raises ``ValueError`` on malformed input."""
    if not isinstance(value, str) or not value:
        raise ValueError(f"id must be a non-empty string, got {value!r}")
    if value == CORE_THESIS:
        return IdKind.CORE_THESIS, value
    if _BACKBONE_RE.match(value):
        return IdKind.BACKBONE, BackboneId(raw=value)
    if _CLUSTER_RE.match(value):
        return IdKind.CLUSTER, ClusterId(raw=value)
    m = _SUBNODE_RE.match(value)
    if m:
        return IdKind.SUBNODE, SubnodeId(raw=value, cluster_id=m.group(1))
    raise ValueError(f"unrecognized id grammar: {value!r}")
