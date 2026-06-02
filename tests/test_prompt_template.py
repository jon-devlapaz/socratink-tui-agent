"""Tests for the structured prompt template system."""

from __future__ import annotations

import json
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE_ROOT))

import pytest

from prompt_templates import TEMPLATES, build_prompt


@pytest.fixture
def delta_template():
    return TEMPLATES["delta"]


@pytest.fixture
def route_template():
    return TEMPLATES["route"]


@pytest.fixture
def evaluator_template():
    return TEMPLATES["evaluator"]


@pytest.fixture
def repair_dialogue_template():
    return TEMPLATES["repair_dialogue"]


@pytest.fixture
def substrate_gate_template():
    return TEMPLATES["substrate_gate"]


class TestPromptBuilder:
    """Tests for build_prompt()."""

    def test_system_prompt_contains_role_and_task(self, delta_template):
        result = build_prompt(
            delta_template,
            {
                "node_label": "Test Node",
                "node_mechanism": "A leads to B.",
                "learner_text": "B happens.",
                "gap_description": "missing A to B link",
                "evidence_goal": "explain A to B",
                "blank_hint": "what bridges",
                "is_misconception": "false",
            },
        )
        assert "Socratink's Delta repair scaffold agent" in result["system_prompt"]
        assert "mechanism-first scaffolds" in result["system_prompt"]

    def test_system_prompt_contains_output_rules(self, delta_template):
        result = build_prompt(
            delta_template,
            {
                "node_label": "Test Node",
                "node_mechanism": "A leads to B.",
                "learner_text": "B happens.",
                "gap_description": "missing A to B link",
                "evidence_goal": "explain A to B",
                "blank_hint": "what bridges",
                "is_misconception": "false",
            },
        )
        assert "Do not reveal the answer key" in result["system_prompt"]
        assert "Never flatter, grade, or use Bloom/taxonomy labels" in result["system_prompt"]

    def test_dynamic_values_are_substituted(self, delta_template):
        result = build_prompt(
            delta_template,
            {
                "node_label": "Immune Memory",
                "node_mechanism": "Vaccine creates memory cells.",
                "learner_text": "I think vaccines help.",
                "gap_description": "missing causal link",
                "evidence_goal": "explain memory",
                "blank_hint": "name what remains",
                "is_misconception": "false",
            },
        )
        user_prompt = json.loads(result["user_prompt"])
        assert user_prompt["target_node"]["label"] == "Immune Memory"
        assert user_prompt["learner_attempt"] == "I think vaccines help."
        assert user_prompt["is_misconception"] == "false"

    def test_route_template_substitution(self, route_template):
        result = build_prompt(
            route_template,
            {
                "concept": "Feedback Loops",
                "launch_attempt": "Loops connect output to input.",
                "substrate_adequacy": "adequate",
                "learner_goal": "explain control theory",
            },
        )
        assert "Route Agent" in result["system_prompt"]
        user_prompt = json.loads(result["user_prompt"])
        assert user_prompt["concept"] == "Feedback Loops"
        assert user_prompt["launch_attempt"] == "Loops connect output to input."
        assert user_prompt["substrate_adequacy"] == "adequate"
        assert "threshold" not in user_prompt

    def test_substrate_gate_template_substitution(self, substrate_gate_template):
        result = build_prompt(
            substrate_gate_template,
            {
                "concept": "Immune memory",
                "learner_goal": "explain vaccines",
                "launch_attempt": "I don't know.",
                "substrate_refinement": None,
                "seed_already_offered": "false",
            },
        )
        assert "Substrate Gate agent" in result["system_prompt"]
        assert "score_eligible=false" in result["system_prompt"]
        user_prompt = json.loads(result["user_prompt"])
        assert user_prompt["concept"] == "Immune memory"
        assert user_prompt["substrate_refinement"] is None

    def test_evaluator_template_substitution(self, evaluator_template):
        result = build_prompt(
            evaluator_template,
            {
                "node_id": "n1",
                "node_label": "Homeostasis",
                "node_mechanism": "Feedback maintains stability.",
                "learner_text": "The body adjusts.",
                "drill_mode": "cold_attempt",
                "repair_drill_context": None,
                "knowledge_map": {},
            },
            mode="cold_attempt",
        )
        assert "Evidence Judge" in result["system_prompt"]
        assert "MODE: COLD ATTEMPT" in result["system_prompt"]
        user_prompt = json.loads(result["user_prompt"])
        assert user_prompt["target_node"]["id"] == "n1"
        # Structured/optional slots pass through unchanged (dict, None).
        assert user_prompt["knowledge_map"] == {}
        assert user_prompt["repair_drill_context"] is None

    def test_repair_dialogue_template_substitution(self, repair_dialogue_template):
        result = build_prompt(
            repair_dialogue_template,
            {
                "node_label": "Test Node",
                "node_mechanism": "A leads to B.",
                "learner_text": "The learner's answer.",
                "turn_index": "1",
                "gap_id": "gap-1",
                "before": "before state",
                "missing_operation": "the missing link",
                "after": "after state",
            },
        )
        assert "repair-dialogue judge" in result["system_prompt"]
        user_prompt = json.loads(result["user_prompt"])
        assert user_prompt["gap"]["before"] == "before state"
        assert user_prompt["gap"]["missing_operation"] == "the missing link"
        assert user_prompt["turn_index"] == "1"

    def test_missing_params_raise_keyerror(self, delta_template):
        with pytest.raises(KeyError):
            build_prompt(delta_template, {})

    def test_system_prompt_has_no_unsubstituted_placeholders(self, delta_template):
        result = build_prompt(
            delta_template,
            {
                "node_label": "X",
                "node_mechanism": "X leads to Y.",
                "learner_text": "Y happens.",
                "gap_description": "missing link",
                "evidence_goal": "explain",
                "blank_hint": "bridge",
                "is_misconception": "false",
            },
        )
        assert "{" not in result["system_prompt"]
        assert "}" not in result["system_prompt"]


class TestTemplateConsistency:
    """Cross-template consistency checks."""

    def test_all_templates_have_role_task_rules(
        self,
        delta_template,
        route_template,
        evaluator_template,
        repair_dialogue_template,
        substrate_gate_template,
    ):
        for name, tmpl in [
            ("delta", delta_template),
            ("route", route_template),
            ("evaluator", evaluator_template),
            ("repair_dialogue", repair_dialogue_template),
            ("substrate_gate", substrate_gate_template),
        ]:
            assert "role" in tmpl["fixed"], f"{name} missing role"
            assert "task" in tmpl["fixed"], f"{name} missing task"
            assert "output_rules" in tmpl["fixed"], f"{name} missing output_rules"

    def test_no_answer_key_in_user_prompt(self, delta_template, evaluator_template):
        for name, tmpl in [
            ("delta", delta_template),
            ("evaluator", evaluator_template),
        ]:
            dynamic_str = json.dumps(tmpl["dynamic"])
            assert "answer key" not in dynamic_str.lower(), (
                f"{name} user prompt leaks answer key phrase"
            )


class TestVersioning:
    """Template version tracking."""

    def test_templates_have_version(
        self,
        delta_template,
        route_template,
        evaluator_template,
        repair_dialogue_template,
        substrate_gate_template,
    ):
        for name, tmpl in [
            ("delta", delta_template),
            ("route", route_template),
            ("evaluator", evaluator_template),
            ("repair_dialogue", repair_dialogue_template),
            ("substrate_gate", substrate_gate_template),
        ]:
            assert "version" in tmpl, f"{name} missing version field"

    def test_versions_are_strings(
        self,
        delta_template,
        route_template,
        evaluator_template,
        repair_dialogue_template,
        substrate_gate_template,
    ):
        for name, tmpl in [
            ("delta", delta_template),
            ("route", route_template),
            ("evaluator", evaluator_template),
            ("repair_dialogue", repair_dialogue_template),
            ("substrate_gate", substrate_gate_template),
        ]:
            assert isinstance(tmpl.get("version"), str), f"{name} version not a string"


class TestAllTemplates:
    """Every template in TEMPLATES is valid."""

    def test_every_template_has_required_fields(self):
        for name, tmpl in TEMPLATES.items():
            assert "version" in tmpl, f"{name}: missing version"
            assert "fixed" in tmpl, f"{name}: missing fixed"
            assert "dynamic" in tmpl, f"{name}: missing dynamic"
            assert "role" in tmpl["fixed"], f"{name}: missing role"
            assert "task" in tmpl["fixed"], f"{name}: missing task"
