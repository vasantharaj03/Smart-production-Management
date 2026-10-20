from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_current_user
from app.schemas.auth import (
    AuthEnvelope,
    LoginRequest,
    RegisterRequest,
    UserEnvelope,
    UserResponse,
)
from app.services.auth_service import AuthService
from app.utils.responses import success_response

router = APIRouter(prefix="/auth", tags=["Authentication"])
service = AuthService()


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=AuthEnvelope,
)
def register(payload: RegisterRequest):
    return success_response("Account created successfully", service.register(payload))


@router.post("/login", response_model=AuthEnvelope)
def login(payload: LoginRequest):
    return success_response(
        "Login successful",
        service.login(str(payload.email), payload.password),
    )


@router.get("/me", response_model=UserEnvelope)
def get_profile(user=Depends(get_current_user)):
    profile = UserResponse.model_validate(user)
    return success_response("Profile retrieved successfully", profile)
