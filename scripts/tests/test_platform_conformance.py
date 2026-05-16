from __future__ import annotations


def _fake_search_with_hits(*hits: str):
    def fake_search(_repo: str, query: str) -> int:
        return 1 if query in hits else 0

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
    def fake_search(_repo: str, query: str) -> int:
        if 'Bindings: Env' in query:
            return 1
        return 0

    platform_conformance.gh_search_code = fake_search
    assert not platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_typed_env_rejects_missing_bindings_usage(platform_conformance):
    def fake_search(_repo: str, query: str) -> int:
        if "interface Env" in query or "type Env =" in query:
            return 1
        return 0

    platform_conformance.gh_search_code = fake_search
    assert not platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")
