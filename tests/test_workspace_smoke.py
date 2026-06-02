"""Smoke tests for the standalone Socratink TUI workspace."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
VENV_PYTHON = WORKSPACE_ROOT / ".venv" / "bin" / "python"


def run_command(args: list[str], *, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    # Intentionally do NOT set SOCRATINK_APP_ROOT: the TUI is self-contained and
    # the bridge must resolve the vendored Python seam (vendor/python/). Pin the
    # bridge interpreter to the local venv so the vendor tree is actually used.
    merged_env.pop("SOCRATINK_APP_ROOT", None)
    merged_env.update(
        {
            "SOCRATINK_TUI_FAKE_LLM": "1",
            "SOCRATINK_TUI_FAKE_COLD_CLASSIFICATION": "shallow",
        }
    )
    if VENV_PYTHON.exists():
        merged_env.setdefault("PYTHON", str(VENV_PYTHON))
    merged_env.update(env or {})
    return subprocess.run(
        args,
        cwd=WORKSPACE_ROOT,
        capture_output=True,
        text=True,
        timeout=30,
        env=merged_env,
    )


def test_scripted_tui_runs_from_standalone_workspace(tmp_path: Path) -> None:
    result = run_command(
        [
            str(WORKSPACE_ROOT / "socratink-tui"),
            "--scripted",
            "fixtures/help_script.json",
            "--color=never",
        ],
        env={"SOCRATINK_TUI_LOG_ROOT": str(tmp_path)},
    )

    assert result.returncode == 0, result.stderr
    assert "[Help] Concept" in result.stdout
    assert "[Repair Dialogue]" in result.stdout
    assert "[Model Bridge]" in result.stdout
    assert "[Evidence] primed" in result.stdout

    session_logs = sorted(tmp_path.glob("*/session.json"))
    assert len(session_logs) == 1
    session = json.loads(session_logs[0].read_text())
    assert session["source_mode"] == "source_less"
    assert "/help" not in json.dumps(session["events"]).lower()

    required_kc_id_types = {
        "cold_attempt",
        "repair_dialogue_turn",
        "repair",
        "post_bridge_transfer_check",
        "spaced_redrill",
        "strong_cold_path",
    }
    graph_neutral_types = {
        "cold_help_turn",
        "cold_support_exhausted",
        "gap_identified",
        "repair_dialogue_turn",
        "repair_abandoned",
        "repair",
        "model_bridge",
        "post_bridge_transfer_check",
        "repair_state_bucketed",
        "repair_cap_selected",
        "repair_recovery_started",
        "repair_recovery_turn",
        "repair_recovery_closed",
        "strong_cold_path",
    }
    for event in session["events"]:
        event_type = event.get("type")
        if event_type in required_kc_id_types:
            assert str(event.get("kc_id") or "").strip(), f"{event_type} missing kc_id"
        if event_type in graph_neutral_types:
            assert event.get("graph_neutral") is True, (
                f"{event_type} must include graph_neutral=true"
            )


def test_repair_dialogue_llm_calls_are_logged(tmp_path: Path) -> None:
    result = run_command(
        [
            str(WORKSPACE_ROOT / "socratink-tui"),
            "--scripted",
            "fixtures/circular_repair_script.json",
            "--color=never",
        ],
        env={"SOCRATINK_TUI_LOG_ROOT": str(tmp_path)},
    )

    assert result.returncode == 0, result.stderr

    session_logs = sorted(tmp_path.glob("*/session.json"))
    assert len(session_logs) == 1
    session = json.loads(session_logs[0].read_text())
    stages = [call.get("stage") for call in session.get("llm_calls") or []]

    assert stages.count("repair_prompt") == 1
    assert stages.count("repair_dialogue") == 2
    dialogue_turns = [
        event
        for event in session.get("events") or []
        if event.get("type") == "repair_dialogue_turn"
        and event.get("judge_reason")
    ]
    assert len(dialogue_turns) == 2
    not_ready_turns = [t for t in dialogue_turns if not t.get("bridge_ready")]
    assert len(not_ready_turns) == 1
    assert not_ready_turns[0].get("next_prompt", "").startswith("Stay on this link:")
    assert (
        "The learner named pieces but didn't connect the key process to the outcome."
        in result.stdout
    )
    assert "Stay on this link:" in result.stdout
    ready_idx = result.stdout.index("Bridge readiness: ready")
    assert "[Repair Dialogue]" not in result.stdout[ready_idx + 1 :]


def test_repair_hint_command_is_graph_neutral(tmp_path: Path) -> None:
    result = run_command(
        [
            str(WORKSPACE_ROOT / "socratink-tui"),
            "--scripted",
            "fixtures/repair_hint_script.json",
            "--color=never",
        ],
        env={"SOCRATINK_TUI_LOG_ROOT": str(tmp_path)},
    )

    assert result.returncode == 0, result.stderr
    assert "[Hint]" in result.stdout
    assert "[Model Bridge]" in result.stdout

    session = json.loads(sorted(tmp_path.glob("*/session.json"))[0].read_text())
    hint_events = [
        event
        for event in session.get("events") or []
        if event.get("type") == "repair_hint_requested"
    ]
    assert len(hint_events) == 1
    hint = hint_events[0]
    assert hint["graph_neutral"] is True
    assert hint["score_eligible"] is False
    assert hint["hint_level"] >= 1

    repair_events = [
        event for event in session.get("events") or [] if event.get("type") == "repair"
    ]
    assert len(repair_events) == 1
    hint_idx = next(
        i
        for i, event in enumerate(session["events"])
        if event.get("type") == "repair_hint_requested"
    )
    repair_idx = next(
        i for i, event in enumerate(session["events"]) if event.get("type") == "repair"
    )
    assert hint_idx < repair_idx


def test_cold_help_turn_is_not_scored(tmp_path: Path) -> None:
    result = run_command(
        [
            str(WORKSPACE_ROOT / "socratink-tui"),
            "--scripted",
            "fixtures/cold_help_then_substantive.json",
            "--color=never",
        ],
        env={"SOCRATINK_TUI_LOG_ROOT": str(tmp_path)},
    )

    assert result.returncode == 0, result.stderr
    assert "[Cold] Not scored yet" in result.stdout
    assert "needs repair" not in result.stdout.split("[Cold] Not scored yet")[0]

    session = json.loads(sorted(tmp_path.glob("*/session.json"))[0].read_text())
    event_types = [event["type"] for event in session["events"]]
    assert "cold_help_turn" in event_types
    assert event_types.index("cold_help_turn") < event_types.index("cold_attempt")
    cold_help = next(
        event for event in session["events"] if event["type"] == "cold_help_turn"
    )
    assert cold_help["graph_neutral"] is True
    assert cold_help["score_eligible"] is False
    attempts = session["training"]["node_records"][
        session["route"]["first_node"]["id"]
    ]["attempts"]
    assert len(attempts) == 1


def test_cold_help_cap_emits_support_exhausted(tmp_path: Path) -> None:
    result = run_command(
        [
            str(WORKSPACE_ROOT / "socratink-tui"),
            "--scripted",
            "fixtures/cold_help_cap_zero_schema.json",
            "--color=never",
        ],
        env={"SOCRATINK_TUI_LOG_ROOT": str(tmp_path)},
    )

    assert result.returncode == 0, result.stderr
    assert "No scored attempt yet" in result.stdout

    session = json.loads(sorted(tmp_path.glob("*/session.json"))[0].read_text())
    event_types = [event["type"] for event in session["events"]]
    assert event_types.count("cold_help_turn") == 2
    assert "cold_support_exhausted" in event_types
    assert "cold_attempt" not in event_types
    attempts = session["training"]["node_records"][
        session["route"]["first_node"]["id"]
    ]["attempts"]
    assert len(attempts) == 1
    assert attempts[0]["grader_version"] == "tui-zero-schema"


def test_cold_mixed_uncertainty_counts_as_substantive_attempt(tmp_path: Path) -> None:
    result = run_command(
        [
            str(WORKSPACE_ROOT / "socratink-tui"),
            "--scripted",
            "fixtures/cold_mixed_uncertainty_substantive.json",
            "--color=never",
        ],
        env={"SOCRATINK_TUI_LOG_ROOT": str(tmp_path)},
    )

    assert result.returncode == 0, result.stderr
    assert "cold_help_turn" not in [
        event["type"]
        for event in json.loads(
            sorted(tmp_path.glob("*/session.json"))[0].read_text()
        )["events"]
    ]
    assert "[Evidence] primed" in result.stdout


def test_repair_abandon_stays_idle_when_recovery_flag_off(tmp_path: Path) -> None:
    result = run_command(
        [
            str(WORKSPACE_ROOT / "socratink-tui"),
            "--scripted",
            "fixtures/blocked_repair_script.json",
            "--color=never",
        ],
        env={"SOCRATINK_TUI_LOG_ROOT": str(tmp_path)},
    )

    assert result.returncode == 0, result.stderr
    assert "[Recovery]" not in result.stdout
    assert "Next best step: when you're ready" in result.stdout

    session = json.loads(sorted(tmp_path.glob("*/session.json"))[0].read_text())
    event_types = [event["type"] for event in session["events"]]
    assert "repair_abandoned" in event_types
    assert "repair_recovery_turn" not in event_types
    closure = [
        event
        for event in session["events"]
        if event.get("type") == "repair_recovery_closed" and event.get("outcome") == "idle_return"
    ]
    assert closure
    assert "learner_next_action" in closure[-1]
    assert "when you're ready" in closure[-1]["learner_next_action"]


def test_repair_recovery_branch_runs_single_turn_when_flag_on(tmp_path: Path) -> None:
    result = run_command(
        [
            str(WORKSPACE_ROOT / "socratink-tui"),
            "--scripted",
            "fixtures/recovery_success_script.json",
            "--color=never",
        ],
        env={
            "SOCRATINK_TUI_LOG_ROOT": str(tmp_path),
            "SOCRATINK_TUI_ENABLE_RECOVERY_BRANCH": "1",
        },
    )

    assert result.returncode == 0, result.stderr
    assert "[Recovery]" in result.stdout
    assert "Recovery worked. Continuing with your repaired link." in result.stdout
    assert "[Model Bridge]" in result.stdout

    session = json.loads(sorted(tmp_path.glob("*/session.json"))[0].read_text())
    event_types = [event["type"] for event in session["events"]]
    assert "repair_recovery_started" in event_types
    assert "repair_recovery_turn" in event_types
    assert "repair_recovery_closed" in event_types
    closed = [
        event for event in session["events"] if event["type"] == "repair_recovery_closed"
    ][-1]
    assert closed["outcome"] == "recovered"


def test_harness_and_dashboard_run_from_standalone_workspace() -> None:
    harness = run_command([str(WORKSPACE_ROOT / "socratink-harness"), "replay"])
    assert harness.returncode == 0, harness.stderr
    assert "Socratink Harness" in harness.stdout
    assert "8 cases" in harness.stdout
    assert "PASS inner-repair-dialogue-gates-model-bridge-2026-05-26" in harness.stdout
    assert "PASS cold-help-turn-routing-2026-05-28" in harness.stdout
    assert "PASS recovery-close-idle-return-2026-05-28" in harness.stdout
    assert "PASS recovery-success-routes-to-repair-2026-05-28" in harness.stdout
    assert "PASS correlation-edge-substantive-cold-2026-05-28" in harness.stdout

    dashboard = run_command([str(WORKSPACE_ROOT / "socratink-dashboard"), "--json"])
    assert dashboard.returncode == 0, dashboard.stderr
    payload = json.loads(dashboard.stdout)
    assert payload["title"] == "Socratink Learning Loop Dashboard"
    assert payload["case_summary"]["total"] == 8
    assert len(payload["runs"]) == 8
    assert payload["learning_loop"]["outcomes"]["stopped_before_bridge"] >= 1
    assert payload["improvement_queue"]
    telemetry = payload["recovery_telemetry"]
    assert set(telemetry) == {
        "repair_abandoned_rate",
        "recovery_enter_rate",
        "recovery_success_rate",
        "bridge_ready_within_same_concept_rate",
        "status_reversal_rate",
        "false_ready_rate",
    }


def test_fake_mode_route_varies_across_concepts_in_session_logs(tmp_path: Path) -> None:
    vaccine_fixture = tmp_path / "script_vaccine.json"
    vaccine_fixture.write_text(
        json.dumps(
            {
                "concept": "Vaccines",
                "learner_goal": "Explain why a later response is faster.",
                "launch_attempt": "Safe preview helps later response.",
                "cold_attempt": "Memory cells remain and react faster later.",
                "repair_dialogue_turns": [],
                "run_gap_drill": False,
                "gap_attempt": "",
                "spaced_attempt": "Memory cells remain and react faster later.",
            }
        )
    )
    cache_fixture = tmp_path / "script_cache.json"
    cache_fixture.write_text(
        json.dumps(
            {
                "concept": "Caching in APIs",
                "learner_goal": "Explain why repeated requests get faster.",
                "launch_attempt": "Store computed work then reuse it.",
                "cold_attempt": "A cached result is reused on the next identical request.",
                "repair_dialogue_turns": [],
                "run_gap_drill": False,
                "gap_attempt": "",
                "spaced_attempt": "Cache hits avoid recomputation and return faster.",
            }
        )
    )

    vaccine_logs = tmp_path / "logs_vaccine"
    cache_logs = tmp_path / "logs_cache"
    vaccine_result = run_command(
        [
            str(WORKSPACE_ROOT / "socratink-tui"),
            "--scripted",
            str(vaccine_fixture),
            "--color=never",
        ],
        env={"SOCRATINK_TUI_LOG_ROOT": str(vaccine_logs)},
    )
    cache_result = run_command(
        [
            str(WORKSPACE_ROOT / "socratink-tui"),
            "--scripted",
            str(cache_fixture),
            "--color=never",
        ],
        env={"SOCRATINK_TUI_LOG_ROOT": str(cache_logs)},
    )

    assert vaccine_result.returncode == 0, vaccine_result.stderr
    assert cache_result.returncode == 0, cache_result.stderr

    vaccine_session = json.loads(sorted(vaccine_logs.glob("*/session.json"))[0].read_text())
    cache_session = json.loads(sorted(cache_logs.glob("*/session.json"))[0].read_text())
    vaccine_node = vaccine_session["route"]["first_node"]
    cache_node = cache_session["route"]["first_node"]

    assert vaccine_node["label"] != cache_node["label"]
    assert vaccine_node["mechanism"] != cache_node["mechanism"]

    cache_gap = next(
        event for event in cache_session["events"] if event.get("type") == "gap_identified"
    )
    cache_prompt = (cache_gap.get("prompt") or "").lower()
    cache_cue = (cache_gap.get("cue") or "").lower()
    assert "immune" not in cache_prompt
    assert "antigen" not in cache_prompt
    assert "immune" not in cache_cue
    assert "antigen" not in cache_cue
    assert "cache" in cache_prompt or "cache" in cache_cue
