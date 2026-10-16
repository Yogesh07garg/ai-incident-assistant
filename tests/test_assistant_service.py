"""API behavior using fake Docker, Gemini, GitHub, and database responses."""
import json
from unittest.mock import Mock

import docker
import pytest


def test_health_returns_healthy(assistant_client):
    response = assistant_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_containers_only_include_target_app(assistant, assistant_client, container):
    unrelated = Mock()
    unrelated.attrs = {"Config": {"Image": "postgres:16"}}
    assistant.client.containers.list.return_value = [container, unrelated]
    response = assistant_client.get("/containers")
    assert response.status_code == 200
    assert response.json() == [{
        "id": "abc123", "name": "target-app-test", "status": "exited",
        "image": "target-app:latest",
    }]


def test_logs_include_container_evidence(assistant, assistant_client, container):
    assistant.client.containers.get.return_value = container
    response = assistant_client.get("/logs/abc123")
    assert response.status_code == 200
    assert response.json()["logs"] == "Memory limit exceeded"
    assert response.json()["exit_code"] == 137
    assert response.json()["oom_killed"] is True
    assistant.client.containers.get.assert_called_once_with("abc123")
    container.logs.assert_called_once_with(tail=200)


@pytest.mark.parametrize("endpoint", ["/logs/missing", "/diagnose/missing"])
def test_missing_container_returns_404(assistant, assistant_client, endpoint):
    assistant.client.containers.get.side_effect = docker.errors.NotFound("Missing")
    response = assistant_client.get(endpoint)
    assert response.status_code == 404
    assert response.json()["detail"] == "Container not found"


def test_ci_without_configuration_returns_503(assistant_client):
    response = assistant_client.get("/ci-status")
    assert response.status_code == 503
    assert response.json()["detail"] == "CI integration not configured"


def test_ci_with_no_runs_returns_404(assistant, assistant_client, monkeypatch):
    monkeypatch.setattr(assistant, "GITHUB_TOKEN", "test-token")
    monkeypatch.setattr(assistant, "GITHUB_REPO", "example/repo")
    get = Mock(return_value=Mock(status_code=200, json=lambda: {"workflow_runs": []}))
    monkeypatch.setattr(assistant.requests, "get", get)
    response = assistant_client.get("/ci-status")
    assert response.status_code == 404
    assert response.json()["detail"] == "No CI runs found"


def test_diagnosis_returns_result_and_saves_incident(assistant, assistant_client, container):
    assistant.client.containers.get.return_value = container
    diagnosis = {
        "failure_type": "oom_kill", "root_cause": "Memory limit exceeded",
        "suggested_fix": "Increase the container memory limit", "confidence": "high",
    }
    assistant.ai_client.models.generate_content.return_value.text = json.dumps(diagnosis)
    response = assistant_client.get("/diagnose/abc123")
    assert response.status_code == 200
    assert response.json()["diagnosis"] == diagnosis
    db = assistant.SessionLocal.return_value
    saved = db.add.call_args.args[0]
    assert saved.container_id == "abc123"
    assert saved.failure_type == "oom_kill"
    assert saved.raw_logs == "Memory limit exceeded"
    db.commit.assert_called_once()
    db.close.assert_called_once()
    prompt = assistant.ai_client.models.generate_content.call_args.kwargs["contents"]
    assert "Memory limit exceeded" in prompt
    assert "137" in prompt


def test_invalid_ai_json_returns_500_without_saving(assistant, assistant_client, container):
    assistant.client.containers.get.return_value = container
    assistant.ai_client.models.generate_content.return_value.text = "not valid JSON"
    response = assistant_client.get("/diagnose/abc123")
    assert response.status_code == 500
    assert "invalid JSON" in response.json()["detail"]
    assistant.SessionLocal.assert_not_called()


def test_empty_incident_history(assistant, assistant_client):
    db = assistant.SessionLocal.return_value
    db.query.return_value.order_by.return_value.all.return_value = []
    response = assistant_client.get("/incidents")
    assert response.status_code == 200
    assert response.json() == []
    db.close.assert_called_once()
