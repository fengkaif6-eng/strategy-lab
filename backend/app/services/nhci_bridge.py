from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
SCRIPT_PATH = BACKEND_ROOT / 'scripts' / 'fetch_nhci.mjs'


class NhciBridgeError(RuntimeError):
    pass


def fetch_nhci_bundle(timeout_seconds: int = 25) -> dict[str, Any]:
    try:
        result = subprocess.run(
            ['node', str(SCRIPT_PATH)],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=timeout_seconds,
            check=True,
        )
    except subprocess.TimeoutExpired as exc:
        raise NhciBridgeError('NHCI bridge timed out') from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or '').strip()
        raise NhciBridgeError(stderr or 'NHCI bridge failed') from exc

    stdout = (result.stdout or '').strip()
    if not stdout:
        raise NhciBridgeError('NHCI bridge returned empty stdout')

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise NhciBridgeError('NHCI bridge returned invalid JSON') from exc

    if not isinstance(payload, dict):
        raise NhciBridgeError('NHCI bridge returned non-object payload')

    return payload
