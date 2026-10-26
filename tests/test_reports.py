import io
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.api.dependencies import get_current_user
from app.dashboard import service
from app.errors.exceptions import InvalidRequest
from app.main import app


class ReportDownloadTests(unittest.TestCase):
    def test_pdf_report_is_a_pdf_document(self):
        with patch.object(
            service,
            "build_report",
            return_value=(["Machine", "Produced"], [["Line 1", 125]]),
        ):
            content = service.report_pdf("Machine Performance")

        self.assertTrue(content.startswith(b"%PDF-"))
        self.assertNotIn(b"Machine,Produced", content)

    def test_excel_report_is_a_formatted_xlsx_workbook(self):
        with patch.object(
            service,
            "build_report",
            return_value=(["Machine", "Produced"], [["Line 1", 125]]),
        ):
            content = service.report_excel("Machine Performance")

        workbook = load_workbook(io.BytesIO(content), read_only=False)
        sheet = workbook.active
        self.assertEqual(list(sheet.values), [("Machine", "Produced"), ("Line 1", 125)])
        self.assertEqual(sheet.freeze_panes, "A2")
        self.assertEqual(sheet["A1"].font.bold, True)
        workbook.close()

    def test_report_file_rejects_unsupported_formats(self):
        with self.assertRaises(InvalidRequest):
            service.report_file("Machine Performance", "CSV")

    def test_download_route_uses_requested_report_format(self):
        previous_override = app.dependency_overrides.get(get_current_user)
        app.dependency_overrides[get_current_user] = lambda: {
            "role": "SUPERVISOR",
            "user_id": 7,
        }
        try:
            with (
                patch.object(service, "_schema_ready", True),
                patch.object(
                    service,
                    "report_file",
                    side_effect=[
                        (b"%PDF-sample", "application/pdf", "pdf"),
                        (
                            b"PK-sample",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "xlsx",
                        ),
                    ],
                ) as make_report,
                TestClient(app) as client,
            ):
                pdf = client.get(
                    "/api/v1/reports/download",
                    params={"name": "Full Daily Summary", "type": "PDF"},
                )
                excel = client.get(
                    "/api/v1/reports/download",
                    params={"name": "Weekly OEE Report", "type": "Excel"},
                )

            self.assertEqual(pdf.headers["content-type"], "application/pdf")
            self.assertIn(".pdf", pdf.headers["content-disposition"])
            self.assertEqual(excel.headers["content-type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            self.assertIn(".xlsx", excel.headers["content-disposition"])
            self.assertEqual(make_report.call_args_list[0].args, ("Full Daily Summary", "PDF"))
            self.assertEqual(make_report.call_args_list[1].args, ("Weekly OEE Report", "Excel"))
        finally:
            if previous_override is None:
                app.dependency_overrides.pop(get_current_user, None)
            else:
                app.dependency_overrides[get_current_user] = previous_override
