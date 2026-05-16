"""
Pytest fixtures for scripts/ helper tests.

The helpers in scripts/ are hyphen-named (init-matrix-issues.py,
update-sri-hashes.mjs would be — JS only). Hyphen names are not importable
as modules, so we load them via importlib.util.spec_from_file_location().
This conftest provides the cached imports so test files don't repeat the
boilerplate.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent  # repo/
SCRIPTS_DIR = REPO_ROOT / "scripts"


def _load_module(module_name: str, filename: str):
    """Load a script file as an importable module."""
    path = SCRIPTS_DIR / filename
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="session")
def init_matrix():
    """Load scripts/init-matrix-issues.py as a module."""
    return _load_module("init_matrix_issues", "init-matrix-issues.py")


@pytest.fixture(scope="session")
def aggregate():
    """Load scripts/aggregate_completion.py as a module."""
    return _load_module("aggregate_completion_under_test", "aggregate_completion.py")


@pytest.fixture(scope="session")
def sync_labels():
    """Load scripts/sync_labels_to_matrix.py as a module."""
    return _load_module("sync_labels_to_matrix_under_test", "sync_labels_to_matrix.py")
