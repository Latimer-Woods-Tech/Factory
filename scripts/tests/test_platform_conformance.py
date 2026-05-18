from __future__ import annotations


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
        # has_typed_env_bindings uses path:apps/ patterns for apps/ layout
        if 'path:apps/ "interface Env"' in query:
            return 1
        if 'path:apps/ "Bindings: Env"' in query:
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
