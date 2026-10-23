import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.dashboard import service
from app.errors.exceptions import Conflict, InvalidRequest, NotFound
from app.main import app


class ManagerSupervisorTests(unittest.TestCase):
    def test_manager_supervisor_routes_are_manager_only(self):
        previous_override = app.dependency_overrides.get(get_current_user)
        app.dependency_overrides[get_current_user] = lambda: {"role": "MANAGER", "user_id": 9}
        try:
            with (
                patch.object(service, "_schema_ready", True),
                patch.object(service, "list_manager_supervisors", return_value=[]) as list_supervisors,
                patch.object(service, "assign_supervisor_shift", return_value={"shift_id": 2}) as assign_shift,
                TestClient(app) as client,
            ):
                self.assertEqual(client.get("/api/v1/manager/supervisors").status_code, 200)
                response = client.patch(
                    "/api/v1/manager/supervisors/7/shift",
                    json={"shift_id": 2, "reason": "Emergency cover"},
                )
                self.assertEqual(response.status_code, 200)
                assign_shift.assert_called_once()
                list_supervisors.assert_called_once()

                app.dependency_overrides[get_current_user] = lambda: {
                    "role": "SUPERVISOR",
                    "user_id": 7,
                }
                self.assertEqual(
                    client.get("/api/v1/manager/supervisors").status_code,
                    403,
                )
                denied = client.patch(
                    "/api/v1/manager/supervisors/7/shift",
                    json={"shift_id": 2},
                )
                self.assertEqual(denied.status_code, 403)
                assign_shift.assert_called_once()
        finally:
            if previous_override is None:
                app.dependency_overrides.pop(get_current_user, None)
            else:
                app.dependency_overrides[get_current_user] = previous_override

    @patch("app.dashboard.service.log_audit")
    @patch("app.dashboard.service.get_cursor")
    @patch("app.dashboard.service.find_shift")
    def test_manager_assigns_an_active_a_to_c_shift_and_audits_reason(
        self, find_shift, get_cursor, log_audit
    ):
        find_shift.return_value = {
            "shift_id": 2,
            "shift_name": "B - Evening",
            "is_active": 1,
        }
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {
                "shift_id": 2,
                "shift_name": "B - Evening",
                "is_active": 1,
            },
            {
                "user_id": 7,
                "full_name": "Casey Supervisor",
                "email": "casey@example.com",
                "role": "SUPERVISOR",
                "is_active": 1,
                "shift_id": 1,
            },
            {
                "user_id": 7,
                "full_name": "Casey Supervisor",
                "email": "casey@example.com",
                "is_active": 1,
                "shift_id": 2,
                "shift_name": "B - Evening",
            },
        ]
        get_cursor.return_value.__enter__.return_value = (None, cursor)

        result = service.assign_supervisor_shift(
            7,
            {"shift_id": 2, "reason": "Emergency cover"},
            {"user_id": 9, "full_name": "Manager"},
        )

        self.assertEqual(result["shift_id"], 2)
        self.assertEqual(cursor.execute.call_args_list[2].args[1], (2, 7))
        log_audit.assert_called_once()
        self.assertIn("Emergency cover", log_audit.call_args.args[3])

    @patch("app.dashboard.service.get_cursor")
    @patch("app.dashboard.service.find_shift")
    def test_assignment_rejects_inactive_or_non_abc_shifts(self, find_shift, get_cursor):
        for shift, message in (
            ({"shift_id": 4, "shift_name": "D - Weekend", "is_active": 1}, "A, B, or C"),
            ({"shift_id": 2, "shift_name": "B - Evening", "is_active": 0}, "inactive"),
        ):
            with self.subTest(shift=shift):
                find_shift.return_value = shift
                with self.assertRaisesRegex(InvalidRequest, message):
                    service.assign_supervisor_shift(7, {"shift_id": shift["shift_id"]}, {})
        get_cursor.assert_not_called()

    @patch("app.dashboard.service.get_cursor")
    @patch("app.dashboard.service.find_shift")
    def test_assignment_only_updates_supervisor_accounts(self, find_shift, get_cursor):
        find_shift.return_value = {
            "shift_id": 1,
            "shift_name": "A - Day",
            "is_active": 1,
        }
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {"shift_id": 1, "shift_name": "A - Day", "is_active": 1},
            {"user_id": 7, "role": "MANAGER", "is_active": 1, "shift_id": None},
        ]
        get_cursor.return_value.__enter__.return_value = (None, cursor)

        with self.assertRaises(NotFound):
            service.assign_supervisor_shift(7, {"shift_id": 1}, {})
        self.assertEqual(cursor.execute.call_count, 2)

    @patch("app.dashboard.service.get_cursor")
    def test_admin_cannot_deactivate_a_shift_assigned_to_supervisors(self, get_cursor):
        cursor = MagicMock()
        cursor.fetchone.side_effect = [{"shift_id": 2}, {"n": 1}]
        get_cursor.return_value.__enter__.return_value = (None, cursor)

        with self.assertRaisesRegex(Conflict, "Reassign supervisors"):
            service.update_shift(2, {"is_active": False}, {"user_id": 9})
        self.assertEqual(cursor.execute.call_count, 2)

    @patch("app.dashboard.service.log_audit")
    @patch("app.dashboard.service.get_cursor")
    @patch("app.dashboard.service.find_shift")
    @patch("app.dashboard.service.find_machine")
    @patch("app.dashboard.service.find_product")
    def test_supervisor_entry_uses_assigned_shift(
        self, find_product, find_machine, find_shift, get_cursor, log_audit
    ):
        find_product.return_value = {"product_id": 3, "product_code": "P03"}
        find_machine.return_value = {"machine_id": 4, "machine_name": "Line 4"}
        find_shift.return_value = {
            "shift_id": 2,
            "shift_name": "B - Evening",
            "is_active": 1,
        }
        cursor = MagicMock()
        cursor.lastrowid = 100
        get_cursor.return_value.__enter__.return_value = (None, cursor)

        result = service.submit_shift_entry(
            {"product": "P03", "machine": "Line 4", "produced": 12},
            {"user_id": 7, "role": "SUPERVISOR", "shift_id": 2},
        )

        self.assertEqual(result, {"production_id": 100, "ok": True})
        self.assertEqual(cursor.execute.call_args.args[1][2], 2)
        self.assertEqual(cursor.execute.call_args.args[1][3], 7)

    @patch("app.dashboard.service.find_shift")
    @patch("app.dashboard.service.find_machine")
    @patch("app.dashboard.service.find_product")
    def test_supervisor_cannot_record_production_on_another_shift(
        self, find_product, find_machine, find_shift
    ):
        find_product.return_value = {"product_id": 3}
        find_machine.return_value = {"machine_id": 4}
        find_shift.side_effect = [
            {"shift_id": 1, "shift_name": "A - Day", "is_active": 1},
            {"shift_id": 2, "shift_name": "B - Evening", "is_active": 1},
        ]

        with self.assertRaisesRegex(InvalidRequest, "assigned shift"):
            service.submit_shift_entry(
                {
                    "product": "P03",
                    "machine": "Line 4",
                    "shift": "A - Day",
                    "produced": 12,
                },
                {"user_id": 7, "role": "SUPERVISOR", "shift_id": 2},
            )


if __name__ == "__main__":
    unittest.main()
