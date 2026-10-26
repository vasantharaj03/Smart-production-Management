import queue
import threading
import time
from contextlib import contextmanager

import mysql.connector
from mysql.connector.errors import Error as MySQLError

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)


def connect(include_database=True):
    """Open ONE brand-new connection (TCP + TLS + auth). Expensive on a remote DB,
    so normal request code should go through get_cursor(), which reuses pooled ones."""
    errors = []

    for port in settings.db_ports:
        config = {
            "host": settings.db_host,
            "port": port,
            "user": settings.db_user,
            "password": settings.db_password,
            "connection_timeout": settings.db_connect_timeout,
            "charset": "utf8mb4",
            "use_unicode": True,
        }

        if include_database:
            config["database"] = settings.db_name

        # Enable SSL for hosted MySQL services such as Aiven.
        if settings.db_ssl_enabled:
            config["ssl_disabled"] = False

            if settings.db_ssl_ca:
                config["ssl_ca"] = settings.db_ssl_ca
                config["ssl_verify_cert"] = True
                config["ssl_verify_identity"] = True

        try:
            return mysql.connector.connect(**config)

        except MySQLError as exc:
            errors.append(f"{settings.db_host}:{port}: {exc}")

    raise RuntimeError(
        "Unable to connect to MySQL using DB_PORTS. " + " | ".join(errors)
    )


# --------------------------------------------------------------------------
# Small thread-safe connection pool.
#
# Why: before this, EVERY query opened a new connection. Against Aiven that is
# a TCP + TLS + MySQL-auth handshake (several network round trips) per query,
# and one dashboard call runs 10-20 queries. Reusing connections removes that.
# --------------------------------------------------------------------------
POOL_SIZE = 8            # keep below your Aiven plan's max connections
POOL_WAIT_SECONDS = 20   # how long a request waits for a free connection
IDLE_PING_AFTER = 30     # ping a connection that sat idle this long before reuse

_idle = queue.LifoQueue()                      # holds (connection, last_used_ts)
_slots = threading.BoundedSemaphore(POOL_SIZE)  # caps total open connections


def _checkout():
    if not _slots.acquire(timeout=POOL_WAIT_SECONDS):
        raise RuntimeError("Database is busy: no free connection in the pool.")
    try:
        while True:
            try:
                connection, last_used = _idle.get_nowait()
            except queue.Empty:
                return connect()  # nothing idle, open a new one

            # Only pay for a ping when the connection has been idle a while
            # (Aiven / network devices silently drop long-idle connections).
            if time.monotonic() - last_used > IDLE_PING_AFTER:
                try:
                    connection.ping(reconnect=False)
                except Exception:
                    _discard(connection)
                    continue
            return connection
    except BaseException:
        _slots.release()
        raise


def _checkin(connection, healthy=True):
    try:
        if healthy and connection.is_connected():
            _idle.put((connection, time.monotonic()))
        else:
            _discard(connection)
    finally:
        _slots.release()


def _discard(connection):
    try:
        connection.close()
    except Exception:
        pass


@contextmanager
def get_cursor(dictionary=True):
    connection = _checkout()
    healthy = True
    cursor = None

    try:
        cursor = connection.cursor(dictionary=dictionary)
        yield connection, cursor
        connection.commit()

    except Exception as exc:
        try:
            connection.rollback()
        except Exception:
            healthy = False
        # A dead socket / lost connection must not go back into the pool.
        if isinstance(exc, (MySQLError, OSError)) and not isinstance(
            exc, (mysql.connector.errors.IntegrityError, mysql.connector.errors.ProgrammingError)
        ):
            healthy = connection.is_connected() and healthy
        raise

    finally:
        try:
            if cursor is not None:
                cursor.close()
        except Exception:
            healthy = False
        _checkin(connection, healthy)


def database_is_ready():
    with get_cursor(dictionary=False) as (_, cursor):
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return True
