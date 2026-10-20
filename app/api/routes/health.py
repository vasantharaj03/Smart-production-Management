from fastapi import APIRouter
from app.core.database import database_is_ready
from app.errors.exceptions import AppError
from app.utils.responses import success_response

router = APIRouter(prefix="/health", tags=["Health"])

@router.get("")
def health():
    return success_response("API is healthy", {"status": "ok"})

@router.get("/db")
def database_health():
    try:
        database_is_ready()
        return success_response("Database connection successful", {"database": "connected"})
    except Exception as exc:
        raise AppError("Database connection failed. Check .env and MySQL Server.", 503) from exc
