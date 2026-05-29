"""Contract tests for the vendored ai_service seam the TUI bridge depends on.

These fail loudly if a sync from socratink-app renames or reshapes an API the
bridge calls, instead of letting the breakage surface as an opaque runtime error
in a founder dogfood session.
"""

from __future__ import annotations

import inspect
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
VENDOR_PYTHON_ROOT = WORKSPACE_ROOT / "vendor" / "python"
sys.path.insert(0, str(WORKSPACE_ROOT))
sys.path.insert(0, str(VENDOR_PYTHON_ROOT))

import ai_service


def test_normalize_drill_evaluation_exists_and_is_callable() -> None:
    fn = getattr(ai_service, "_normalize_drill_evaluation", None)
    assert callable(fn), "ai_service._normalize_drill_evaluation missing or not callable"


def test_normalize_drill_evaluation_accepts_bridge_kwargs() -> None:
    # bridge._normalize_tui_evaluation calls it with exactly these keywords.
    sig = inspect.signature(ai_service._normalize_drill_evaluation)
    for required in (
        "session_phase",
        "drill_mode",
        "probe_count",
        "latest_learner_message",
    ):
        assert required in sig.parameters, (
            f"ai_service._normalize_drill_evaluation lost keyword '{required}' "
            "that the TUI bridge depends on"
        )


def test_bridge_imports_with_guard() -> None:
    # Importing the bridge runs the module-level fail-closed guard; if the seam
    # were missing this import would raise a clear RuntimeError.
    import bridge

    assert hasattr(bridge, "_normalize_tui_evaluation")


def test_substantive_cold_attempt_scores_despite_llm_unscored_flags() -> None:
    """Live evaluators often praise cold attempts but omit classification."""
    evaluation = ai_service.DrillEvaluation(
        agent_response="Good start — keep going.",
        generative_commitment=False,
        answer_mode="help_request",
        score_eligible=False,
        classification=None,
        routing="SCAFFOLD",
        gap_description="Learner produced zero schema; nudge to guess.",
    )
    learner_text = (
        "Plants take in CO2 and water and use sunlight to make sugar "
        "and release oxygen."
    )
    normalized = ai_service._normalize_drill_evaluation(
        evaluation,
        session_phase="drill",
        drill_mode="cold_attempt",
        probe_count=0,
        latest_learner_message=learner_text,
    )
    assert normalized.score_eligible is True
    assert normalized.classification == "shallow"
    assert normalized.answer_mode == "attempt"
    assert normalized.generative_commitment is True


def test_non_substantive_cold_stays_unscored_help() -> None:
    evaluation = ai_service.DrillEvaluation(
        agent_response="Try one rough causal guess in your own words.",
        score_eligible=False,
        classification=None,
        routing="SCAFFOLD",
    )
    normalized = ai_service._normalize_drill_evaluation(
        evaluation,
        session_phase="drill",
        drill_mode="cold_attempt",
        probe_count=0,
        latest_learner_message="I'm not sure",
    )
    assert normalized.score_eligible is False
    assert normalized.answer_mode == "help_request"
    assert normalized.classification is None
