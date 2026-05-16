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
