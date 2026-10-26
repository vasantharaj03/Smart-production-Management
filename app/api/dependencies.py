import time
from collections.abc import Callable

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.security import ALGORITHM
from app.errors.exceptions import Forbidden, Unauthorized
from app.repositories.auth_repository import AuthRepository

bearer_scheme = HTTPBearer(auto_error=False)

# Every API call used to hit the database just to re-load the user. Cache the
# row briefly. Trade-off: a user deactivated by an admin can keep using an
# existing token for up to USER_CACHE_SECONDS.
USER_CACHE_SECONDS = 30
_user_cache = {}


def _load_user(user_id: int):
    now = time.monotonic()
    hit = _user_cache.get(user_id)
    if hit and now - hit[0] < USER_CACHE_SECONDS:
        return hit[1]
    user = AuthRepository().get_by_id(user_id)
    if user is not None:
        _user_cache[user_id] = (now, user)
    else:
        _user_cache.pop(user_id, None)
    return user


def invalidate_user_cache(user_id: int | None = None):
    if user_id is None:
        _user_cache.clear()
    else:
        _user_cache.pop(user_id, None)


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

    user = _load_user(user_id)
    if user is None or not user["is_active"]:
        raise Unauthorized("User account is unavailable.")
    return user


def require_roles(*roles: str) -> Callable:
    def role_dependency(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise Forbidden("You do not have permission to perform this action.")
        return user

    return role_dependency
