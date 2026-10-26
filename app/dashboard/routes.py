import logging
import asyncio

from fastapi import (
    APIRouter,
    Body,
    Depends,
    Query,
    Response,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials

from app.api.dependencies import get_current_user, invalidate_user_cache, require_roles
from app.dashboard import service
from app.dashboard.synthetic_stream import synthetic_stream
from app.errors.exceptions import AppError
from app.schemas.auth import CreateUserRequest, UserEnvelope
from app.services.auth_service import AuthService
from app.utils.responses import success_response

router = APIRouter(tags=["Dashboards"], dependencies=[Depends(service.ensure_schema)])
logger = logging.getLogger(__name__)
auth_service = AuthService()

def _written(result, users_changed=False):
    """Call after any write so cached dashboard data / cached users are refreshed."""
    service.clear_dashboard_cache()
    if users_changed:
        invalidate_user_cache()
    return result


ANY = require_roles("ADMIN", "MANAGER", "SUPERVISOR")
MANAGER = require_roles("ADMIN", "MANAGER")
MANAGER_ONLY = require_roles("MANAGER")
SUPERVISOR_ONLY = require_roles("SUPERVISOR")
ADMIN = require_roles("ADMIN")


# ---- supervisor ----
@router.websocket("/stream/production")
async def production_stream(websocket: WebSocket):
    protocols = websocket.scope.get("subprotocols", [])
    if len(protocols) < 2 or protocols[0] != "bearer":
        await websocket.close(code=4401)
        return

    try:
        get_current_user(
            HTTPAuthorizationCredentials(
                scheme="Bearer",
                credentials=protocols[1],
            )
        )
    except AppError:
        await websocket.close(code=4401)
        return

    await websocket.accept(subprotocol="bearer")
    try:
        while True:
            await websocket.send_json(await synthetic_stream.next_event())
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        return
    except Exception:
        logger.exception("Synthetic production WebSocket failed.")
        await websocket.close(code=1011)


@router.get("/supervisor/dashboard")
def supervisor_dashboard(user=Depends(ANY)):
    return success_response("Supervisor dashboard", service.supervisor_dashboard(user))


@router.post("/production/shift-entry", status_code=status.HTTP_201_CREATED)
def shift_entry(body: dict = Body(...), user=Depends(ANY)):
    return success_response("Shift entry saved", _written(service.submit_shift_entry(body, user)))


@router.post("/downtime", status_code=status.HTTP_201_CREATED)
def downtime(body: dict = Body(...), user=Depends(ANY)):
    return success_response("Downtime logged", _written(service.log_downtime(body, user)))


@router.patch("/downtime/{downtime_id}/end")
def downtime_end(downtime_id: int, user=Depends(ANY)):
    return success_response("Downtime ended", _written(service.end_downtime(downtime_id, user)))


@router.patch("/machines/{machine_id}/status")
def machine_status(machine_id: int, body: dict = Body(...), user=Depends(ANY)):
    return success_response("Machine status updated", _written(service.set_machine_status(machine_id, body.get("status"), user)))


@router.get("/quality/summary")
def quality(user=Depends(ANY)):
    return success_response("Quality summary", service.quality_summary())


@router.get("/alerts")
def alerts(range: str = Query("weekly"), user=Depends(ANY)):
    start, end, _, _ = service.period(range)
    return success_response("Alerts", service.compute_alerts(start, end))


@router.get("/notifications")
def notifications(user=Depends(ANY)):
    return success_response("Notifications", service.list_notifications(user))


# ---- manager ----
@router.get("/manager/dashboard")
def manager_dashboard(range: str = Query("daily"), user=Depends(MANAGER)):
    return success_response("Manager dashboard", service.manager_dashboard(range))


@router.get("/manager/supervisors")
def manager_supervisors(user=Depends(MANAGER)):
    return success_response("Supervisors", service.list_manager_supervisors())


@router.patch("/manager/supervisors/{user_id}/shift")
def assign_manager_supervisor_shift(
    user_id: int,
    body: dict = Body(...),
    user=Depends(MANAGER),
):
    return success_response(
        "Supervisor shift assignment updated",
        _written(service.assign_supervisor_shift(user_id, body, user), users_changed=True),
    )


@router.delete("/manager/supervisors/{user_id}/shift")
def unassign_manager_supervisor_shift(
    user_id: int,
    body: dict = Body(...),
    user=Depends(MANAGER),
):
    return success_response(
        "Supervisor shift unassigned",
        _written(service.unassign_supervisor_shift(user_id, body, user), users_changed=True),
    )


@router.get("/manager/analytics")
def manager_analytics(range: str = Query("weekly"), user=Depends(MANAGER)):
    return success_response("Analytics", service.analytics(range))


@router.get("/targets")
def targets(day: str | None = Query(None, alias="date"), user=Depends(ANY)):
    return success_response("Targets", service.list_targets(day))


@router.get("/target-reports/managers")
def target_report_managers(user=Depends(SUPERVISOR_ONLY)):
    return success_response("Active Managers", service.list_report_managers())


@router.post("/target-reports", status_code=status.HTTP_201_CREATED)
def create_target_report(body: dict = Body(...), user=Depends(SUPERVISOR_ONLY)):
    return success_response(
        "Target progress report sent",
        _written(service.create_target_progress_report(body, user)),
    )


@router.get("/manager/target-reports")
def manager_target_reports(user=Depends(MANAGER)):
    return success_response(
        "Supervisor target progress reports",
        service.list_manager_target_reports(user),
    )


@router.patch("/manager/target-reports/{report_id}/review")
def review_manager_target_report(report_id: int, user=Depends(MANAGER)):
    return success_response(
        "Target progress report reviewed",
        _written(service.review_target_progress_report(report_id, user)),
    )


@router.get("/production/products")
def product_production(
    day: str | None = Query(None, alias="date"),
    shift: str | None = Query(None),
    user=Depends(ANY),
):
    return success_response(
        "Product production summary",
        service.list_product_production(day, shift),
    )


@router.post("/targets", status_code=status.HTTP_201_CREATED)
def add_target(body: dict = Body(...), user=Depends(MANAGER_ONLY)):
    return success_response("Target saved", _written(service.create_target(body, user)))


@router.get("/reports")
def report_list(user=Depends(ANY)):
    return success_response("Reports", service.REPORTS)


@router.get("/reports/download")
def download_report(name: str, type: str = "Excel", user=Depends(ANY)):
    content, media_type, extension = service.report_file(name, type)
    filename = name.replace(" ", "_").replace("&", "and") + f".{extension}"
    return Response(content, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---- admin ----
@router.get("/admin/dashboard")
def admin_dashboard(range: str = Query("today"), user=Depends(ADMIN)):
    return success_response("Admin dashboard", service.admin_dashboard(range))


@router.get("/admin/audit")
def audit(limit: int = 200, user=Depends(ADMIN)):
    return success_response("Audit log", service.full_audit(limit))


@router.get("/admin/users")
def users(user=Depends(ADMIN)):
    return success_response("Users", service.list_users())


@router.post("/admin/users", status_code=status.HTTP_201_CREATED, response_model=UserEnvelope)
def add_user(payload: CreateUserRequest, user=Depends(ADMIN)):
    created_user = _written(auth_service.create_user(payload), users_changed=True)
    service.log_audit(
        user,
        "Created User",
        created_user["email"],
        f"role={created_user['role']}",
    )
    return success_response("User created", created_user)


@router.patch("/admin/users/{user_id}")
def patch_user(user_id: int, body: dict = Body(...), user=Depends(ADMIN)):
    return success_response("User updated", _written(service.update_user(user_id, body, user), users_changed=True))


@router.post("/shifts", status_code=status.HTTP_201_CREATED)
def add_shift(body: dict = Body(...), user=Depends(ADMIN)):
    return success_response("Shift created", _written(service.create_shift(body, user)))


@router.patch("/shifts/{shift_id}")
def patch_shift(shift_id: int, body: dict = Body(...), user=Depends(ADMIN)):
    return success_response("Shift updated", _written(service.update_shift(shift_id, body, user)))


# ---- shared lists ----
@router.get("/products")
def products(user=Depends(ANY)):
    return success_response("Products", service.list_products())


@router.post("/products", status_code=status.HTTP_201_CREATED)
def add_product(body: dict = Body(...), user=Depends(MANAGER)):
    return success_response("Product created", _written(service.create_product(body, user)))


@router.patch("/products/{product_id}")
def patch_product(product_id: int, body: dict = Body(...), user=Depends(MANAGER)):
    return success_response("Product updated", _written(service.update_product(product_id, body, user)))


@router.get("/shifts")
def shifts(user=Depends(ANY)):
    return success_response("Shifts", service.list_shifts())


# ---- my account ----
@router.post("/me/password")
def my_password(body: dict = Body(...), user=Depends(ANY)):
    return success_response("Password changed", service.change_password(user, body.get("current"), body.get("new")))