from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]


def _write_diagnostic(path: Path, *, raw_text: str | None) -> None:
    diagnostic = {
        "id": "fixture-substrate-gate",
        "action": "substrate-gate",
        "bridge": {
            "parsed": {
                "diagnostic": {
                    "kind": "llm_validation",
                    "raw_text": raw_text,
                }
            }
        },
    }
    path.write_text(json.dumps(diagnostic), encoding="utf-8")


def test_replay_validates_saved_substrate_gate_diagnostic(
    tmp_path: Path,
) -> None:
    from bridge_lib.contract_replay import replay_bridge_diagnostic

    diagnostic_path = tmp_path / "substrate-gate.json"
    _write_diagnostic(
        diagnostic_path,
        raw_text=json.dumps(
            {
                "contract_version": "substrate-gate-v1",
                "graph_neutral": True,
                "score_eligible": False,
                "substrate_adequate": True,
                "judge_reason": "The learner supplied enough substrate to route.",
            }
        ),
    )

    result = replay_bridge_diagnostic(diagnostic_path)

    assert result["ok"] is True
    assert result["schema"] == "SubstrateGateDecision"
    assert result["action"] == "substrate-gate"
    assert result["diagnostic_id"] == "fixture-substrate-gate"
    assert result["parsed"]["classification"] == "fast"


def test_replay_reports_missing_raw_text(tmp_path: Path) -> None:
    from bridge_lib.contract_replay import replay_bridge_diagnostic

    diagnostic_path = tmp_path / "substrate-gate.json"
    _write_diagnostic(diagnostic_path, raw_text=None)

    result = replay_bridge_diagnostic(diagnostic_path)

    assert result["ok"] is False
    assert result["error"] == "raw-text-missing"
    assert result["action"] == "substrate-gate"


def test_replay_cli_prints_compact_json(tmp_path: Path) -> None:
    diagnostic_path = tmp_path / "substrate-gate.json"
    _write_diagnostic(
        diagnostic_path,
        raw_text=json.dumps(
            {
                "contract_version": "substrate-gate-v1",
                "classification": "fast",
                "graph_neutral": True,
                "score_eligible": False,
                "substrate_adequate": True,
                "judge_reason": "The learner supplied enough substrate to route.",
            }
        ),
    )

    result = subprocess.run(
        [
            sys.executable,
            str(WORKSPACE_ROOT / "scripts" / "bridge-contract-replay.py"),
            str(diagnostic_path),
        ],
        check=False,
        cwd=WORKSPACE_ROOT,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["parsed"]["classification"] == "fast"
    assert '"raw_text":' not in result.stdout
