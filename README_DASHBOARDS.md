# Smart Production - dashboards completed

Unzip this ON TOP of your project folder (Smart-production-Management). Files with the same path are replaced.
They were made from your latest zip, so nothing of yours is lost. Commit first so you can undo:

    git add . ; git commit -m "before dashboards"

## 1. Backend (stop it, then start again)
    cd Smart-production-Management
    uvicorn app.main:app --reload --port 8001
On start-up the new tables (audit_logs, defect_reasons) and the shifts A/B/C are created automatically.
Existing databases are upgraded safely with a nullable `users.shift_id` foreign key to `shifts`.

## Manage Supervisor

Managers can open **Manage Supervisor** in the Manager Dashboard to view supervisors,
assign or rotate active supervisors across active A, B, and C shifts, and record an
optional reason for the change. Disabled shifts must first be activated by an admin
under **Master Data**. Assignments are saved on `users.shift_id` and audited. The
Supervisor Dashboard displays the current assignment, and new production entries
submitted by that supervisor use that shift. Previously saved production records
retain their original `shift_id`.

## Report exports

Reports download in the format shown on each report tile: PDF reports are
generated as `.pdf` files and Excel reports as `.xlsx` workbooks. The Admin
audit-log export remains CSV. Energy Usage is listed but cannot be downloaded
until energy data is tracked.

Optional sample data (14 days of production, downtime, targets) so the charts show numbers:
    python scripts/seed_demo.py

## 2. Frontend
    cd frontend
    npm run dev
Open http://localhost:5173. The authenticated synthetic production stream is
served by the FastAPI backend and uses the active database products, machines,
shifts, and targets; it does not represent physical machine readings.

## 3. ngrok (later)
Create frontend/.env with:   VITE_API_BASE=https://your-name.ngrok-free.app
and restart npm run dev. No code change needed.

## 4. Try it
Sign in with an existing Admin account and open **User Management** to create
accounts as ADMIN, MANAGER, or SUPERVISOR. Public account creation is disabled.
For a fresh database, provision the first Admin directly through a trusted,
one-time database operation before using the dashboard.
