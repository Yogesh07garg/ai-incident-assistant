"""Simple API tests for the application being monitored."""
import httpx
import pytest


def test_health_returns_healthy(target_client):
    response = target_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_create_item_and_read_it_back(target_client):
    item = {"name": "example", "value": 10}
    response = target_client.post("/items", json=item)
    assert response.status_code == 200
    assert response.json() == item
    assert target_client.get("/items").json() == [item]


def test_items_start_empty(target_client):
    assert target_client.get("/items").json() == []


def test_invalid_item_is_rejected(target_client):
    response = target_client.post("/items", json={"name": "example", "value": "bad"})
    assert response.status_code == 422
    assert target_client.get("/items").json() == []


def test_config_check_with_key(target_client, monkeypatch):
    monkeypatch.setenv("REQUIRED_API_KEY", "test-key")
    response = target_client.get("/config-check")
    assert response.status_code == 200
    assert response.json() == {"status": "configured"}


def test_config_check_without_key(target_client):
    # TestClient re-raises server exceptions by default.
    with pytest.raises(RuntimeError, match="REQUIRED_API_KEY"):
        target_client.get("/config-check")


def test_unreachable_dependency(target, target_client, monkeypatch):
    def unavailable(*args, **kwargs):
        raise httpx.ConnectError("Connection refused")

    monkeypatch.setattr(target.httpx, "get", unavailable)
    with pytest.raises(RuntimeError, match="Failed to reach dependency"):
        target_client.get("/dependency-check")
