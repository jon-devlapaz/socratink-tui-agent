#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
VENV_PYTHON = REPO_ROOT / ".venv" / "bin" / "python"
if VENV_PYTHON.exists() and Path(sys.executable) != VENV_PYTHON:
    os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), *sys.argv])

sys.path.insert(0, str(REPO_ROOT))

from bridge_lib.contract_replay import replay_bridge_diagnostic


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        sys.stderr.write("usage: bridge-contract-replay.py <diagnostic-json>\n")
        return 2
    result = replay_bridge_diagnostic(argv[1])
    sys.stdout.write(json.dumps(result, indent=2, sort_keys=True))
    sys.stdout.write("\n")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
