import unittest
from datetime import date, datetime
from unittest.mock import MagicMock, patch

from app.dashboard import service
from app.errors.exceptions import Conflict, InvalidRequest


class TargetProductionTests(unittest.TestCase):
    def test_weekly_and_monthly_ranges_cover_calendar_period_to_date(self):
        today = date.today()
        week_start, week_end, previous_week_start, previous_week_end = service.period("weekly")
        month_start, month_end, _, _ = service.period("monthly")

        self.assertEqual(week_start.weekday(), 0)
        self.assertEqual(week_end, today)
        self.assertEqual((previous_week_end - previous_week_start).days, 6)
        self.assertEqual(month_start, today.replace(day=1))
        self.assertEqual(month_end, today)

    @patch("app.dashboard.service.rows")
    def test_production_report_contains_period_totals_and_zero_production_targets(self, rows):
        rows.side_effect = [
            [{"d": date(2026, 10, 20), "produced": 120, "defective": 3}],
            [
                {"d": date(2026, 10, 20), "target": 150},
                {"d": date(2026, 10, 21), "target": 80},
            ],
            [
                {
                    "product_code": "P70",
                    "product_name": "HairDye",
                    "produced": 120,
                    "defective": 3,
                    "target": 150,
                },
                {
                    "product_code": "P20",
                    "product_name": "Soap",
                    "produced": 0,
                    "defective": 0,
                    "target": 80,
                },
            ],
        ]

        result = service._production_report(date(2026, 10, 20), date(2026, 10, 21))

        self.assertEqual((result["produced"], result["target"], result["defective"]), (120, 230, 3))
        self.assertEqual(result["daily"], [
            {"date": "20 Oct", "produced": 120, "target": 150, "defective": 3},
            {"date": "21 Oct", "produced": 0, "target": 80, "defective": 0},
        ])
        self.assertEqual(result["products"][1]["product_code"], "P20")
        self.assertEqual(len(rows.call_args_list), 3)
        self.assertIn("WHERE p.is_active = 1", rows.call_args_list[2].args[0])

    @patch("app.dashboard.service.rows")
    def test_product_summary_includes_every_active_product_and_separate_totals(self, rows):
        rows.return_value = [
            {
                "product_id": 1,
                "product_code": "P70",
                "product_name": "HairDye",
                "target_quantity": 800,
                "produced_quantity": 320,
            }
        ]

        result = service.list_product_production("2026-10-23", "A")

        self.assertEqual(result[0]["target_quantity"], 800)
        self.assertEqual(result[0]["produced_quantity"], 320)
        query, params = rows.call_args.args
        self.assertIn("WHERE p.is_active = 1", query)
        self.assertIn("FROM production_targets", query)
        self.assertIn("FROM production_records", query)
        self.assertEqual(
            params,
            (date(2026, 10, 23), "A", "A", date(2026, 10, 23), "A", "A"),
        )

    @patch("app.dashboard.service.rows")
    def test_list_targets_includes_recorded_production_for_each_target(self, rows):
        target = {
            "target_id": 3,
            "target_date": date(2026, 10, 23),
            "target_quantity": 1000,
            "product_code": "P012",
            "product_name": "Shampoo Sachet",
            "machine_code": "PACK-01",
            "machine_name": "Pack 01",
            "shift_name": "A - Day",
            "produced_quantity": 375,
        }
        rows.return_value = [target]

        result = service.list_targets("2026-10-23")

        self.assertEqual(result[0]["produced_quantity"], 375)
        query, params = rows.call_args.args
        self.assertIn("SUM(r.quantity_produced)", query)
        self.assertIn("r.production_date = t.target_date", query)
        self.assertIn("r.product_id = t.product_id", query)
        self.assertIn("r.machine_id = t.machine_id", query)
        self.assertIn("r.shift_id = t.shift_id", query)
        self.assertIn("NOT EXISTS", query)
        self.assertIn("scoped.shift_id = r.shift_id", query)
        self.assertEqual(params, (date(2026, 10, 23),))

    @patch("app.dashboard.service.get_cursor")
    @patch("app.dashboard.service.one")
    def test_supervisor_can_send_incomplete_target_report_to_active_manager(self, one, get_cursor):
        one.side_effect = [
            {
                "target_id": 4,
                "target_quantity": 500,
                "product_code": "P70",
                "product_name": "HairDye",
                "shift_name": "A - Day",
            },
            {"user_id": 2},
        ]
        cursor = MagicMock()
        cursor.lastrowid = 31
        get_cursor.return_value.__enter__.return_value = (None, cursor)

        result = service.create_target_progress_report(
            {
                "target_id": 4,
                "manager_id": 2,
                "actual_quantity": 320,
                "reason": "Machine stopped for maintenance.",
            },
            {"user_id": 7},
        )

        self.assertEqual(result, {"report_id": 31, "manager_id": 2})
        query, params = cursor.execute.call_args.args
        self.assertIn("INSERT INTO target_progress_reports", query)
        self.assertEqual(params, (4, 7, 2, 320, "Machine stopped for maintenance."))

    @patch("app.dashboard.service.get_cursor")
    @patch("app.dashboard.service.one")
    def test_completed_target_cannot_be_reported_as_incomplete(self, one, get_cursor):
        one.return_value = {
            "target_id": 4,
            "target_quantity": 500,
            "product_code": "P70",
            "product_name": "HairDye",
            "shift_name": "A - Day",
        }

        with self.assertRaisesRegex(InvalidRequest, "already complete"):
            service.create_target_progress_report(
                {
                    "target_id": 4,
                    "manager_id": 2,
                    "actual_quantity": 500,
                    "reason": "Production reached assigned target.",
                },
                {"user_id": 7},
            )

        one.assert_called_once()
        get_cursor.assert_not_called()

    @patch("app.dashboard.service.get_cursor")
    def test_manager_can_mark_own_target_report_as_reviewed(self, get_cursor):
        cursor = MagicMock()
        cursor.rowcount = 1
        get_cursor.return_value.__enter__.return_value = (None, cursor)

        result = service.review_target_progress_report(31, {"user_id": 2})

        self.assertEqual(result, {"report_id": 31, "reviewed": True})
        self.assertIn("SET reviewed_at = CURRENT_TIMESTAMP", cursor.execute.call_args.args[0])
        self.assertEqual(cursor.execute.call_args.args[1], (31, 2))

    @patch("app.dashboard.service.rows")
    @patch("app.dashboard.service.compute_alerts")
    def test_notifications_include_current_alerts_and_unreviewed_manager_reports(self, compute_alerts, rows):
        compute_alerts.return_value = [
            {
                "level": "high",
                "machine": "Machine 01",
                "text": "Extended Downtime (> 60m)",
                "duration": "1h 12m",
                "action": "Action Required",
            }
        ]
        rows.return_value = [
            {
                "report_id": 31,
                "actual_quantity": 320,
                "reason": "Machine stopped for maintenance.",
                "created_at": datetime(2026, 10, 23, 12, 30),
                "target_quantity": 500,
                "product_code": "P70",
                "product_name": "HairDye",
                "supervisor_name": "Shift Supervisor",
            }
        ]

        result = service.list_notifications({"user_id": 2, "role": "MANAGER"})

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["id"], "database-alert:Machine 01:Extended Downtime (> 60m)")
        self.assertEqual(result[1]["id"], "target-report:31")
        self.assertIn("P70 HairDye (320/500)", result[1]["text"])
        self.assertEqual(rows.call_args.args[1], (2,))

    @patch("app.dashboard.service.get_cursor")
    @patch("app.dashboard.service.find_shift", return_value={"shift_id": 2})
    @patch("app.dashboard.service.find_machine", return_value=None)
    @patch("app.dashboard.service.find_product", return_value={"product_id": 5, "product_code": "P012"})
    @patch("app.dashboard.service.one", return_value={"target_id": 9})
    def test_saving_duplicate_target_does_not_change_fixed_target(
        self,
        one,
        find_product,
        find_machine,
        find_shift,
        get_cursor,
    ):
        with self.assertRaisesRegex(Conflict, "saved target is fixed"):
            service.create_target(
                {
                    "product": "P012",
                    "shift": "B - Evening",
                    "quantity": 2500,
                    "date": "2026-10-23",
                },
                {"user_id": 7},
            )

        one.assert_called_once()
        self.assertEqual(
            one.call_args.args[1],
            (date(2026, 10, 23), 5, None, 2),
        )
        get_cursor.assert_not_called()


if __name__ == "__main__":
    unittest.main()
