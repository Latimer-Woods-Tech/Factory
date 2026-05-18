from __future__ import annotations


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
