from collections.abc import Callable

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.security import ALGORITHM
from app.errors.exceptions import Forbidden, Unauthorized
from app.repositories.auth_repository import AuthRepository

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    if credentials is None:
        raise Unauthorized()

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key,
            algorithms=[ALGORITHM],
        )
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise Unauthorized("Invalid or expired access token.") from exc

    user = AuthRepository().get_by_id(user_id)
    if user is None or not user["is_active"]:
        raise Unauthorized("User account is unavailable.")
    return user


def require_roles(*roles: str) -> Callable:
    def role_dependency(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise Forbidden("You do not have permission to perform this action.")
        return user

    return role_dependency
