from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_platform_conformance():
    repo_root = Path(__file__).resolve().parent.parent.parent
    path = repo_root / "scripts" / "platform_conformance.py"
    spec = importlib.util.spec_from_file_location("platform_conformance_under_test", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["platform_conformance_under_test"] = module
    spec.loader.exec_module(module)
    return module


def test_dim_privacy_accepts_new_stub_routes(monkeypatch):
    conformance = _load_platform_conformance()

    def fake_get_file(_repo: str, path: str, _ref: str = "main"):
        if path in {"docs/PII_INVENTORY.md", "docs/RETENTION.md"}:
            return "present"
        return None

    def fake_search_code(_repo: str, query: str) -> int:
        if query in {"/privacy/export", "/privacy/delete"}:
            return 1
        return 0

    monkeypatch.setattr(conformance, "gh_get_file", fake_get_file)
    monkeypatch.setattr(conformance, "gh_search_code", fake_search_code)

    dim = conformance.dim_privacy("Latimer-Woods-Tech/example")
    assert dim.score == 100
    assert all(check.passed for check in dim.checks)


def test_dim_privacy_requires_delete_endpoint_hint(monkeypatch):
    conformance = _load_platform_conformance()

    def fake_get_file(_repo: str, path: str, _ref: str = "main"):
        if path in {"docs/PII_INVENTORY.md", "docs/RETENTION.md"}:
            return "present"
        return None

    def fake_search_code(_repo: str, query: str) -> int:
        if query == "/api/me/export":
            return 1
        return 0

    monkeypatch.setattr(conformance, "gh_get_file", fake_get_file)
    monkeypatch.setattr(conformance, "gh_search_code", fake_search_code)

    dim = conformance.dim_privacy("Latimer-Woods-Tech/example")
    assert dim.score == 67
    assert dim.checks[2].passed is False
