from __future__ import annotations

import json
import subprocess
from pathlib import Path


def test_compile_capability_catalog_creates_governed_menu(tmp_path: Path):
    repo_root = Path(__file__).resolve().parent.parent.parent
    output_file = tmp_path / 'catalog.json'

    result = subprocess.run(
        [
            'node',
            'scripts/compile-capability-catalog.mjs',
            '--output',
            str(output_file),
        ],
        cwd=repo_root,
        capture_output=True,
        text=True,
        errors='replace',
        check=False,
    )

    assert result.returncode == 0, f'Script failed: {result.stderr}\n{result.stdout}'
    assert output_file.exists(), 'Catalog artifact was not created'

    payload = json.loads(output_file.read_text(encoding='utf-8'))
    assert payload['kind'] == 'catalog'
    assert payload['summary']['conceptCount'] >= 1

    concept = next(item for item in payload['concepts'] if item['id'] == 'outbound-dialer-campaign')
    assert concept['menuVisible'] is True
    assert concept['approvalTier'] == 'golden'
    assert any(param['id'] == 'workerDomain' and param['required'] for param in concept['parameters'])

    recipe = next(item for item in concept['recipes'] if item['id'] == 'outbound-dialer')
    assert '/health' in next(entry for entry in payload['recipes'] if entry['id'] == 'outbound-dialer')['expectedSurfaces']
    assert 'telephony' in recipe['primitives']


def test_validate_capability_registry_reports_concepts():
    repo_root = Path(__file__).resolve().parent.parent.parent

    result = subprocess.run(
        ['node', 'scripts/validate-capability-registry.mjs'],
        cwd=repo_root,
        capture_output=True,
        text=True,
        errors='replace',
        check=False,
    )

    assert result.returncode == 0, f'Validator failed: {result.stderr}\n{result.stdout}'
    payload = json.loads(result.stdout)
    assert payload['ok'] is True
    assert payload['concepts'] >= 1
