"""Keep bridge.py CLI surface aligned with lib/bridge/registry.json."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = WORKSPACE_ROOT / "lib" / "bridge" / "registry.json"
BRIDGE_PATH = WORKSPACE_ROOT / "bridge.py"

sys.path.insert(0, str(WORKSPACE_ROOT))


def _load_registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text())


def _bridge_cli_actions() -> set[str]:
    source = BRIDGE_PATH.read_text()
    return set(re.findall(r'sys\.argv\[1\] == "([a-z-]+)"', source))


def test_registry_json_matches_bridge_cli_actions() -> None:
    registry = _load_registry()
    registry_actions = set(registry["actions"])
    bridge_actions = _bridge_cli_actions()
    assert registry_actions == bridge_actions, (
        f"registry keys {sorted(registry_actions)} != bridge CLI {sorted(bridge_actions)}"
    )


def test_registry_template_versions_match_prompt_templates() -> None:
    from prompt_templates import TEMPLATES

    registry = _load_registry()
    for action_id, action in registry["actions"].items():
        key = action.get("template_key")
        if not key:
            continue
        assert key in TEMPLATES, f"{action_id}: missing TEMPLATES[{key!r}]"
        assert action["template_version"] == TEMPLATES[key]["version"], (
            f"{action_id}: registry template_version drift for {key}"
        )


def test_registry_bridge_functions_exist() -> None:
    import bridge

    registry = _load_registry()
    for action_id, action in registry["actions"].items():
        fn_name = action["bridge_function"]
        assert hasattr(bridge, fn_name), (
            f"{action_id}: bridge.{fn_name} missing"
        )
