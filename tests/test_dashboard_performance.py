import unittest
from unittest.mock import patch

from app.dashboard import service


class DashboardPerformanceTests(unittest.TestCase):
    def tearDown(self):
        service.clear_dashboard_cache()

    def test_dashboard_cache_supports_user_dictionary_arguments(self):
        calls = []

        @service.ttl_cached(30)
        def load_dashboard(user):
            calls.append(user["user_id"])
            return {"user_id": user["user_id"]}

        self.assertEqual(load_dashboard({"user_id": 7, "role": "SUPERVISOR"}), {"user_id": 7})
        self.assertEqual(load_dashboard({"role": "SUPERVISOR", "user_id": 7}), {"user_id": 7})
        self.assertEqual(load_dashboard({"user_id": 8, "role": "SUPERVISOR"}), {"user_id": 8})
        self.assertEqual(calls, [7, 8])

    @patch("app.dashboard.service.rows", return_value=[])
    @patch("app.dashboard.service.one")
    def test_admin_dashboard_uses_fewer_database_round_trips(self, one, _rows):
        service.clear_dashboard_cache()
        one.side_effect = [
            {
                "users_active": 4,
                "operators": 2,
                "managers": 1,
                "admins": 1,
                "new_users": 0,
                "products_total": 3,
                "products_active": 2,
                "products_updated_today": 0,
                "machines_total": 2,
                "machines_running": 1,
                "machines_maintenance": 0,
                "machines_idle": 1,
                "machines_down": 0,
                "shifts_total": 3,
                "shifts_active": 3,
            },
            {"t": None},
            {
                "records_total": 5,
                "records_with_shift": 4,
                "products_used": 2,
                "machines_used": 1,
            },
        ]

        data = service.admin_dashboard("today")

        self.assertEqual(one.call_count, 3)
        self.assertEqual(data["kpis"]["users"]["active"], 4)
        self.assertEqual(data["kpis"]["machines"]["active"], 1)
        self.assertEqual(data["reconciliation"][0]["unreconciled"], 0)
        self.assertEqual(data["reconciliation"][2]["unreconciled"], 1)


if __name__ == "__main__":
    unittest.main()
