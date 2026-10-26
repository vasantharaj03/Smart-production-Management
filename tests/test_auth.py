import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import jwt
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.api.dependencies import require_roles
from app.api.routes.auth import service as app_auth_service
from app.dashboard import routes as dashboard_routes
from app.dashboard.routes import ADMIN as admin_only
from app.dashboard.routes import ANY as dashboard_read_roles
from app.dashboard.routes import MANAGER_ONLY as target_write_role
from app.core import security
from app.errors.exceptions import Forbidden, InvalidRequest, Unauthorized
from app.main import app
from app.repositories.auth_repository import AuthRepository
from app.schemas.auth import CreateUserRequest
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

    def test_create_user_hashes_password_and_returns_safe_user(self):
        created_user = {**self.user, "role": "MANAGER"}
        self.repository.create_user.return_value = created_user
        payload = CreateUserRequest(
            full_name="Casey Worker",
            email="Casey@Example.com",
            password="manager-password",
            role="MANAGER",
        )

        result = self.service.create_user(payload)

        args = self.repository.create_user.call_args.kwargs
        self.assertEqual(args["email"], "casey@example.com")
        self.assertEqual(args["role"], "MANAGER")
        self.assertTrue(
            security.verify_password("manager-password", args["password_hash"])
        )
        self.assertEqual(result["role"], "MANAGER")
        self.assertNotIn("password_hash", result)
        self.assertNotIn("access_token", result)

        self.repository.get_by_email.return_value = {
            **created_user,
            "password_hash": args["password_hash"],
        }
        with patch(
            "app.services.auth_service.create_access_token",
            return_value="signed-token",
        ):
            auth = self.service.login("casey@example.com", "manager-password")
        self.assertEqual(auth["user"]["role"], "MANAGER")
        self.assertEqual(auth["access_token"], "signed-token")

    def test_inactive_account_cannot_log_in(self):
        self.user["is_active"] = False
        self.user["password_hash"] = security.hash_password("secure-password")
        self.repository.get_by_email.return_value = self.user

        with self.assertRaises(Unauthorized):
            self.service.login("casey@example.com", "secure-password")


class AdminCreateUserApiTests(unittest.TestCase):
    def test_public_registration_endpoint_is_removed(self):
        client = TestClient(app)
        response = client.post(
            "/api/v1/auth/register",
            json={
                "full_name": "Casey Worker",
                "email": "casey@example.com",
                "password": "secure-password",
            },
        )
        self.assertEqual(response.status_code, 404)

    def test_admin_can_create_user_with_assigned_role(self):
        client = TestClient(app)
        admin = {"user_id": 1, "full_name": "Admin User", "role": "ADMIN"}
        created_user = {
            "user_id": 7,
            "full_name": "Casey Worker",
            "email": "casey@example.com",
            "role": "MANAGER",
            "shift_id": None,
            "shift_name": None,
        }
        app.dependency_overrides[dashboard_routes.ADMIN] = lambda: admin
        app.dependency_overrides[dashboard_routes.service.ensure_schema] = lambda: None

        try:
            with (
                patch.object(
                    dashboard_routes.auth_service,
                    "create_user",
                    return_value=created_user,
                ) as create_user_mock,
                patch.object(dashboard_routes.service, "log_audit") as audit_mock,
            ):
                response = client.post(
                    "/api/v1/admin/users",
                    json={
                        "full_name": "Casey Worker",
                        "email": "casey@example.com",
                        "password": "secure-password",
                        "role": "MANAGER",
                    },
                )
        finally:
            app.dependency_overrides.pop(dashboard_routes.ADMIN, None)
            app.dependency_overrides.pop(dashboard_routes.service.ensure_schema, None)

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["success"])
        self.assertEqual(response.json()["data"]["role"], "MANAGER")
        create_user_mock.assert_called_once()
        audit_mock.assert_called_once()

    def test_user_creation_requires_authentication(self):
        client = TestClient(app)
        app.dependency_overrides[dashboard_routes.service.ensure_schema] = lambda: None
        try:
            response = client.post(
                "/api/v1/admin/users",
                json={
                    "full_name": "Casey Worker",
                    "email": "casey@example.com",
                    "password": "secure-password",
                    "role": "SUPERVISOR",
                },
            )
        finally:
            app.dependency_overrides.pop(dashboard_routes.service.ensure_schema, None)

        self.assertEqual(response.status_code, 401)


class LoginApiTests(unittest.TestCase):
    def test_login_endpoint_returns_auth_envelope(self):
        user = {
            "user_id": 7,
            "full_name": "Casey Worker",
            "email": "casey@example.com",
            "password_hash": security.hash_password("secure-password"),
            "role": "SUPERVISOR",
            "is_active": True,
        }
        client = TestClient(app)

        with (
            patch.object(
                app_auth_service.repository,
                "get_by_email",
                return_value=user,
            ) as get_by_email_mock,
            patch(
                "app.services.auth_service.create_access_token",
                return_value="signed-token",
            ),
        ):
            response = client.post(
                "/api/v1/auth/login",
                json={
                    "email": "Casey@Example.com",
                    "password": "secure-password",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["data"]["access_token"],
            "signed-token",
        )
        self.assertEqual(
            response.json()["data"]["user"]["email"],
            "casey@example.com",
        )
        self.assertNotIn("password_hash", response.json()["data"]["user"])
        get_by_email_mock.assert_called_once_with("casey@example.com")


class RoleAuthorizationTests(unittest.TestCase):
    def test_only_admin_can_access_user_creation(self):
        admin = {"role": "ADMIN"}
        self.assertIs(admin_only(admin), admin)

        with self.assertRaises(Forbidden):
            admin_only({"role": "SUPERVISOR"})

    def test_manager_can_access_manager_endpoint(self):
        manager = {"role": "MANAGER"}
        dependency = require_roles("ADMIN", "MANAGER")

        self.assertIs(dependency(manager), manager)

    def test_supervisor_is_denied_manager_endpoint(self):
        dependency = require_roles("ADMIN", "MANAGER")

        with self.assertRaises(Forbidden):
            dependency({"role": "SUPERVISOR"})

    def test_manager_assigned_targets_are_readable_by_all_dashboard_roles(self):
        for role in ("ADMIN", "MANAGER", "SUPERVISOR"):
            with self.subTest(role=role):
                user = {"role": role}
                self.assertIs(dashboard_read_roles(user), user)

    def test_only_manager_can_create_or_change_assigned_targets(self):
        manager = {"role": "MANAGER"}
        self.assertIs(target_write_role(manager), manager)

        for role in ("ADMIN", "SUPERVISOR"):
            with self.subTest(role=role), self.assertRaises(Forbidden):
                target_write_role({"role": role})


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
