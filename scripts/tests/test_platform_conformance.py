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
        # has_typed_env_bindings checks for interface/type Env declarations + Bindings usage
        if 'path:src/ "interface Env"' in query or 'path:apps/ "interface Env"' in query:
            return 1
        if 'path:src/ "Bindings: Env"' in query or 'path:apps/ "Bindings: Env"' in query:
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


# ───────────── Schema / ROLLBACK block tests ─────────────


def _make_migration_item(name: str) -> dict:
    """Helper: build a minimal GitHub API directory-listing item for a migration file."""
    return {"name": name, "path": f"migrations/{name}", "type": "file"}


def test_rollback_block_present(platform_conformance, monkeypatch):
    """A migration that contains '-- ROLLBACK:' passes with no errors or warnings."""
    item = _make_migration_item("0001_create_users.sql")

    monkeypatch.setattr(platform_conformance, "gh_list_dir", lambda *_: [item])
    monkeypatch.setattr(
        platform_conformance,
        "gh_get_file",
        lambda repo, path, ref="main": "CREATE TABLE users (id INT);\n-- ROLLBACK: DROP TABLE users;",
    )

    errors, warnings = platform_conformance.check_rollback_blocks(
        [item], set(), "Latimer-Woods-Tech/example"
    )
    assert errors == []
    assert warnings == []


def test_rollback_block_missing_existing_migration(platform_conformance, monkeypatch):
    """An existing migration (not in changed_files) without -- ROLLBACK: → warning, not error."""
    item = _make_migration_item("0001_create_users.sql")

    monkeypatch.setattr(
        platform_conformance,
        "gh_get_file",
        lambda repo, path, ref="main": "CREATE TABLE users (id INT);",
    )

    errors, warnings = platform_conformance.check_rollback_blocks(
        [item], set(), "Latimer-Woods-Tech/example"
    )
    assert errors == []
    assert warnings == ["migrations/0001_create_users.sql"]


def test_rollback_block_missing_new_migration(platform_conformance, monkeypatch):
    """A new migration (in changed_files) without -- ROLLBACK: → error (blocks conformance)."""
    item = _make_migration_item("0002_add_email.sql")

    monkeypatch.setattr(
        platform_conformance,
        "gh_get_file",
        lambda repo, path, ref="main": "ALTER TABLE users ADD COLUMN email TEXT;",
    )

    errors, warnings = platform_conformance.check_rollback_blocks(
        [item],
        {"migrations/0002_add_email.sql"},
        "Latimer-Woods-Tech/example",
    )
    assert errors == ["migrations/0002_add_email.sql"]
    assert warnings == []


def test_rollback_block_none_with_adr(platform_conformance, monkeypatch):
    """-- ROLLBACK: NONE -- ADR-001 counts as a valid ROLLBACK block."""
    item = _make_migration_item("0003_irreversible.sql")

    monkeypatch.setattr(
        platform_conformance,
        "gh_get_file",
        lambda repo, path, ref="main": (
            "DROP TABLE legacy_data;\n-- ROLLBACK: NONE -- ADR-042"
        ),
    )

    errors, warnings = platform_conformance.check_rollback_blocks(
        [item], {"migrations/0003_irreversible.sql"}, "Latimer-Woods-Tech/example"
    )
    assert errors == []
    assert warnings == []


def test_rollback_block_case_insensitive(platform_conformance, monkeypatch):
    """The -- ROLLBACK: marker is matched case-insensitively."""
    item = _make_migration_item("0004_mixed_case.sql")

    # Use lowercase variant
    monkeypatch.setattr(
        platform_conformance,
        "gh_get_file",
        lambda repo, path, ref="main": "CREATE INDEX idx ON users(email);\n-- rollback: DROP INDEX idx;",
    )

    errors, warnings = platform_conformance.check_rollback_blocks(
        [item], {"migrations/0004_mixed_case.sql"}, "Latimer-Woods-Tech/example"
    )
    assert errors == []
    assert warnings == []


def test_dim_schema_new_migration_missing_rollback_fails(platform_conformance, monkeypatch):
    """dim_schema marks the ROLLBACK check as failed when a new migration lacks the block."""
    item = _make_migration_item("0001_init.sql")

    monkeypatch.setattr(platform_conformance, "gh_list_dir", lambda *_: [item])
    monkeypatch.setattr(
        platform_conformance,
        "gh_get_file",
        lambda repo, path, ref="main": "CREATE TABLE foo (id INT);",
    )

    dim = platform_conformance.dim_schema(
        "Latimer-Woods-Tech/example",
        changed_files={"migrations/0001_init.sql"},
    )
    rollback_check = next(c for c in dim.checks if "ROLLBACK" in c.name)
    assert rollback_check.passed is False
    assert "migrations/0001_init.sql" in rollback_check.detail


def test_dim_schema_existing_migration_missing_rollback_warns_not_fails(platform_conformance, monkeypatch):
    """dim_schema passes the ROLLBACK check (with a warning detail) for pre-existing debt."""
    item = _make_migration_item("0001_init.sql")

    monkeypatch.setattr(platform_conformance, "gh_list_dir", lambda *_: [item])
    monkeypatch.setattr(
        platform_conformance,
        "gh_get_file",
        lambda repo, path, ref="main": "CREATE TABLE foo (id INT);",
    )

    dim = platform_conformance.dim_schema(
        "Latimer-Woods-Tech/example",
        changed_files=set(),  # not a new migration
    )
    rollback_check = next(c for c in dim.checks if "ROLLBACK" in c.name)
    assert rollback_check.passed is True
    assert "WARN" in rollback_check.detail
    assert "migrations/0001_init.sql" in rollback_check.detail


def test_dim_schema_all_migrations_have_rollback_passes_clean(platform_conformance, monkeypatch):
    """dim_schema ROLLBACK check passes cleanly when all migrations have the block."""
    item = _make_migration_item("0001_init.sql")

    monkeypatch.setattr(platform_conformance, "gh_list_dir", lambda *_: [item])
    monkeypatch.setattr(
        platform_conformance,
        "gh_get_file",
        lambda repo, path, ref="main": "CREATE TABLE foo (id INT);\n-- ROLLBACK: DROP TABLE foo;",
    )

    dim = platform_conformance.dim_schema(
        "Latimer-Woods-Tech/example",
        changed_files={"migrations/0001_init.sql"},
    )
    rollback_check = next(c for c in dim.checks if "ROLLBACK" in c.name)
    assert rollback_check.passed is True
    assert rollback_check.detail == ""


# ─────────────────────────────────────────────────────────────────────────────


def _fake_search_with_hits(*hits: str):
    def fake_search(_repo: str, query: str) -> int:
        return 1 if query in hits else 0

    return fake_search


def _fake_search_with_substrings(*needles: str):
    def fake_search(_repo: str, query: str) -> int:
        return 1 if any(needle in query for needle in needles) else 0

    return fake_search


def test_typed_env_accepts_interface_with_hono_bindings(platform_conformance, monkeypatch):
    monkeypatch.setattr(
        platform_conformance,
        "gh_search_code",
        _fake_search_with_hits(
        'path:src/ "interface Env"',
        'path:src/ "new Hono<{ Bindings: Env"',
        ),
    )
    assert platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_typed_env_accepts_type_alias_with_bindings(platform_conformance, monkeypatch):
    monkeypatch.setattr(
        platform_conformance,
        "gh_search_code",
        _fake_search_with_hits(
        'path:src/ "type Env ="',
        'path:src/ "Bindings: Env"',
        ),
    )
    assert platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_typed_env_accepts_apps_layout(platform_conformance, monkeypatch):
    monkeypatch.setattr(
        platform_conformance,
        "gh_search_code",
        _fake_search_with_hits(
        'path:apps/ "interface Env"',
        'path:apps/ "Bindings: Env"',
        ),
    )
    assert platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_typed_env_rejects_missing_env_declaration(platform_conformance, monkeypatch):
    monkeypatch.setattr(platform_conformance, "gh_search_code", _fake_search_with_substrings("Bindings: Env"))
    assert not platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")


def test_typed_env_rejects_missing_bindings_usage(platform_conformance, monkeypatch):
    monkeypatch.setattr(
        platform_conformance,
        "gh_search_code",
        _fake_search_with_substrings("interface Env", "type Env ="),
    )
    assert not platform_conformance.has_typed_env_bindings("Latimer-Woods-Tech/example")
