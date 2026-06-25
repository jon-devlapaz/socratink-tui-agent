"""Route runtime prompt pin must match ai_service and registry.json."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = WORKSPACE_ROOT / "lib" / "bridge" / "registry.json"
VENDOR_PYTHON_ROOT = WORKSPACE_ROOT / "vendor" / "python"

sys.path.insert(0, str(VENDOR_PYTHON_ROOT))

import ai_service


def _load_registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text())


def test_route_runtime_prompt_sha256_matches_registry() -> None:
    registry = _load_registry()
    route_runtime = registry["actions"]["generate-route"]["route_runtime"]
    prompt_path = WORKSPACE_ROOT / route_runtime["prompt_path"]
    digest = hashlib.sha256(prompt_path.read_bytes()).hexdigest()
    assert digest == route_runtime["prompt_sha256"], (
        "route prompt file changed; run: node scripts/refresh-route-runtime-pin.mjs"
    )


def test_route_runtime_prompt_version_matches_ai_service() -> None:
    registry = _load_registry()
    route_runtime = registry["actions"]["generate-route"]["route_runtime"]
    assert route_runtime["prompt_version"] == ai_service.GENERATE_SMALLEST_ROUTE_PROMPT_VERSION


def test_route_runtime_prompt_path_matches_ai_service() -> None:
    registry = _load_registry()
    route_runtime = registry["actions"]["generate-route"]["route_runtime"]
    assert str(ai_service.GENERATE_SMALLEST_ROUTE_PROMPT_PATH).endswith(
        route_runtime["prompt_path"].replace("vendor/python/", "")
    )


def test_route_runtime_pin_dry_run_does_not_rewrite_registry(tmp_path: Path) -> None:
    registry = _load_registry()
    route_runtime = registry["actions"]["generate-route"]["route_runtime"]
    route_runtime["prompt_sha256"] = "0" * 64

    registry_path = tmp_path / "lib" / "bridge" / "registry.json"
    prompt_path = tmp_path / route_runtime["prompt_path"]
    registry_path.parent.mkdir(parents=True)
    prompt_path.parent.mkdir(parents=True)
    registry_path.write_text(json.dumps(registry, indent=2) + "\n")
    prompt_path.write_text("updated route prompt\n")
    before = registry_path.read_text()

    result = subprocess.run(
        [
            os.environ.get("NODE", "node"),
            str(WORKSPACE_ROOT / "scripts" / "refresh-route-runtime-pin.mjs"),
            "--dry-run",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "Dry run" in result.stdout
    assert registry_path.read_text() == before
