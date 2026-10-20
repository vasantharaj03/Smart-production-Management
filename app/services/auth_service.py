from app.core.security import create_access_token, hash_password, verify_password
from app.errors.exceptions import Unauthorized
from app.repositories.auth_repository import AuthRepository


class AuthService:
    def __init__(self):
        self.repository = AuthRepository()

    def register(self, payload):
        user = self.repository.create_user(
            full_name=payload.full_name,
            email=str(payload.email).lower(),
            password_hash=hash_password(payload.password),
        )
        return self._create_auth_response(user)

    def login(self, email: str, password: str):
        user = self.repository.get_by_email(email.lower())
        if (
            user is None
            or not user["is_active"]
            or not verify_password(password, user["password_hash"])
        ):
            raise Unauthorized("Invalid email or password.")
        return self._create_auth_response(user)

    @staticmethod
    def _create_auth_response(user):
        safe_user = {
            "user_id": user["user_id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"],
        }
        return {
            "access_token": create_access_token(user["user_id"]),
            "token_type": "bearer",
            "user": safe_user,
        }
