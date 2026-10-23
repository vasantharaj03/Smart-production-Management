from app.core.security import create_access_token, verify_password
from app.errors.exceptions import Unauthorized
from app.repositories.auth_repository import AuthRepository


class AuthService:
    def __init__(self):
        self.repository = AuthRepository()

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
            "shift_id": user.get("shift_id"),
            "shift_name": user.get("shift_name"),
        }
        return {
            "access_token": create_access_token(user["user_id"]),
            "token_type": "bearer",
            "user": safe_user,
        }
