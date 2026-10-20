from contextlib import contextmanager
import mysql.connector
from mysql.connector.errors import Error as MySQLError
from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

def connect(include_database=True):
    errors = []
    for port in settings.db_ports:
        config = {
            "host": settings.db_host, "port": port, "user": settings.db_user,
            "password": settings.db_password, "connection_timeout": settings.db_connect_timeout,
            "charset": "utf8mb4", "use_unicode": True,
        }
        if include_database:
            config["database"] = settings.db_name
        try:
            return mysql.connector.connect(**config)
        except MySQLError as exc:
            errors.append(f"{settings.db_host}:{port}: {exc}")
    raise RuntimeError("Unable to connect to MySQL using DB_PORTS. " + " | ".join(errors))

@contextmanager
def get_cursor(dictionary=True):
    connection = connect()
    cursor = connection.cursor(dictionary=dictionary)
    try:
        yield connection, cursor
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()

def database_is_ready():
    connection = connect()
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        return True
    finally:
        connection.close()
