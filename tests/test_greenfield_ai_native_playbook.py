from __future__ import annotations

import ast
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLAYBOOK = ROOT / "docs" / "greenfield-ai-native-implementation-plan.md"
BRIDGE_SLICE = [
    ROOT / "bridge.py",
    ROOT / "bridge_contracts.py",
    ROOT / "bridge_fake.py",
]

REQUIRED_SECTIONS = [
    "# Greenfield AI-Native Implementation Plan",
    "## Source Ledger",
    "## Scope And Non-Goals",
    "## Agent-Agnostic Architecture Contract",
    "## Greenfield Implementation Sequence",
    "## Socratink Mapping",
    "## Verification Gates",
    "## Security And Risk Controls",
    "## Maintenance Loop",
]

REQUIRED_SOURCE_MARKERS = {
    "OpenAI agent guide": "https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/",
    "OpenAI evals": "https://developers.openai.com/api/docs/guides/evaluation-best-practices",
    "OpenAI trace grading": "https://developers.openai.com/api/docs/guides/trace-grading",
    "Anthropic agents": "https://www.anthropic.com/engineering/building-effective-agents",
    "Google ADK criteria": "https://adk.dev/evaluate/criteria/",
    "Google ADK safety": "https://adk.dev/safety/",
    "AWS system design": "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/best-practices-system-design.html",
    "AWS observability": "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/observability-and-monitoring.html",
    "OWASP prompt injection": "https://genai.owasp.org/llmrisk/llm01-prompt-injection/",
    "OWASP excessive agency": "https://genai.owasp.org/llmrisk/llm062025-excessive-agency/",
    "NIST AI RMF": "https://www.nist.gov/itl/ai-risk-management-framework",
    "NIST GenAI profile": "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf",
}

REQUIRED_REPO_CONSTRAINTS = [
    "append-only `events[]`",
    "`nextPhase(events)`",
    "`prompt_templates.py`",
    "`training-store/training-derive`",
    "graph-neutral",
    "`SOCRATINK_TUI_FAKE_LLM=1`",
    "`./socratink-harness replay`",
    "`./socratink-harness routing-proof`",
]

FORBIDDEN_LOCK_IN_PHRASES = [
    "must use openai",
    "must use anthropic",
    "must use google",
    "must use gemini",
    "must use aws",
    "must use bedrock",
    "openai-only",
    "claude-only",
    "gemini-only",
    "bedrock-only",
    "vendor lock-in accepted",
]

FORBIDDEN_PROVIDER_IMPORT_ROOTS = {"openai", "anthropic", "boto3", "botocore"}
FORBIDDEN_GOOGLE_PROVIDER_ALIASES = {"genai", "generativeai"}


def read_playbook() -> str:
    assert PLAYBOOK.exists(), f"missing playbook: {PLAYBOOK}"
    return PLAYBOOK.read_text(encoding="utf-8")


def test_playbook_has_required_structure() -> None:
    text = read_playbook()

    for section in REQUIRED_SECTIONS:
        assert section in text

    headings = re.findall(r"^#{1,3} .+$", text, flags=re.MULTILINE)
    assert headings.index("# Greenfield AI-Native Implementation Plan") == 0


def test_playbook_is_source_backed_by_required_primary_sources() -> None:
    text = read_playbook()

    for label, url in REQUIRED_SOURCE_MARKERS.items():
        assert url in text, f"missing {label}: {url}"

    markdown_links = re.findall(r"\[[^\]]+\]\(https?://[^)]+\)", text)
    assert len(markdown_links) >= len(REQUIRED_SOURCE_MARKERS)
    assert "current as of 2026-05-31" in text.lower()


def test_playbook_preserves_socratink_contracts() -> None:
    text = read_playbook()

    for constraint in REQUIRED_REPO_CONSTRAINTS:
        assert constraint in text

    assert "Agents propose moves. Training store records events. Derivation decides truth." in text
    assert "source, learner goal, route, scaffolds, and help are context, not evidence" in text
    assert "only spaced strong reconstruction may derive `solidified`" in text


def test_playbook_is_agent_agnostic_and_rejects_vendor_lock_in() -> None:
    text = read_playbook()
    normalized = text.lower()

    assert "agent-agnostic" in normalized
    assert "provider-neutral" in normalized
    assert "no provider-specific sdk may be required in the core loop" in normalized
    assert "adapters must be replaceable behind stable local contracts" in normalized

    for phrase in FORBIDDEN_LOCK_IN_PHRASES:
        assert phrase not in normalized


def test_playbook_declares_bounded_repo_slice_and_prompt_ownership() -> None:
    text = read_playbook()
    normalized = " ".join(text.lower().split())

    assert "bounded repo slice" in normalized
    assert "one thin vertical path" in normalized
    assert "inline prompt strings are not allowed in bridge code" in normalized
    assert "one local guard" in normalized


def test_bridge_slice_keeps_provider_sdks_out_of_local_contracts() -> None:
    for path in BRIDGE_SLICE:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        forbidden: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported = alias.name
                    root = imported.split(".", 1)[0]
                    if root in FORBIDDEN_PROVIDER_IMPORT_ROOTS:
                        forbidden.append(imported)
                    if imported in {"google.genai", "google.generativeai"}:
                        forbidden.append(imported)
            elif isinstance(node, ast.ImportFrom):
                imported = node.module or ""
                root = imported.split(".", 1)[0]
                if root in FORBIDDEN_PROVIDER_IMPORT_ROOTS:
                    forbidden.append(imported)
                if imported in {"google.genai", "google.generativeai"}:
                    forbidden.append(imported)
                if imported == "google":
                    for alias in node.names:
                        if alias.name in FORBIDDEN_GOOGLE_PROVIDER_ALIASES:
                            forbidden.append(f"{imported}.{alias.name}")

        assert not forbidden, f"{path.name} imports provider SDKs: {forbidden}"


def test_bridge_slice_keeps_contract_and_fake_helpers_extracted() -> None:
    bridge_text = (ROOT / "bridge.py").read_text(encoding="utf-8")

    assert "import bridge_fake" in bridge_text
    assert "from bridge_contracts import" in bridge_text
    assert "class RepairScaffold" not in bridge_text
    assert "class SocraticRepairDrill" not in bridge_text
    assert "class RepairDialogueJudge" not in bridge_text
    assert '"fake source-less route prompt"' not in bridge_text

    assert "_fake_evaluation = bridge_fake.fake_evaluation" in bridge_text
    assert "_fake_repair_scaffold = bridge_fake.fake_repair_scaffold" in bridge_text
    assert "_fake_repair_dialogue = bridge_fake.fake_repair_dialogue" in bridge_text
    assert "_fake_socratic_repair_drill = bridge_fake.fake_socratic_repair_drill" in bridge_text

    assert 'prompt_templates.TEMPLATES["delta"]' in bridge_text
    assert 'prompt_templates.TEMPLATES["socratic_repair_drill"]' in bridge_text
    assert 'prompt_templates.TEMPLATES["repair_dialogue"]' in bridge_text
    assert 'prompt_templates.TEMPLATES["evaluator"]' in bridge_text
