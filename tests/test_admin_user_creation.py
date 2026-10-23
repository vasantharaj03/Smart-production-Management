import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.core import security
from app.dashboard import service
from app.main import app


class AdminUserCreationTests(unittest.TestCase):
    def test_admin_can_create_accounts_with_all_supported_roles(self):
        previous_override = app.dependency_overrides.get(get_current_user)
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": 2,
            "role": "ADMIN",
        }
        try:
            with (
                patch.object(service, "_schema_ready", True),
                patch.object(
                    service,
                    "create_admin_user",
                    side_effect=lambda body, admin: {
                        "user_id": 7,
                        "full_name": body.full_name,
                        "email": str(body.email).lower(),
                        "role": body.role,
                        "is_active": True,
                    },
                ) as create_user,
                TestClient(app) as client,
            ):
                for role in ("ADMIN", "MANAGER", "SUPERVISOR"):
                    with self.subTest(role=role):
                        response = client.post(
                            "/api/v1/admin/users",
                            json={
                                "full_name": "Casey Worker",
                                "email": "casey@example.com",
                                "password": "secure-password",
                                "role": role,
                            },
                        )
                        self.assertEqual(response.status_code, 201)
                        self.assertEqual(response.json()["data"]["role"], role)
                self.assertEqual(create_user.call_count, 3)
        finally:
            if previous_override is None:
                app.dependency_overrides.pop(get_current_user, None)
            else:
                app.dependency_overrides[get_current_user] = previous_override

    def test_non_admin_cannot_create_an_account(self):
        previous_override = app.dependency_overrides.get(get_current_user)
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": 3,
            "role": "MANAGER",
        }
        try:
            with (
                patch.object(service, "_schema_ready", True),
                patch.object(service, "create_admin_user") as create_user,
                TestClient(app) as client,
            ):
                response = client.post(
                    "/api/v1/admin/users",
                    json={
                        "full_name": "Casey Worker",
                        "email": "casey@example.com",
                        "password": "secure-password",
                        "role": "SUPERVISOR",
                    },
                )
                self.assertEqual(response.status_code, 403)
                create_user.assert_not_called()
        finally:
            if previous_override is None:
                app.dependency_overrides.pop(get_current_user, None)
            else:
                app.dependency_overrides[get_current_user] = previous_override

    @patch("app.dashboard.service.log_audit")
    @patch("app.dashboard.service.AuthRepository")
    def test_created_account_is_hashed_and_audited(self, repository_class, log_audit):
        repository = repository_class.return_value
        repository.create_user.return_value = {
            "user_id": 7,
            "full_name": "Casey Worker",
            "email": "casey@example.com",
            "role": "MANAGER",
            "is_active": True,
        }
        payload = SimpleNamespace(
            full_name="Casey Worker",
            email="Casey@Example.com",
            password="secure-password",
            role="MANAGER",
        )
        admin = {"user_id": 2, "full_name": "Site Admin"}

        created = service.create_admin_user(payload, admin)

        kwargs = repository.create_user.call_args.kwargs
        self.assertEqual(kwargs["email"], "casey@example.com")
        self.assertEqual(kwargs["role"], "MANAGER")
        self.assertTrue(
            security.verify_password("secure-password", kwargs["password_hash"])
        )
        self.assertEqual(created["user_id"], 7)
        log_audit.assert_called_once_with(
            admin,
            "Created User",
            "casey@example.com",
            "role=MANAGER",
        )


if __name__ == "__main__":
    unittest.main()
