"""JWT verification + RBAC. The web app issues the token; this API only verifies it (shared IRIS_AUTH_SECRET)."""

from __future__ import annotations

import os
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, Request, status

ROLE_CAPS: dict[str, set[str]] = {
    "ADMIN": {"view", "ack_alerts", "manage_nodes", "simulate", "maintenance", "service_nodes", "gis", "analytics", "approve_models", "settings"},
    "AUTHORITY": {"view", "ack_alerts", "gis", "analytics"},
    "OPERATOR": {"view", "ack_alerts", "manage_nodes", "simulate"},
    "FIELD_STEWARD": {"view", "maintenance", "service_nodes"},
    "VIEWER": {"view"},
}
COOKIE = "iris_session"


@dataclass
class User:
    name: str
    role: str

    def can(self, cap: str) -> bool:
        return cap in ROLE_CAPS.get(self.role, set())


def _secret() -> str | None:
    s = os.environ.get("IRIS_AUTH_SECRET")
    return s if s and len(s) >= 32 else None


def auth_required() -> bool:
    return os.environ.get("IRIS_AUTH_REQUIRED", "true").lower() != "false"


def decode(token: str | None) -> User | None:
    secret = _secret()
    if not token or not secret:
        return None
    try:
        p = jwt.decode(token, secret, algorithms=["HS256"], options={"require": ["exp"]})
    except jwt.PyJWTError:
        return None
    role = p.get("role")
    return User(name=str(p.get("name") or p.get("sub")), role=role) if role in ROLE_CAPS else None


def user_from_request(request: Request) -> User | None:
    header = request.headers.get("authorization", "")
    token = header[7:] if header.lower().startswith("bearer ") else request.cookies.get(COOKIE)
    return decode(token)


def current_user(request: Request) -> User:
    if not auth_required():  # local development only — never disable in a deployment
        return User(name="dev", role="ADMIN")
    u = user_from_request(request)
    if not u:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    return u


def require(cap: str):
    def dep(user: User = Depends(current_user)) -> User:
        if not user.can(cap):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Role {user.role} lacks capability '{cap}'")
        return user

    return dep
