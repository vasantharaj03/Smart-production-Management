from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from app.api.routes.health import router as health_router
from app.api.routes.machines import router as machines_router
from app.api.routes.auth import router as auth_router
from app.dashboard import service as dashboard_service
from app.dashboard.routes import router as dashboard_router
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logger import get_logger
from app.core.security import validate_auth_settings
from app.core.startup import initialize_database
from app.errors.exceptions import AppError
from app.errors.handlers import app_error_handler, validation_error_handler

logger = get_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_auth_settings()
    if settings.auto_create_database or settings.auto_create_tables:
        initialize_database()
    dashboard_service.ensure_schema()
    logger.info("Application startup complete")
    yield
    logger.info("Application shutdown complete")

app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(machines_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"success": True, "message": "Smart Production Monitoring API is running", "data": None}
