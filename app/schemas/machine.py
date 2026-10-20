from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

MachineStatus = Literal["RUNNING", "IDLE", "DOWN", "MAINTENANCE"]

class MachineCreate(BaseModel):
    machine_code: str = Field(min_length=1, max_length=60)
    machine_name: str = Field(min_length=1, max_length=150)
    status: MachineStatus = "IDLE"
    location: str | None = Field(default=None, max_length=150)

class MachineUpdate(BaseModel):
    machine_name: str | None = Field(default=None, min_length=1, max_length=150)
    status: MachineStatus | None = None
    location: str | None = Field(default=None, max_length=150)
