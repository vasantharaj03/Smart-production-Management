import logging
from logging.handlers import RotatingFileHandler
from app.core.config import ROOT_DIR, settings

def get_logger(name: str) -> logging.Logger:
    root = logging.getLogger()
    if not root.handlers:
        log_dir = ROOT_DIR / "logs"
        log_dir.mkdir(exist_ok=True)
        formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s")
        console = logging.StreamHandler()
        console.setFormatter(formatter)
        file_handler = RotatingFileHandler(log_dir / "app.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        file_handler.setFormatter(formatter)
        root.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))
        root.addHandler(console)
        root.addHandler(file_handler)
    return logging.getLogger(name)
