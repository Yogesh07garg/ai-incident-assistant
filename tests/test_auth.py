"""Straightforward tests of login, signed sessions, and protected API routes."""
import pytest


@pytest.mark.parametrize("route", ["/containers", "/incidents", "/ci-status", "/logs/abc123", "/diagnose/abc123"])
def test_dashboard_routes_require_login(anonymous_client, route):
    assert anonymous_client.get(route).status_code == 401


def test_health_is_public(anonymous_client):
    assert anonymous_client.get("/health").status_code == 200


def test_login_creates_session_and_restores_user(anonymous_client):
    response = anonymous_client.post("/auth/login", json={"username": "test-user", "password": "test-password-123"})
    assert response.status_code == 200
    assert response.json() == {"username": "test-user"}
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "max-age=3600" in cookie
    assert anonymous_client.get("/auth/me").json() == {"username": "test-user"}


@pytest.mark.parametrize("username,password", [("test-user", "wrong"), ("wrong", "test-password-123")])
def test_wrong_credentials_are_rejected(anonymous_client, username, password):
    response = anonymous_client.post("/auth/login", json={"username": username, "password": password})
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect username or password"
    assert anonymous_client.get("/auth/me").status_code == 401


def test_logout_removes_session(assistant_client):
    assert assistant_client.post("/auth/logout").status_code == 200
    assert assistant_client.get("/auth/me").status_code == 401
    assert assistant_client.get("/containers").status_code == 401


def test_tampered_cookie_is_rejected(anonymous_client):
    anonymous_client.cookies.set("incident_session", "edited-cookie")
    assert anonymous_client.get("/auth/me").status_code == 401


def test_unconfigured_login_returns_503(anonymous_client, monkeypatch):
    monkeypatch.delenv("LOGIN_PASSWORD_HASH", raising=False)
    response = anonymous_client.post("/auth/login", json={"username": "test-user", "password": "test-password-123"})
    assert response.status_code == 503


def test_empty_credentials_are_rejected(anonymous_client):
    response = anonymous_client.post("/auth/login", json={"username": "", "password": ""})
    assert response.status_code == 422


def test_login_blocks_untrusted_origin(anonymous_client):
    response = anonymous_client.post("/auth/login", headers={"Origin": "https://untrusted.example"}, json={"username": "test-user", "password": "test-password-123"})
    assert response.status_code == 403


def test_password_hash_verification():
    from auth import hash_password, verify_password
    stored = hash_password("example-password")
    assert stored != "example-password"
    assert verify_password("example-password", stored)
    assert not verify_password("different-password", stored)
    assert not verify_password("example-password", "malformed")
