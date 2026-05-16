from __future__ import annotations


def test_has_typed_env_bindings_accepts_interface_env_with_hono_bindings(platform_conformance):
    def fake_search(_repo: str, query: str) -> int:
        if query == 'path:src/ "interface Env"':
            return 1
        if query == 'path:src/ "new Hono<{ Bindings: Env"':
            return 1
        return 0

    platform_conformance.gh_search_code = fake_search
    assert platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_has_typed_env_bindings_accepts_type_env_alias_with_bindings_type(platform_conformance):
    def fake_search(_repo: str, query: str) -> int:
        if query == 'path:src/ "type Env ="':
            return 1
        if query == 'path:src/ "Bindings: Env"':
            return 1
        return 0

    platform_conformance.gh_search_code = fake_search
    assert platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_has_typed_env_bindings_accepts_apps_worker_layout(platform_conformance):
    def fake_search(_repo: str, query: str) -> int:
        if query == 'path:apps/ "interface Env"':
            return 1
        if query == 'path:apps/ "Bindings: Env"':
            return 1
        return 0

    platform_conformance.gh_search_code = fake_search
    assert platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_has_typed_env_bindings_rejects_missing_env_declaration(platform_conformance):
    def fake_search(_repo: str, query: str) -> int:
        if 'Bindings: Env' in query:
            return 1
        return 0

    platform_conformance.gh_search_code = fake_search
    assert not platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_has_typed_env_bindings_rejects_missing_bindings_usage(platform_conformance):
    def fake_search(_repo: str, query: str) -> int:
        if "interface Env" in query or "type Env =" in query:
            return 1
        return 0

    platform_conformance.gh_search_code = fake_search
    assert not platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")
