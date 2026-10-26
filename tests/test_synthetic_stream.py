import asyncio
import unittest
from datetime import datetime, time, timezone
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.dashboard import service
from app.dashboard.synthetic_stream import (
    SyntheticProductionStream,
    build_work_items,
    synthetic_stream,
)
from app.main import app


def sample_catalog():
    return {
        "products": [
            {"product_id": 1, "product_code": "P70", "product_name": "HairDye"},
            {"product_id": 2, "product_code": "P20", "product_name": "Soap"},
            {"product_id": 3, "product_code": "PO30", "product_name": "shampoo"},
        ],
        "machines": [
            {
                "machine_id": 1,
                "machine_code": "M01",
                "machine_name": "Machine 01",
                "status": "RUNNING",
            }
        ],
        "shifts": [
            {
                "shift_id": 1,
                "shift_name": "A - Day",
                "start_time": time(6),
                "end_time": time(14),
            },
            {
                "shift_id": 2,
                "shift_name": "B - Evening",
                "start_time": time(14),
                "end_time": time(22),
            },
        ],
        "targets": [
            {
                "product_id": 1,
                "machine_id": 1,
                "shift_id": 1,
                "target_quantity": 500,
            },
            {
                "product_id": 1,
                "machine_id": 1,
                "shift_id": 1,
                "target_quantity": 600,
            },
            {
                "product_id": 1,
                "machine_id": None,
                "shift_id": None,
                "target_quantity": 100,
            },
            {
                "product_id": 2,
                "machine_id": 1,
                "shift_id": 2,
                "target_quantity": 700,
            },
        ],
    }


class SyntheticProductionStreamTests(unittest.TestCase):
    def test_work_items_use_active_shift_targets_and_database_catalog(self):
        work_items = build_work_items(
            sample_catalog(),
            datetime(2026, 10, 23, 10, tzinfo=timezone.utc),
        )

        self.assertEqual(
            [
                (item["product"]["product_code"], item["shift"]["shift_name"], item["target_quantity"])
                for item in work_items
            ],
            [
                ("P70", "A - Day", 500),
                ("PO30", "A - Day", 0),
            ],
        )
        self.assertEqual(
            sum(item["product"]["product_code"] == "P70" for item in work_items),
            1,
        )
        self.assertEqual(work_items[0]["product_target_quantity"], 1200)
        self.assertEqual(work_items[0]["shift_target_quantity"], 1100)

    def test_snapshots_increase_without_changing_database_targets(self):
        stream = SyntheticProductionStream()
        stream._work_items = [
            build_work_items(
                sample_catalog(),
                datetime(2026, 10, 23, 10, tzinfo=timezone.utc),
            )[0]
        ]
        stream._catalog_loaded_at = 9999999999
        stream._production_loaded_at = float("inf")
        stream._production_date = datetime.now().date()

        async def read_two_snapshots():
            with patch("app.dashboard.synthetic_stream.STREAM_INTERVAL_SECONDS", 0):
                return await asyncio.gather(stream.next_event(), stream.next_event())

        first, second = asyncio.run(read_two_snapshots())

        self.assertEqual(first["data_source"], "synthetic")
        self.assertEqual(first["kpis"]["target_quantity"], 0)
        self.assertEqual(first["product"]["code"], "P70")
        self.assertGreater(second["production"]["total_produced"], first["production"]["total_produced"])
        self.assertEqual(
            second["production"]["good_quantity"] + second["production"]["defective_quantity"],
            second["production"]["total_produced"],
        )

    def test_synthetic_production_stops_at_target_including_saved_production(self):
        catalog = sample_catalog()
        catalog["targets"] = [catalog["targets"][0]]
        catalog["targets"][0]["target_quantity"] = 25
        catalog["targets"][0]["shift_id"] = None
        catalog["production"] = [{"product_id": 1, "produced_quantity": 10}]
        work_item = build_work_items(catalog, datetime.now().astimezone())[0]
        stream = SyntheticProductionStream()
        stream._work_items = [work_item]
        stream._catalog_loaded_at = float("inf")
        stream._production_loaded_at = float("inf")
        stream._production_date = datetime.now().date()

        async def produce_until_capped():
            with patch("app.dashboard.synthetic_stream.STREAM_INTERVAL_SECONDS", 0):
                return [await stream.next_event() for _ in range(5)]

        events = asyncio.run(produce_until_capped())

        self.assertEqual(events[-1]["production"]["total_produced"], 15)
        self.assertTrue(
            all(event["production"]["total_produced"] <= 15 for event in events)
        )
        self.assertEqual(events[-1]["production"]["good_quantity"] + events[-1]["production"]["defective_quantity"], 15)
        self.assertTrue(events[-1]["production"]["completed"])
        self.assertEqual(events[-1]["machine"]["status"], "COMPLETED")

    def test_saved_completed_target_emits_no_more_production(self):
        catalog = sample_catalog()
        catalog["targets"] = [catalog["targets"][0]]
        catalog["targets"][0]["target_quantity"] = 25
        catalog["targets"][0]["shift_id"] = None
        catalog["production"] = [{"product_id": 1, "produced_quantity": 25}]
        work_item = build_work_items(catalog, datetime.now().astimezone())[0]
        stream = SyntheticProductionStream()
        stream._work_items = [work_item]
        stream._catalog_loaded_at = float("inf")
        stream._production_loaded_at = float("inf")
        stream._production_date = datetime.now().date()

        event = asyncio.run(stream.next_event())

        self.assertEqual(event["production"]["last_cycle_quantity"], 0)
        self.assertTrue(event["production"]["completed"])
        self.assertEqual(event["machine"]["status"], "COMPLETED")

    def test_websocket_authenticates_and_delivers_synthetic_events(self):
        event = {"data_source": "synthetic"}
        client = TestClient(app)
        with (
            patch.object(service, "_schema_ready", True),
            patch(
                "app.dashboard.routes.get_current_user",
                return_value={"role": "MANAGER"},
            ) as authenticate,
            patch.object(synthetic_stream, "next_event", new=AsyncMock(return_value=event)),
            client.websocket_connect(
                "/api/v1/stream/production",
                subprotocols=["bearer", "signed-token"],
            ) as websocket,
        ):
            self.assertEqual(websocket.receive_json(), event)

        credentials = authenticate.call_args.args[0]
        self.assertEqual(credentials.scheme, "Bearer")
        self.assertEqual(credentials.credentials, "signed-token")

    def test_websocket_rejects_missing_authentication(self):
        client = TestClient(app)
        with patch.object(service, "_schema_ready", True):
            with self.assertRaises(WebSocketDisconnect):
                with client.websocket_connect("/api/v1/stream/production"):
                    self.fail("Unauthenticated WebSocket was accepted.")


if __name__ == "__main__":
    unittest.main()
