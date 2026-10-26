
"""Synthetic production snapshots built from the application's database catalog."""

import asyncio
import copy
import logging
import time
from datetime import datetime, time as day_time, timezone
from uuid import uuid4

from app.core.database import get_cursor

logger = logging.getLogger(__name__)

STREAM_INTERVAL_SECONDS = 2
CATALOG_REFRESH_SECONDS = 30


def _load_production_totals(cursor):
    """Load today's production totals at product, shift, and machine levels."""

    cursor.execute(
        """
        SELECT product_id,
               SUM(quantity_produced) AS produced_quantity
        FROM production_records
        WHERE production_date = CURRENT_DATE()
        GROUP BY product_id
        """
    )
    production = cursor.fetchall()

    cursor.execute(
        """
        SELECT product_id, shift_id,
               SUM(quantity_produced) AS produced_quantity
        FROM production_records
        WHERE production_date = CURRENT_DATE()
        GROUP BY product_id, shift_id
        """
    )
    production_by_shift = cursor.fetchall()

    cursor.execute(
        """
        SELECT product_id, machine_id, shift_id,
               SUM(quantity_produced) AS produced_quantity
        FROM production_records
        WHERE production_date = CURRENT_DATE()
        GROUP BY product_id, machine_id, shift_id
        """
    )
    production_by_machine_shift = cursor.fetchall()

    return production, production_by_shift, production_by_machine_shift


def _minutes(value):
    if isinstance(value, day_time):
        return value.hour * 60 + value.minute

    if hasattr(value, "total_seconds"):
        return int(value.total_seconds() // 60) % (24 * 60)

    if isinstance(value, str):
        hour, minute = (int(part) for part in value.split(":")[:2])
        return hour * 60 + minute

    return 0


def _shift_for_now(shifts, now):
    current = now.hour * 60 + now.minute

    for shift in shifts:
        start = _minutes(shift["start_time"])
        end = _minutes(shift["end_time"])

        if (
            start <= current < end
            if start < end
            else current >= start or current < end
        ):
            return shift

    return shifts[0]


def build_work_items(catalog, now):
    products = catalog["products"]
    machines = catalog["machines"]
    shifts = catalog["shifts"]

    if not products or not machines or not shifts:
        raise RuntimeError(
            "Synthetic production needs at least one active product, machine, and shift."
        )

    product_by_id = {
        product["product_id"]: product for product in products
    }
    machine_by_id = {
        machine["machine_id"]: machine for machine in machines
    }
    shift_by_id = {
        shift["shift_id"]: shift for shift in shifts
    }

    current_shift = _shift_for_now(shifts, now)

    work_items = []
    targeted_product_ids = set()
    work_item_keys = set()

    target_by_product = {}
    shift_target_by_product = {}

    recorded_by_product = {
        row["product_id"]: int(row["produced_quantity"] or 0)
        for row in catalog.get("production", [])
    }

    recorded_by_product_shift = {
        (row["product_id"], row["shift_id"]): int(
            row["produced_quantity"] or 0
        )
        for row in catalog.get("production_by_shift", [])
        if row["shift_id"] is not None
    }

    recorded_by_machine_shift = {
        (
            row["product_id"],
            row["machine_id"],
            row["shift_id"],
        ): int(row["produced_quantity"] or 0)
        for row in catalog.get("production_by_machine_shift", [])
        if row["machine_id"] is not None and row["shift_id"] is not None
    }

    # Calculate total product and shift targets.
    for target in catalog["targets"]:
        product_id = target["product_id"]
        shift_id = target["shift_id"]
        quantity = int(target["target_quantity"] or 0)

        target_by_product[product_id] = (
            target_by_product.get(product_id, 0) + quantity
        )

        target_key = (product_id, shift_id)
        shift_target_by_product[target_key] = (
            shift_target_by_product.get(target_key, 0) + quantity
        )

    # Create one work item for each product/machine/shift combination.
    for target in catalog["targets"]:
        product_id = target["product_id"]
        targeted_product_ids.add(product_id)

        product = product_by_id.get(product_id)
        if product is None:
            continue

        if target["shift_id"]:
            shift = shift_by_id.get(target["shift_id"])
            if shift is None:
                continue
        else:
            shift = current_shift

        if shift["shift_id"] != current_shift["shift_id"]:
            continue

        machine = (
            machine_by_id.get(target["machine_id"])
            if target["machine_id"]
            else None
        )

        if machine is None:
            machine = machines[(product_id - 1) % len(machines)]

        key = (
            product_id,
            machine["machine_id"],
            shift["shift_id"],
        )

        if key in work_item_keys:
            continue

        work_item_keys.add(key)

        work_items.append(
            {
                "product": product,
                "machine": machine,
                "shift": shift,
                "target_quantity": int(target["target_quantity"] or 0),
                "product_target_quantity": target_by_product.get(
                    product_id, 0
                ),
                "shift_target_quantity": (
                    shift_target_by_product.get(
                        (product_id, shift["shift_id"]), 0
                    )
                    or shift_target_by_product.get((product_id, None), 0)
                ),
                "recorded_quantity": recorded_by_product.get(
                    product_id, 0
                ),
                "recorded_shift_quantity": recorded_by_product_shift.get(
                    (product_id, shift["shift_id"]), 0
                ),
                "recorded_machine_shift_quantity": (
                    recorded_by_machine_shift.get(
                        (
                            product_id,
                            machine["machine_id"],
                            shift["shift_id"],
                        ),
                        0,
                    )
                ),
            }
        )

    # Include products without a target so the stream can still report them.
    for index, product in enumerate(products):
        product_id = product["product_id"]

        if product_id in targeted_product_ids:
            continue

        machine = machines[index % len(machines)]

        work_items.append(
            {
                "product": product,
                "machine": machine,
                "shift": current_shift,
                "target_quantity": 0,
                "product_target_quantity": 0,
                "shift_target_quantity": 0,
                "recorded_quantity": recorded_by_product.get(
                    product_id, 0
                ),
                "recorded_shift_quantity": 0,
                "recorded_machine_shift_quantity": 0,
            }
        )

    return work_items


class SyntheticProductionStream:
    def __init__(self):
        self.session_id = uuid4().hex
        self._lock = asyncio.Lock()
        self._work_items = []
        self._catalog_loaded_at = 0.0
        self._production_loaded_at = 0.0
        self._last_event_at = 0.0
        self._cached_event = None
        self._sequence = 0
        self._production = {}
        self._machine_state = {}
        self._production_date = None

    @staticmethod
    def _load_catalog():
        with get_cursor() as (_, cursor):
            cursor.execute(
                """
                SELECT product_id, product_code, product_name
                FROM products
                WHERE is_active = 1
                ORDER BY product_id
                """
            )
            products = cursor.fetchall()

            cursor.execute(
                """
                SELECT machine_id, machine_code, machine_name, status
                FROM machines
                ORDER BY machine_id
                """
            )
            machines = cursor.fetchall()

            cursor.execute(
                """
                SELECT shift_id, shift_name, start_time, end_time, is_active
                FROM shifts
                ORDER BY start_time, shift_id
                """
            )
            all_shifts = cursor.fetchall()

            shifts = [
                shift for shift in all_shifts if shift["is_active"]
            ] or all_shifts

            cursor.execute(
                """
                SELECT
                    t.product_id,
                    t.machine_id,
                    t.shift_id,
                    t.target_quantity
                FROM production_targets t
                WHERE t.target_date = CURRENT_DATE()
                ORDER BY t.target_id
                """
            )
            targets = cursor.fetchall()

            (
                production,
                production_by_shift,
                production_by_machine_shift,
            ) = _load_production_totals(cursor)

        return {
            "products": products,
            "machines": machines,
            "shifts": shifts,
            "targets": targets,
            "production": production,
            "production_by_shift": production_by_shift,
            "production_by_machine_shift": production_by_machine_shift,
        }

    @staticmethod
    def _load_production():
        with get_cursor() as (_, cursor):
            return _load_production_totals(cursor)

    async def _refresh_work_items(self, now):
        catalog = await asyncio.to_thread(self._load_catalog)

        self._work_items = await asyncio.to_thread(
            build_work_items,
            catalog,
            now,
        )

        self._catalog_loaded_at = time.monotonic()
        self._production_loaded_at = self._catalog_loaded_at

        logger.info(
            "Synthetic production catalog loaded: %d products, %d machines, "
            "%d shifts, %d work items",
            len(
                {
                    item["product"]["product_id"]
                    for item in self._work_items
                }
            ),
            len(
                {
                    item["machine"]["machine_id"]
                    for item in self._work_items
                }
            ),
            len(
                {
                    item["shift"]["shift_id"]
                    for item in self._work_items
                }
            ),
            len(self._work_items),
        )

    async def _refresh_recorded_production(self):
        (
            production,
            production_by_shift,
            production_by_machine_shift,
        ) = await asyncio.to_thread(self._load_production)

        recorded_by_product = {
            row["product_id"]: int(row["produced_quantity"] or 0)
            for row in production
        }

        recorded_by_product_shift = {
            (row["product_id"], row["shift_id"]): int(
                row["produced_quantity"] or 0
            )
            for row in production_by_shift
            if row["shift_id"] is not None
        }

        recorded_by_machine_shift = {
            (
                row["product_id"],
                row["machine_id"],
                row["shift_id"],
            ): int(row["produced_quantity"] or 0)
            for row in production_by_machine_shift
            if row["machine_id"] is not None and row["shift_id"] is not None
        }

        self._work_items = [
            {
                **item,
                "recorded_quantity": recorded_by_product.get(
                    item["product"]["product_id"], 0
                ),
                "recorded_shift_quantity": recorded_by_product_shift.get(
                    (
                        item["product"]["product_id"],
                        item["shift"]["shift_id"],
                    ),
                    0,
                ),
                "recorded_machine_shift_quantity": (
                    recorded_by_machine_shift.get(
                        (
                            item["product"]["product_id"],
                            item["machine"]["machine_id"],
                            item["shift"]["shift_id"],
                        ),
                        0,
                    )
                ),
            }
            for item in self._work_items
        ]

        self._production_loaded_at = time.monotonic()

    def _create_event(self, item, now):
        self._sequence += 1

        product = item["product"]
        machine = item["machine"]
        shift = item["shift"]

        product_id = product["product_id"]
        machine_id = machine["machine_id"]
        shift_id = shift["shift_id"]

        key = (
            now.date().isoformat(),
            shift_id,
            product_id,
            machine_id,
        )

        production = self._production.setdefault(
            key,
            {
                "total": 0,
                "good": 0,
                "defective": 0,
                "cycles": 0,
            },
        )

        simulated_product_total = sum(
            value["total"]
            for counter_key, value in self._production.items()
            if counter_key[0] == key[0]
            and counter_key[2] == product_id
        )

        simulated_shift_total = sum(
            value["total"]
            for counter_key, value in self._production.items()
            if counter_key[0] == key[0]
            and counter_key[1] == shift_id
            and counter_key[2] == product_id
        )

        product_completed = (
            item["product_target_quantity"] > 0
            and item["recorded_quantity"] + simulated_product_total
            >= item["product_target_quantity"]
        )

        shift_completed = (
            item["shift_target_quantity"] > 0
            and item["recorded_shift_quantity"] + simulated_shift_total
            >= item["shift_target_quantity"]
        )

        machine_state = self._machine_state.setdefault(
            machine_id,
            {"downtime_minutes": 0},
        )

        base_status = str(machine["status"]).upper()

        if product_completed or shift_completed:
            status = "COMPLETED"
        elif base_status == "MAINTENANCE":
            status = "MAINTENANCE"
        elif base_status == "DOWN":
            status = "DOWN"
        elif self._sequence % 37 == 0:
            status = "DOWN"
        elif self._sequence % 11 == 0:
            status = "IDLE"
        else:
            status = "RUNNING"

        if status == "DOWN":
            machine_state["downtime_minutes"] += (
                STREAM_INTERVAL_SECONDS / 60
            )
        elif status == "RUNNING":
            machine_state["downtime_minutes"] = 0

        produced_now = 0
        defective_now = 0

        if status == "RUNNING":
            production["cycles"] += 1

            cycle_quantity = 8 + (
                product_id * 7 + machine_id * 3
            ) % 13

            if item["product_target_quantity"]:
                remaining_for_product = max(
                    0,
                    item["product_target_quantity"]
                    - item["recorded_quantity"]
                    - simulated_product_total,
                )

                remaining_for_shift = max(
                    0,
                    item["shift_target_quantity"]
                    - item["recorded_shift_quantity"]
                    - simulated_shift_total,
                )

                produced_now = min(
                    cycle_quantity,
                    remaining_for_product,
                    remaining_for_shift,
                )
            else:
                produced_now = cycle_quantity

            defective_now = (
                1
                if produced_now and production["cycles"] % 13 == 0
                else 0
            )

            production["total"] += produced_now
            production["defective"] += defective_now
            production["good"] += produced_now - defective_now

        simulated_total = production["total"]
        defective = production["defective"]

        defect_rate = (
            defective / simulated_total * 100
            if simulated_total
            else 0
        )

        oee = 0.0
        if status == "RUNNING":
            oee = round(
                max(70.0, min(96.0, 94.0 - defect_rate)),
                1,
            )

        # Use the production count for this exact product/machine/shift.
        recorded_machine_quantity = int(
            item.get("recorded_machine_shift_quantity") or 0
        )

        produced_quantity = recorded_machine_quantity + simulated_total

        target_quantity = int(item.get("target_quantity") or 0)

        achievement_percent = (
            round(produced_quantity / target_quantity * 100, 1)
            if target_quantity > 0
            else 0
        )

        remaining_quantity = max(
            target_quantity - produced_quantity,
            0,
        )

        alerts = []

        if status == "DOWN":
            alerts.append(
                {
                    "level": "high",
                    "type": "DOWNTIME",
                    "message": "Synthetic machine downtime",
                    "duration": (
                        f"{machine_state['downtime_minutes']:.1f} min"
                    ),
                    "action": "Review machine status",
                }
            )

        if defect_rate > 5:
            alerts.append(
                {
                    "level": "medium",
                    "type": "HIGH_DEFECT_RATE",
                    "message": "Synthetic defect rate exceeds 5%",
                    "action": "Review production quality",
                }
            )

        if status == "RUNNING" and oee < 80:
            alerts.append(
                {
                    "level": "low",
                    "type": "LOW_OEE",
                    "message": "Synthetic OEE is below 80%",
                    "action": "Review machine performance",
                }
            )

        return {
            "timestamp": now.astimezone(timezone.utc).isoformat(),
            "stream_session_id": self.session_id,
            "data_source": "synthetic",
            "machine": {
                "id": machine_id,
                "code": machine["machine_code"],
                "name": machine["machine_name"],
                "status": status,
                "downtime_minutes": round(
                    machine_state["downtime_minutes"], 1
                ),
            },
            "product": {
                "id": product_id,
                "code": product["product_code"],
                "name": product["product_name"],
            },
            "shift": shift["shift_name"],
            "production": {
                "total_produced": produced_quantity,
                "good_quantity": production["good"],
                "defective_quantity": defective,
                "defect_rate": round(defect_rate, 1),
                "last_cycle_quantity": produced_now,
                "last_cycle_defective": defective_now,
                "completed": (
                    product_completed
                    or shift_completed
                    or (
                        target_quantity > 0
                        and produced_quantity >= target_quantity
                    )
                ),
            },
            # Keep the nested structure for existing frontend consumers.
            "kpis": {
                "oee": oee,
                "target_quantity": target_quantity,
                "achievement_percent": achievement_percent,
            },
            # Root-level fields support consumers using the newer format.
            "target_quantity": target_quantity,
            "produced_quantity": produced_quantity,
            "achievement_percent": achievement_percent,
            "remaining_quantity": remaining_quantity,
            "alerts": alerts,
        }

    async def next_event(self):
        async with self._lock:
            now_monotonic = time.monotonic()

            if (
                self._cached_event is not None
                and now_monotonic - self._last_event_at
                < STREAM_INTERVAL_SECONDS
            ):
                return copy.deepcopy(self._cached_event)

            now = datetime.now().astimezone()

            if self._production_date != now.date():
                self._production.clear()
                self._machine_state.clear()
                self._production_date = now.date()
                self._catalog_loaded_at = 0.0

            if (
                not self._work_items
                or now_monotonic - self._catalog_loaded_at
                >= CATALOG_REFRESH_SECONDS
            ):
                await self._refresh_work_items(now)

            if (
                now_monotonic - self._production_loaded_at
                >= STREAM_INTERVAL_SECONDS
            ):
                await self._refresh_recorded_production()

            if not self._work_items:
                raise RuntimeError("No synthetic production work items available.")

            item = self._work_items[
                self._sequence % len(self._work_items)
            ]

            self._cached_event = self._create_event(item, now)
            self._last_event_at = time.monotonic()

            return copy.deepcopy(self._cached_event)


synthetic_stream = SyntheticProductionStream()


async def main():
    logging.basicConfig(level=logging.INFO)

    print("Starting synthetic production stream...")

    while True:
        try:
            event = await synthetic_stream.next_event()
            print(event)
            await asyncio.sleep(STREAM_INTERVAL_SECONDS)

        except KeyboardInterrupt:
            print("Synthetic stream stopped.")
            break

        except Exception:
            logger.exception("Synthetic stream failed")
            await asyncio.sleep(STREAM_INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Synthetic stream stopped.")
