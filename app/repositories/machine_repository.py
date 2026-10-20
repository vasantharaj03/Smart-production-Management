from mysql.connector.errors import IntegrityError
from app.core.database import get_cursor
from app.errors.exceptions import Conflict, NotFound

class MachineRepository:
    def list_all(self):
        with get_cursor() as (_, cursor):
            cursor.execute("SELECT machine_id, machine_code, machine_name, status, location, created_at, updated_at FROM machines ORDER BY machine_id DESC")
            return cursor.fetchall()

    def get_by_id(self, machine_id):
        with get_cursor() as (_, cursor):
            cursor.execute("SELECT machine_id, machine_code, machine_name, status, location, created_at, updated_at FROM machines WHERE machine_id = %s", (machine_id,))
            return cursor.fetchone()

    def create(self, data):
        try:
            with get_cursor() as (_, cursor):
                cursor.execute("INSERT INTO machines (machine_code, machine_name, status, location) VALUES (%s, %s, %s, %s)",
                               (data["machine_code"], data["machine_name"], data.get("status", "IDLE"), data.get("location")))
                machine_id = cursor.lastrowid
        except IntegrityError as exc:
            raise Conflict("Machine code already exists") from exc
        return self.get_by_id(machine_id)

    def update(self, machine_id, data):
        fields = {k: v for k, v in data.items() if k in {"machine_name", "status", "location"}}
        if not fields:
            row = self.get_by_id(machine_id)
            if row is None: raise NotFound("Machine not found")
            return row
        assignments = ", ".join(f"{key} = %s" for key in fields)
        with get_cursor() as (_, cursor):
            cursor.execute(f"UPDATE machines SET {assignments} WHERE machine_id = %s", list(fields.values()) + [machine_id])
            if cursor.rowcount == 0:
                cursor.execute("SELECT machine_id FROM machines WHERE machine_id = %s", (machine_id,))
                if cursor.fetchone() is None: raise NotFound("Machine not found")
        return self.get_by_id(machine_id)

    def delete(self, machine_id):
        with get_cursor() as (_, cursor):
            cursor.execute("DELETE FROM machines WHERE machine_id = %s", (machine_id,))
            if cursor.rowcount == 0: raise NotFound("Machine not found")
