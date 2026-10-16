"""Shared setup. External clients are replaced before importing the assistant."""
import importlib.util
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]


def load_app(name, folder):
    # The folders contain hyphens and both entry points are named main.py.
    spec = importlib.util.spec_from_file_location(name, ROOT / folder / "main.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def target(monkeypatch):
    # Prevent a local .env file from changing the tests.
    monkeypatch.setattr("dotenv.load_dotenv", lambda: None)
    monkeypatch.delenv("REQUIRED_API_KEY", raising=False)
    return load_app("target_main", "target-app")


@pytest.fixture
def target_client(target):
    with TestClient(target.app) as client:
        yield client


@pytest.fixture
def assistant(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / "assistant-service"))
    monkeypatch.setattr("dotenv.load_dotenv", lambda: None)
    # Use an inert SQLite engine rather than loading a PostgreSQL driver.
    # Database operations themselves are mocked below.
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    import database

    monkeypatch.setattr(database, "init_db", Mock())
    monkeypatch.setattr(database, "SessionLocal", Mock())
    monkeypatch.setattr("docker.from_env", Mock())
    monkeypatch.setattr("google.genai.Client", Mock())
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("GITHUB_REPO", raising=False)
    return load_app("assistant_main", "assistant-service")


@pytest.fixture
def assistant_client(assistant):
    with TestClient(assistant.app) as client:
        yield client


@pytest.fixture
def container():
    fake = Mock()
    fake.short_id = "abc123"
    fake.name = "target-app-test"
    fake.status = "exited"
    fake.attrs = {
        "Config": {"Image": "target-app:latest"},
        "State": {"ExitCode": 137, "OOMKilled": True},
    }
    fake.logs.return_value = b"Memory limit exceeded"
    return fake
