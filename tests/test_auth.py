import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import jwt
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.api.dependencies import require_roles
from app.api.routes.auth import service as app_auth_service
from app.core import security
from app.errors.exceptions import Forbidden, InvalidRequest, Unauthorized
from app.main import app
from app.repositories.auth_repository import AuthRepository
from app.schemas.auth import RegisterRequest
from app.services.auth_service import AuthService


class PasswordSecurityTests(unittest.TestCase):
    def test_hashes_and_verifies_password(self):
        password_hash = security.hash_password("correct horse battery")

        self.assertNotEqual(password_hash, "correct horse battery")
        self.assertTrue(security.verify_password("correct horse battery", password_hash))
        self.assertFalse(security.verify_password("incorrect password", password_hash))

    def test_rejects_passwords_over_bcrypt_byte_limit(self):
        with self.assertRaises(InvalidRequest):
            security.hash_password("é" * 37)

    def test_access_token_contains_user_id_and_expiry(self):
        auth_settings = SimpleNamespace(
            jwt_secret_key="test-secret-key-with-at-least-32-bytes",
            jwt_access_token_minutes=15,
        )
        with patch.object(security, "settings", auth_settings):
            token = security.create_access_token(123)

        payload = jwt.decode(
            token,
            auth_settings.jwt_secret_key,
            algorithms=[security.ALGORITHM],
        )
        self.assertEqual(payload["sub"], "123")
        self.assertIn("exp", payload)


class AuthServiceTests(unittest.TestCase):
    def setUp(self):
        self.repository = Mock(spec=AuthRepository)
        self.service = AuthService()
        self.service.repository = self.repository
        self.user = {
            "user_id": 7,
            "full_name": "Casey Worker",
            "email": "casey@example.com",
            "role": "SUPERVISOR",
            "is_active": True,
        }

    def test_registration_preserves_supported_roles_and_returns_safe_user(self):
        with patch(
            "app.services.auth_service.create_access_token",
            return_value="signed-token",
        ):
            for role in ("SUPERVISOR", "ADMIN", "MANAGER"):
                with self.subTest(role=role):
                    self.repository.create_user.return_value = {
                        **self.user,
                        "role": role,
                    }
                    payload = RegisterRequest(
                        full_name="Casey Worker",
                        email="Casey@Example.com",
                        password="secure-password",
                        role=role,
                    )

                    result = self.service.register(payload)

                    args = self.repository.create_user.call_args.kwargs
                    self.assertEqual(args["email"], "casey@example.com")
                    self.assertEqual(args["role"], role)
                    self.assertTrue(
                        security.verify_password(
                            "secure-password", args["password_hash"]
                        )
                    )
                    self.assertEqual(result["user"]["role"], role)
                    self.assertNotIn("password_hash", result["user"])
                    self.assertEqual(result["access_token"], "signed-token")

        self.assertEqual(self.repository.create_user.call_count, 3)

    def test_inactive_account_cannot_log_in(self):
        self.user["is_active"] = False
        self.user["password_hash"] = security.hash_password("secure-password")
        self.repository.get_by_email.return_value = self.user

        with self.assertRaises(Unauthorized):
            self.service.login("casey@example.com", "secure-password")


class RegisterApiTests(unittest.TestCase):
    def test_register_endpoint_accepts_all_supported_roles(self):
        client = TestClient(app)

        def create_user(**kwargs):
            return {
                "user_id": 7,
                "full_name": kwargs["full_name"],
                "email": kwargs["email"],
                "role": kwargs["role"],
                "is_active": True,
            }

        with (
            patch.object(
                app_auth_service.repository,
                "create_user",
                side_effect=create_user,
            ) as create_user_mock,
            patch(
                "app.services.auth_service.create_access_token",
                return_value="signed-token",
            ),
        ):
            for role in ("SUPERVISOR", "ADMIN", "MANAGER"):
                with self.subTest(role=role):
                    response = client.post(
                        "/api/v1/auth/register",
                        json={
                            "full_name": "Casey Worker",
                            "email": "casey@example.com",
                            "password": "secure-password",
                            "role": role,
                        },
                    )

                    self.assertEqual(response.status_code, 201)
                    self.assertTrue(response.json()["success"])
                    self.assertEqual(response.json()["data"]["user"]["role"], role)

        self.assertEqual(create_user_mock.call_count, 3)
        self.assertEqual(
            [call.kwargs["role"] for call in create_user_mock.call_args_list],
            ["SUPERVISOR", "ADMIN", "MANAGER"],
        )


class RoleAuthorizationTests(unittest.TestCase):
    def test_manager_can_access_manager_endpoint(self):
        manager = {"role": "MANAGER"}
        dependency = require_roles("ADMIN", "MANAGER")

        self.assertIs(dependency(manager), manager)

    def test_supervisor_is_denied_manager_endpoint(self):
        dependency = require_roles("ADMIN", "MANAGER")

        with self.assertRaises(Forbidden):
            dependency({"role": "SUPERVISOR"})


class CurrentUserTests(unittest.TestCase):
    def test_valid_token_resolves_current_active_user(self):
        secret = "test-secret-key-with-at-least-32-bytes"
        token = jwt.encode({"sub": "7"}, secret, algorithm="HS256")
        user = {
            "user_id": 7,
            "full_name": "Casey Worker",
            "email": "casey@example.com",
            "role": "SUPERVISOR",
            "is_active": True,
        }
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )

        with (
            patch("app.api.dependencies.settings", SimpleNamespace(jwt_secret_key=secret)),
            patch("app.api.dependencies.AuthRepository") as repository_class,
        ):
            repository_class.return_value.get_by_id.return_value = user
            result = get_current_user(credentials)

        self.assertIs(result, user)
        repository_class.return_value.get_by_id.assert_called_once_with(7)

    def test_missing_credentials_are_rejected(self):
        with self.assertRaises(Unauthorized):
            get_current_user(None)


if __name__ == "__main__":
    unittest.main()
