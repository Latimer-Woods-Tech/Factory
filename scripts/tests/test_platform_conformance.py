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


def test_dim_code_patterns_uses_admin_studio_paths_for_factory(platform_conformance, monkeypatch):
    def fake_get_file(repo: str, path: str, ref: str = "main"):
        if repo == "Latimer-Woods-Tech/Factory" and path == "apps/admin-studio/package.json":
            return """{
              "dependencies": {
                "@latimer-woods-tech/logger": "file:../../packages/logger",
                "@latimer-woods-tech/errors": "file:../../packages/errors",
                "@latimer-woods-tech/monitoring": "file:../../packages/monitoring"
              }
            }"""
        return None

    def fake_search_code(repo: str, query: str) -> int:
        assert repo == "Latimer-Woods-Tech/Factory"
        if 'path:apps/admin-studio/src/ "console.log"' in query:
            return 0
        if 'path:apps/admin-studio/src/ "interface Env"' in query:
            return 1
        return 0

    monkeypatch.setattr(platform_conformance, "gh_get_file", fake_get_file)
    monkeypatch.setattr(platform_conformance, "gh_search_code", fake_search_code)

    score = platform_conformance.dim_code_patterns("Latimer-Woods-Tech/Factory")
    assert score.score == 100
    assert all(c.passed for c in score.checks)


def test_dim_observability_uses_admin_studio_overrides_for_factory(platform_conformance, monkeypatch):
    monkeypatch.setattr(platform_conformance, "gh_get_deploy_workflow_text", lambda *_args, **_kwargs: "sentry-cli sourcemaps upload")
    monkeypatch.setattr(platform_conformance, "gh_get_first_file", lambda *_args, **_kwargs: "# SLO")

    def fake_search_code(repo: str, query: str) -> int:
        assert repo == "Latimer-Woods-Tech/Factory"
        if 'path:apps/admin-studio/src/ "@sentry/"' in query:
            return 1
        if 'path:apps/admin-studio/src/ "@latimer-woods-tech/monitoring"' in query:
            return 1
        if 'path:apps/admin-studio/src/ "request_id"' in query:
            return 1
        return 0

    monkeypatch.setattr(platform_conformance, "gh_search_code", fake_search_code)

    score = platform_conformance.dim_observability("Latimer-Woods-Tech/Factory")
    assert score.score == 100
    assert all(c.passed for c in score.checks)


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


def test_dim_privacy_accepts_quoted_stub_routes(monkeypatch):
    conformance = _load_platform_conformance()

    def fake_get_file(_repo: str, path: str, _ref: str = "main"):
        if path in {"docs/PII_INVENTORY.md", "docs/RETENTION.md"}:
            return "present"
        return None

    def fake_search_code(_repo: str, query: str) -> int:
        if query in {'"/privacy/export"', '"/privacy/delete"'}:
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


def _fake_search_with_hits(*hits: str):
    def fake_search(_repo: str, query: str) -> int:
        return 1 if query in hits else 0

    return fake_search


def _fake_search_with_substrings(*needles: str):
    def fake_search(_repo: str, query: str) -> int:
        return 1 if any(needle in query for needle in needles) else 0

    return fake_search


def test_typed_env_accepts_interface_with_hono_bindings(platform_conformance):
    platform_conformance.gh_search_code = _fake_search_with_hits(
        'path:src/ "interface Env"',
        'path:src/ "new Hono<{ Bindings: Env"',
    )
    assert platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_typed_env_accepts_type_alias_with_bindings(platform_conformance):
    platform_conformance.gh_search_code = _fake_search_with_hits(
        'path:src/ "type Env ="',
        'path:src/ "Bindings: Env"',
    )
    assert platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_typed_env_accepts_apps_layout(platform_conformance):
    platform_conformance.gh_search_code = _fake_search_with_hits(
        'path:apps/ "interface Env"',
        'path:apps/ "Bindings: Env"',
    )
    assert platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_typed_env_rejects_missing_env_declaration(platform_conformance):
    platform_conformance.gh_search_code = _fake_search_with_substrings("Bindings: Env")
    assert not platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_typed_env_rejects_missing_bindings_usage(platform_conformance):
    platform_conformance.gh_search_code = _fake_search_with_substrings("interface Env", "type Env =")
    assert not platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")
