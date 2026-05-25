from __future__ import annotations

import json
import subprocess
from pathlib import Path


def test_resolve_capability_concept_validates_and_selects_recipe(tmp_path: Path):
    repo_root = Path(__file__).resolve().parent.parent.parent
    resolution_file = tmp_path / 'resolution.json'
    plan_file = tmp_path / 'plan.json'

    result = subprocess.run(
        [
            'node',
            'scripts/resolve-capability-concept.mjs',
            '--concept',
            'outbound-dialer-campaign',
            '--params',
            '{"workerDomain":"dialer.example.com","campaignSource":"crm-segment"}',
            '--output',
            str(resolution_file),
            '--plan-output',
            str(plan_file),
        ],
        cwd=repo_root,
        capture_output=True,
        text=True,
        errors='replace',
        check=False,
    )

    assert result.returncode == 0, f'Script failed: {result.stderr}\n{result.stdout}'
    payload = json.loads(resolution_file.read_text(encoding='utf-8'))
    assert payload['kind'] == 'concept-resolution'
    assert payload['concept']['id'] == 'outbound-dialer-campaign'
    assert payload['recipe']['id'] == 'outbound-dialer'
    assert payload['parameters']['workerDomain'] == 'dialer.example.com'
    assert payload['parameters']['campaignSource'] == 'crm-segment'
    assert payload['parameters']['enableVoiceSynthesis'] is True

    plan = json.loads(plan_file.read_text(encoding='utf-8'))
    assert plan['kind'] == 'plan'
    assert plan['recipe']['id'] == 'outbound-dialer'


def test_resolve_capability_concept_rejects_unknown_parameters():
    repo_root = Path(__file__).resolve().parent.parent.parent

    result = subprocess.run(
        [
            'node',
            'scripts/resolve-capability-concept.mjs',
            '--concept',
            'outbound-dialer-campaign',
            '--params',
            '{"workerDomain":"dialer.example.com","campaignSource":"crm-segment","surprise":true}',
        ],
        cwd=repo_root,
        capture_output=True,
        text=True,
        errors='replace',
        check=False,
    )

    assert result.returncode != 0
    assert 'Unknown parameter "surprise"' in result.stderr
