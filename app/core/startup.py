from app.core.config import ROOT_DIR, settings
from app.core.database import connect
from app.core.logger import get_logger

logger = get_logger(__name__)

def initialize_database():
    schema_path = ROOT_DIR / "schema.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"schema.sql not found: {schema_path}")

    if settings.auto_create_database:
        connection = connect(include_database=False)
        try:
            cursor = connection.cursor()
            safe_name = settings.db_name.replace("`", "``")
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{safe_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            connection.commit()
            cursor.close()
            logger.info("Database '%s' is ready", settings.db_name)
        finally:
            connection.close()

    if settings.auto_create_tables:
        connection = connect(include_database=True)
        try:
            cursor = connection.cursor()
            statements = [s.strip() for s in schema_path.read_text(encoding="utf-8").split(";") if s.strip()]
            for statement in statements:
                upper = statement.upper()
                if upper.startswith("CREATE DATABASE") or upper.startswith("USE "):
                    continue
                cursor.execute(statement)
            connection.commit()
            cursor.close()
            logger.info("Tables created/verified from schema.sql")
        except Exception:
            connection.rollback()
            logger.exception("Could not apply schema.sql")
            raise
        finally:
            connection.close()
