# models/

Provisional-map data model. The shape every part of the pipeline (extract,
smallest-route generation, draft, drill, repair-reps) reads and writes.
Pydantic-backed; the `parsed` field of map-producing `StructuredLLMResult`
objects is an instance of `ProvisionalMap`.

## Public surface

Import from `models` directly.

| Export | What it is |
| :--- | :--- |
| `ProvisionalMap` | The top-level container. `metadata`, `backbone`, `clusters`, `relationships`, `learning_prereqs`, `frameworks`, `domain_mechanics`. |
| `BackboneItem` | A backbone principle (causal spine of the domain). |
| `Cluster` | A cluster of related subnodes around a backbone item. |
| `Subnode` | A leaf concept. `learner_scaffold` is optional on the general model, but required on generated source-less smallest-route subnodes as non-answer task copy and evaluator scope. |
| `Relationships` | Edges between nodes. |
| `LearningPrereq` | A directed prerequisite edge. |
| `Framework` | A reusable analytical lens. |
| `DomainMechanic` | A domain-specific causal mechanism. |
| `Metadata` | Map-level provenance (source, model, run id). |
| `BackboneId`, `ClusterId`, `SubnodeId` | Strongly-typed identifier wrappers (NewType-style). |
| `IdKind`, `parse_id(s)` | Identifier kind tag + parser that returns the right ID class given a raw string. |
| `CORE_THESIS` | The reserved identifier for the map's core thesis node. Used by drill routing. |
| `is_substantive_sketch(text)` | Legacy/parity helper: does this sketch pass the older substantive-sketch threshold? Not the current source-less `/api/extract` gate. |
| `HelpRequestReason`, `infer_help_request_reason(text)` / `has_substantive_attempt(text)` | Cold-attempt intent classifiers (help request vs genuine generative commitment) plus the Literal tag they return. |
| `RepairRep`, `RepairRepsEvaluation`, `RepairRepsResult` | Repair Reps response contracts; graph-neutral typed micro-practice, not graph-truth mutation. |
| `parse_repair_reps_response(response)` | Strict parser for provider responses; rejects extra routing/scoring fields before returning the loose Gemini-compatible schema. |
| `validate_repair_reps_result(evaluation, expected_count=...)` | Post-parse validation for exact count, non-empty ids/prompts/bridges/cues, and duplicate ids. |
| `validate_knowledge_map(knowledge_map)` | Wire-shape check on the dict form: requires `metadata`/`backbone`/`clusters`, and validates optional `relationships` (object) and `frameworks` (list) containers when present. |
| `knowledge_map_has_node(knowledge_map, node_id)` | Membership test across `core-thesis`, backbone, clusters, and subnodes. |
| `resolve_target_cluster_id(knowledge_map, target_node_id)` | Resolves a node id to its enclosing cluster id (or the id itself for cluster targets); returns `None` if absent. |
| `prune_context(knowledge_map, target_node_id)` | Returns a target-local view of the map for prompt context (backbone vs cluster/subnode targets handled distinctly). |

## Files

| File | Role |
| :--- | :--- |
| `provisional_map.py` | Pydantic models for the full map structure. |
| `identifiers.py` | ID types, `IdKind`, `parse_id`, `CORE_THESIS`. |
| `drill_attempts.py` | Pure cold-attempt intent classifiers used before drill scoring/routing normalization. |
| `sketch_validation.py` | Legacy/parity `is_substantive_sketch` heuristic (stopwords, min substantive tokens). |
| `knowledge_map_context.py` | Wire-shape validators and target-local context pruning used by drill and Repair Reps routes. |
| `repair_reps.py` | Repair Reps response models, strict parsing, and result validation. |

## Footguns

- **`CORE_THESIS` is a reserved identifier**, not a backbone item like the
  others. Drill routing and the graph view both special-case it. If you
  rename it you will break the drill state machine.
- **Identifier types are not interchangeable.** `BackboneId`, `ClusterId`,
  and `SubnodeId` look like strings but the type system separates them.
  Use `parse_id()` when you have a raw string of unknown kind; do not
  cast directly.
- **`is_substantive_sketch` is not the source-less launch-pad gate.** Current
  source-less extraction rejects only empty sketches; rough non-empty launch
  attempts may seed a smallest route but remain non-evidence. Keep this helper
  parity-stable for legacy/frontend callers instead of making it smarter.
- **`LearnerScaffold` is non-answer scaffolding.** Source-less smallest-route
  subnodes must carry plain learner task copy plus `evidence_goal`; the internal
  `bloom_level` must not be rendered as learner-facing taxonomy or treated as
  evidence about the learner. `_validate_smallest_route` also rejects scaffold
  fields that copy a substantial phrase from the hidden mechanism.
- **Pydantic v2 semantics.** All models are Pydantic v2 (`BaseModel`,
  `ConfigDict`). v1 patterns (`@validator`, `Config` class) do not work.
- **There is a current defensive `if text is None` check in
  `sketch_validation.py:115`** against a `str`-typed parameter. This
  violates AGENTS.md anti-defensiveness and is captured as a follow-up.
  Removing it is what enables flipping `warn_unreachable = True` in
  root `pyproject.toml` (`[tool.mypy]`).

## Related

- Schema producers: `app_prompts/extract-system-v1.txt` declares the base shape;
  `app_prompts/generate-smallest-route-system-v1.txt` produces the same model
  and owns the source-less `learner_scaffold` route-task shape.
- Validation: `ai_service.py` parses LLM output into `ProvisionalMap` and
  enforces smallest-route-only scaffold requirements in `_validate_smallest_route`.
- Drill consumer: drill agent reads the map and routes by node kind.
