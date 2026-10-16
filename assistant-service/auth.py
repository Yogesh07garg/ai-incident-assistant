"""Single-account login: password verification plus a signed cookie session."""
import hashlib
import hmac
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/auth", tags=["Authentication"])


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 600_000)
    return f"{salt}${digest.hex()}"


def verify_password(password, stored):
    try:
        salt, expected = stored.split("$", 1)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 600_000)
        return hmac.compare_digest(actual.hex(), expected)
    except (ValueError, TypeError):
        return False


def require_user(request: Request):
    user = request.session.get("user")
    if not user or user != os.getenv("LOGIN_USERNAME"):
        raise HTTPException(status_code=401, detail="Please sign in to continue")
    return user


def check_origin(request: Request):
    # Browser writes must come from the configured frontend origins.
    origin = request.headers.get("origin")
    allowed = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin and origin not in [value.strip() for value in allowed]:
        raise HTTPException(status_code=403, detail="Origin not allowed")


class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


@router.post("/login", dependencies=[Depends(check_origin)])
def login(data: LoginInput, request: Request):
    username = os.getenv("LOGIN_USERNAME")
    password_hash = os.getenv("LOGIN_PASSWORD_HASH")
    if not username or not password_hash or not os.getenv("SESSION_SECRET"):
        raise HTTPException(status_code=503, detail="Login is not configured. Run the account setup command in README.md.")
    password_ok = verify_password(data.password, password_hash)
    username_ok = hmac.compare_digest(data.username.encode(), username.encode())
    if not username_ok or not password_ok:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    request.session.clear()
    request.session["user"] = username
    return {"username": username}


@router.get("/me")
def me(username: str = Depends(require_user)):
    return {"username": username}


@router.post("/logout", dependencies=[Depends(check_origin)])
def logout(request: Request):
    request.session.clear()
    return {"message": "Signed out"}


if __name__ == "__main__":
    from getpass import getpass
    from pathlib import Path
    from dotenv import dotenv_values, set_key

    env_file = Path(__file__).resolve().parents[1] / ".env"
    existing = dotenv_values(env_file) if env_file.exists() else {}
    default_username = existing.get("LOGIN_USERNAME") or "admin"
    username = input(f"Login username [{default_username}]: ").strip() or default_username
    if len(username) > 100:
        raise SystemExit("Username must be at most 100 characters.")
    password = getpass("Choose a login password (12 to 256 characters): ")
    if not 12 <= len(password) <= 256:
        raise SystemExit("Use 12 to 256 characters.")
    if password != getpass("Confirm password: "):
        raise SystemExit("Passwords do not match.")

    # Update only login settings; preserve existing Gemini/GitHub configuration.
    set_key(str(env_file), "LOGIN_USERNAME", username, quote_mode="always")
    set_key(str(env_file), "LOGIN_PASSWORD_HASH", hash_password(password), quote_mode="always")
    set_key(str(env_file), "SESSION_SECRET", secrets.token_hex(32), quote_mode="always")
    print(f"Login settings saved to {env_file}")
    print(f"Sign in as: {username}")
    print("Now run: docker compose up -d --force-recreate assistant-service")
