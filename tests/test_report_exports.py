import io
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.api.dependencies import get_current_user
from app.dashboard import service
from app.errors.exceptions import InvalidRequest, NotFound
from app.main import app


class ReportExportTests(unittest.TestCase):
    def setUp(self):
        self.headers = ["Machine", "Produced", "Recorded"]
        self.data = [["Machine 1", 25, "2026-10-23"]]

    @patch("app.dashboard.service.build_report")
    def test_pdf_export_is_a_real_pdf(self, build_report):
        build_report.return_value = (self.headers, self.data)

        content, media_type, extension = service.export_report(
            "Full Daily Summary",
            "PDF",
        )

        self.assertTrue(content.startswith(b"%PDF-"))
        self.assertEqual(media_type, "application/pdf")
        self.assertEqual(extension, "pdf")

    @patch("app.dashboard.service.build_report")
    def test_excel_export_is_a_real_xlsx_workbook(self, build_report):
        build_report.return_value = (self.headers, self.data)

        content, media_type, extension = service.export_report(
            "Weekly OEE Report",
            "Excel",
        )

        workbook = load_workbook(io.BytesIO(content), read_only=True)
        worksheet = workbook.active
        self.assertEqual(list(worksheet.values), [tuple(self.headers), tuple(self.data[0])])
        self.assertEqual(
            media_type,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertEqual(extension, "xlsx")

    def test_export_rejects_mismatched_or_untracked_formats(self):
        with self.assertRaisesRegex(InvalidRequest, "must be downloaded as PDF"):
            service.export_report("Full Daily Summary", "Excel")
        with self.assertRaisesRegex(InvalidRequest, "must be downloaded as Excel"):
            service.export_report("Weekly OEE Report", "CSV")

        with self.assertRaisesRegex(NotFound, "no data is tracked"):
            service.export_report("Energy Usage", "PDF")

    def test_report_download_route_returns_the_report_format_and_extension(self):
        previous_override = app.dependency_overrides.get(get_current_user)
        app.dependency_overrides[get_current_user] = lambda: {"role": "MANAGER"}
        try:
            with (
                patch.object(service, "_schema_ready", True),
                patch.object(
                    service,
                    "export_report",
                    return_value=(b"%PDF-test", "application/pdf", "pdf"),
                ) as export_report,
                TestClient(app) as client,
            ):
                response = client.get(
                    "/api/v1/reports/download",
                    params={"name": "Full Daily Summary", "type": "PDF"},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["content-type"], "application/pdf")
            self.assertIn(
                "Full_Daily_Summary.pdf",
                response.headers["content-disposition"],
            )
            export_report.assert_called_once_with("Full Daily Summary", "PDF")
        finally:
            if previous_override is None:
                app.dependency_overrides.pop(get_current_user, None)
            else:
                app.dependency_overrides[get_current_user] = previous_override


if __name__ == "__main__":
    unittest.main()
