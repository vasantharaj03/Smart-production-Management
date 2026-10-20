from fastapi import APIRouter, Depends, Response, status
from app.api.dependencies import get_current_user, require_roles
from app.schemas.machine import MachineCreate, MachineUpdate
from app.services.machine_service import MachineService
from app.utils.responses import success_response

router = APIRouter(prefix="/machines", tags=["Machines"])
service = MachineService()

@router.get("", dependencies=[Depends(get_current_user)])
def list_machines():
    return success_response("Machines retrieved successfully", service.list_machines())

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles("ADMIN", "MANAGER"))],
)
def create_machine(payload: MachineCreate):
    return success_response("Machine created successfully", service.create_machine(payload))

@router.get("/{machine_id}", dependencies=[Depends(get_current_user)])
def get_machine(machine_id: int):
    return success_response("Machine retrieved successfully", service.get_machine(machine_id))

@router.patch(
    "/{machine_id}",
    dependencies=[Depends(require_roles("ADMIN", "MANAGER"))],
)
def update_machine(machine_id: int, payload: MachineUpdate):
    return success_response("Machine updated successfully", service.update_machine(machine_id, payload))

@router.delete(
    "/{machine_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_roles("ADMIN", "MANAGER"))],
)
def delete_machine(machine_id: int):
    service.delete_machine(machine_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
