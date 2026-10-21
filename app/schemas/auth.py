from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: Literal["ADMIN", "SUPERVISOR", "MANAGER"] = "SUPERVISOR"

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Full name cannot be blank.")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    user_id: int
    full_name: str
    email: EmailStr
    role: Literal["ADMIN", "SUPERVISOR", "MANAGER"]


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserResponse


class AuthEnvelope(BaseModel):
    success: bool
    message: str
    data: AuthResponse


class UserEnvelope(BaseModel):
    success: bool
    message: str
    data: UserResponse
