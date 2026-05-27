from __future__ import annotations

import json
import subprocess
from pathlib import Path


def test_generate_capability_golden_path_creates_artifact(tmp_path: Path):
    repo_root = Path(__file__).resolve().parent.parent.parent
    output_file = repo_root / "capabilities" / "compiled" / "outbound-dialer.golden-path.json"
    if output_file.exists():
        output_file.unlink()

    result = subprocess.run(
        ["node", "scripts/generate-capability-golden-path.mjs", "--recipe", "outbound-dialer"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, f"Script failed: {result.stderr}"
    assert output_file.exists(), "Golden-path artifact was not created"

    payload = json.loads(output_file.read_text(encoding="utf-8"))
    assert payload["kind"] == "golden-path"
    assert payload["recipe"]["id"] == "outbound-dialer"
    assert any("Compiled plan exists" in line for line in payload["proofGate"])
    assert "JWT_SECRET" in payload["summary"]["requiredSecrets"]
    assert "DB" in payload["summary"]["requiredBindings"]
    assert "ENVIRONMENT" in payload["summary"]["requiredVars"]
