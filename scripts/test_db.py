from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import settings
from app.core.database import connect

def main():
    connection = None
    try:
        connection = connect(include_database=False)
        cursor = connection.cursor()
        cursor.execute("SELECT VERSION(), @@port")
        version, port = cursor.fetchone()
        print("MySQL connection: OK")
        print(f"Server version: {version}")
        print(f"Connected port: {port}")
        print(f"Configured database: {settings.db_name}")
        cursor.close()
        return 0
    except Exception as exc:
        print(f"MySQL connection: FAILED\n{exc}")
        return 1
    finally:
        if connection and connection.is_connected():
            connection.close()

if __name__ == "__main__":
    raise SystemExit(main())
