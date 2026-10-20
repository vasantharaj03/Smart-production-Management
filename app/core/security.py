from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings
from app.errors.exceptions import InvalidRequest

ALGORITHM = "HS256"
MAX_BCRYPT_PASSWORD_BYTES = 72


def validate_auth_settings():
    if len(settings.jwt_secret_key.encode("utf-8")) < 32:
        raise RuntimeError(
            "JWT_SECRET_KEY must be at least 32 bytes. Generate one with "
            "'python -c \"import secrets; print(secrets.token_urlsafe(48))\"' "
            "and set JWT_SECRET_KEY in the project .env file."
        )
    if settings.jwt_access_token_minutes < 1:
        raise RuntimeError("JWT_ACCESS_TOKEN_MINUTES must be greater than zero.")


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > MAX_BCRYPT_PASSWORD_BYTES:
        raise InvalidRequest("Password must be no more than 72 bytes when UTF-8 encoded.")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > MAX_BCRYPT_PASSWORD_BYTES:
        return False
    return bcrypt.checkpw(password_bytes, password_hash.encode("utf-8"))


def create_access_token(user_id: int) -> str:
    validate_auth_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)
