from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.core.logger import get_logger
from app.errors.exceptions import AppError

logger = get_logger(__name__)

async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"success": False, "message": exc.message, "data": None})

async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = [
        {key: value for key, value in error.items() if key != "input"}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "message": "Request validation failed",
            "data": errors,
        },
    )
