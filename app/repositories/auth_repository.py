
from mysql.connector.errors import IntegrityError

from app.core.database import get_cursor
from app.errors.exceptions import Conflict


class AuthRepository:
    def create_user(
        self,
        full_name: str,
        email: str,
        password_hash: str,
        role: str = "SUPERVISOR",
    ):
        try:
            with get_cursor() as (_, cursor):
                cursor.execute(
                    """
                    INSERT INTO users (full_name, email, password_hash, role)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (full_name, email, password_hash, role),
                )
                user_id = cursor.lastrowid

        except IntegrityError as exc:
            raise Conflict(
                "An account with this email already exists."
            ) from exc

        return self.get_by_id(user_id)

    def get_by_email(self, email: str):
        with get_cursor() as (_, cursor):
            cursor.execute(
                """
                SELECT u.user_id, u.full_name, u.email, u.password_hash, u.role, u.is_active,
                       u.shift_id, s.shift_name
                FROM users u
                LEFT JOIN shifts s ON s.shift_id = u.shift_id
                WHERE u.email = %s
                """,
                (email,),
            )
            return cursor.fetchone()

    def get_by_id(self, user_id: int):
        with get_cursor() as (_, cursor):
            cursor.execute(
                """
                SELECT u.user_id, u.full_name, u.email, u.role, u.is_active,
                       u.shift_id, s.shift_name
                FROM users u
                LEFT JOIN shifts s ON s.shift_id = u.shift_id
                WHERE u.user_id = %s
                """,
                (user_id,),
            )
            return cursor.fetchone()
