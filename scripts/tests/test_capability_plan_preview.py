from __future__ import annotations

import json
import subprocess
from pathlib import Path


def test_preview_capability_plan_creates_markdown():
    repo_root = Path(__file__).resolve().parent.parent.parent
    preview_file = repo_root / "capabilities" / "compiled" / "outbound-dialer.preview.md"
    if preview_file.exists():
        preview_file.unlink()

    result = subprocess.run(
        ["node", "scripts/preview-capability-plan.mjs", "--recipe", "outbound-dialer"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, f"Script failed: {result.stderr}"
    assert preview_file.exists(), "Preview markdown file was not created"

    text = preview_file.read_text(encoding="utf-8")
    assert "# Capability Plan Preview — outbound-dialer" in text
    assert "## Packages" in text
    assert "## Environment" in text
    assert "## Bindings" in text
    assert "## Expected Surfaces" in text
    assert "## Smoke Checks" in text
    assert "## Scaffold Contract" in text
