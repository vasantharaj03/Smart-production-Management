"""Fills the database with sample products, machines, targets and 14 days of production,
so the dashboards show real numbers from the database. Safe to run twice.

    python scripts/seed_demo.py
"""
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.database import get_cursor  # noqa: E402
from app.core.startup import initialize_database  # noqa: E402

PRODUCTS = [("P012", "Shampoo Sachet"), ("P015", "Conditioner Sachet"), ("P020", "Soap Bar")]
MACHINES = [("PACK-01", "Pack 01 Packaging Machine", "Line 1", "RUNNING"),
            ("PACK-02", "Pack 02 Packaging Machine", "Line 1", "RUNNING"),
            ("FILL-01", "Fill 01 Filling Machine", "Line 2", "RUNNING"),
            ("FILL-02", "Fill 02 Filling Machine", "Line 2", "IDLE"),
            ("LBL-01", "Label 01 Labelling Machine", "Line 3", "MAINTENANCE")]
CAUSES = ["Contamination", "Seal fail", "Mislabel", "Underfill", "Overfill", "Torn pack"]
REASONS = ["Material Jam", "Maintenance", "Changeover", "Power dip", "Operator break"]


def main():
    initialize_database()
    random.seed(7)
    with get_cursor() as (_, cur):
        cur.execute("SELECT COUNT(*) AS n FROM production_records")
        if cur.fetchone()["n"] > 0:
            print("Production data already exists; nothing seeded.")
            return
        for code, name in PRODUCTS:
            cur.execute("INSERT IGNORE INTO products (product_code, product_name) VALUES (%s,%s)", (code, name))
        for code, name, loc, status in MACHINES:
            cur.execute("INSERT IGNORE INTO machines (machine_code, machine_name, location, status) VALUES (%s,%s,%s,%s)", (code, name, loc, status))
        cur.execute("SELECT product_id FROM products WHERE product_code IN ('P012','P015','P020')")
        pids = [r["product_id"] for r in cur.fetchall()]
        cur.execute("SELECT machine_id FROM machines WHERE machine_code IN ('PACK-01','PACK-02','FILL-01','FILL-02','LBL-01')")
        mids = [r["machine_id"] for r in cur.fetchall()]
        cur.execute("SELECT shift_id FROM shifts ORDER BY start_time")
        sids = [r["shift_id"] for r in cur.fetchall()]

        for back in range(14):
            day = date.today() - timedelta(days=back)
            for mid in mids:
                sid = random.choice(sids)
                pid = random.choice(pids)
                planned = 480
                run = random.randint(360, 480)
                produced = random.randint(9000, 15000)
                defective = int(produced * random.uniform(0.01, 0.07))
                cur.execute(
                    """INSERT INTO production_records (product_id, machine_id, shift_id, production_date,
                       quantity_produced, quantity_defective, run_minutes, planned_minutes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (pid, mid, sid, day, produced, defective, run, planned))
                prod_id = cur.lastrowid
                left = defective
                for cause in random.sample(CAUSES, 3):
                    q = min(left, random.randint(0, max(1, defective // 2)))
                    left -= q
                    if q:
                        cur.execute("INSERT INTO defect_reasons (production_id, cause, quantity) VALUES (%s,%s,%s)", (prod_id, cause, q))
                cur.execute("INSERT INTO production_targets (product_id, machine_id, shift_id, target_date, target_quantity) VALUES (%s,%s,%s,%s,%s)",
                            (pid, mid, sid, day, 13000))
                if random.random() < 0.35:
                    start = datetime.combine(day, datetime.min.time()) + timedelta(hours=random.randint(7, 17), minutes=random.randint(0, 59))
                    cur.execute("INSERT INTO downtime_events (machine_id, started_at, ended_at, reason) VALUES (%s,%s,%s,%s)",
                                (mid, start, start + timedelta(minutes=random.choice([10, 15, 30, 45, 70])), random.choice(REASONS)))
    print("Demo data added. Refresh the dashboards.")


if __name__ == "__main__":
    main()
