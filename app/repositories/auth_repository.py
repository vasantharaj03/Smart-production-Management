
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
                SELECT user_id, full_name, email, password_hash, role, is_active
                FROM users
                WHERE email = %s
                """,
                (email,),
            )
            return cursor.fetchone()

    def get_by_id(self, user_id: int):
        with get_cursor() as (_, cursor):
            cursor.execute(
                """
                SELECT user_id, full_name, email, role, is_active
                FROM users
                WHERE user_id = %s
                """,
                (user_id,),
            )
            return cursor.fetchone()
