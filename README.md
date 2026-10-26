# Smart Production Monitoring API

Backend starter for the Smart Production Monitoring & Efficiency Management System. Stack: FastAPI + raw SQL + MySQL; no SQLAlchemy.

## Structure

```text
app/
  api/routes/       # endpoints
  core/             # config, DB connection, logger, startup bootstrap
  errors/           # application exceptions and handlers
  repositories/     # parameterized SQL only
  schemas/          # Pydantic request/response schemas
  services/         # business rules
  utils/            # success/error response helpers
scripts/test_db.py
schema.sql
.env.example
requirements.txt
.gitignore
README.md
```

## Setup (PowerShell)

From this directory:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set your local MySQL username/password. Never commit `.env`.
Set `JWT_SECRET_KEY` to a unique secret of at least 32 bytes. Generate one with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### MySQL port 3306 / 3307

`DB_PORTS=3306,3307` makes the app try 3306 first and then 3307 if it cannot connect. If your server uses 3307, use `DB_PORTS=3307,3306` to prefer that port. MySQL Workbench is a client; its saved connection settings show which port your MySQL Server uses.

The MySQL account must be allowed to create databases and tables for automatic setup. For local development, use a suitable local development account, not a production admin account.

## Run

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

- Swagger: http://127.0.0.1:8001/docs
- Health: http://127.0.0.1:8001/api/v1/health
- DB health: http://127.0.0.1:8001/api/v1/health/db
- Authentication: http://127.0.0.1:8001/docs

The API uses port 8001 to avoid conflicting with the production stream service on port 8000. On startup, `AUTO_CREATE_DATABASE=true` creates the database if missing, and `AUTO_CREATE_TABLES=true` applies `schema.sql`. Existing tables are not dropped. `CREATE TABLE IF NOT EXISTS` does not alter existing table definitions.

Test connection independently:

```powershell
python scripts/test_db.py
```

## Authentication and authorization

- `POST /api/v1/auth/login` verifies credentials and returns a bearer token.
- `GET /api/v1/auth/me` returns the profile for the bearer token.
- `POST /api/v1/admin/users` creates an account for the authenticated admin.

Accounts can only be created by an administrator in Admin Dashboard >
User Management. The administrator assigns the account role and provides its
initial password; users can then sign in through the login endpoint. Passwords
are hashed with bcrypt. Tokens expire after `JWT_ACCESS_TOKEN_MINUTES`
(60 minutes by default).

All machine reads require a valid bearer token. Creating, updating, and deleting
machines requires the `ADMIN` or `MANAGER` role. Include the login
`access_token` in an `Authorization: Bearer <token>` header.

Run the frontend separately during development:

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server forwards `/api` requests to `http://127.0.0.1:8001`.
Set `VITE_API_BASE_URL` if the API is hosted at a different URL.

### Live production stream

The Supervisor, Manager, and Admin dashboards use the authenticated FastAPI
WebSocket at `/api/v1/stream/production`. It generates clearly labeled synthetic
events using active products and machines plus saved shifts and today's Manager-assigned
targets from the database. Production counters advance gradually only during
the current shift, stop at the remaining product/shift target, and count
production already saved for today before generating more. Synthetic counters
reset when the backend restarts or the day changes. These sample values are not
readings from physical machines. The stream reports
machine status and downtime, product and shift, cumulative production and
defect quantities, defect rate, OEE, and alerts. Manager-assigned database
targets remain the source of truth and are never changed by the simulator.
When a fixed product or shift target is reached, the stream marks that work item
completed and emits no additional production for it. The Manager dashboard's
Daily, Weekly, and Monthly selectors show period totals, daily produced-versus-
target charts, and per-product summaries. Weekly covers Monday through today;
Monthly covers the first of the month through today. Historical values come
from saved production entries, while today's chart includes the latest synthetic
cumulative snapshots without exceeding the reported daily totals. Completed
targets are labeled on the progress cards and remain read-only.
Manager, Supervisor, and Admin dashboards list every active product in a
separate target-versus-produced table; products without an assigned target are
shown with their output and an explicit "No target assigned" status.
Administrative user and master-data views continue to use the application
database because those records are not part of the production stream.

The frontend connects to this backend stream by default and supplies the signed-in
user's access token. To use a different compatible stream, set
`VITE_PRODUCTION_STREAM_URL` in `frontend/.env` and restart Vite.

Supervisors and administrators can view today's Manager-assigned shift targets
and animated production progress, but cannot change the target values. The
progress combines Manager targets from the database with today's production
events received by the live stream; the browser retains its daily stream totals
for the current local day.

Supervisors can report an at-risk, incomplete target from the Supervisor
dashboard by selecting its target and a Manager, then describing what happened
and why it may not be completed. Reports are stored in `target_progress_reports`
and appear in the addressed Manager's dashboard inbox, where they can be marked
reviewed. The table is created automatically on application startup and is also
included in `schema.sql`.

The notification bell polls `/api/v1/notifications` every 10 seconds for
current database alerts and unreviewed reports addressed to the signed-in
Manager. Supervisor, Manager, and Admin dashboards also surface new alerts from
their live production stream immediately; read state is tracked per notification
so an unchanged alert does not repeatedly reset the unread count.

## Example machine endpoints

- `GET /api/v1/machines`
- `POST /api/v1/machines`
- `GET /api/v1/machines/{machine_id}`
- `PATCH /api/v1/machines/{machine_id}`
- `DELETE /api/v1/machines/{machine_id}`

Create request:

```json
{
  "machine_code": "MCH-001",
  "machine_name": "Cutting Machine",
  "status": "RUNNING",
  "location": "Line A"
}
```

## Response contract

```json
{
  "success": true,
  "message": "Machines retrieved successfully",
  "data": []
}
```

## Team notes

- Each teammate creates their own `.env`; share `.env.example`, not credentials.
- Commit schema changes alongside the code that depends on them.
- Use a deliberate migration/change script for changes to existing columns.
- This starter includes health checks, authentication/roles, and machine CRUD. Add production records, shifts, targets, downtime, defect tracking, KPI calculations and reports as separate modules.

# to start backend Server
 py -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001

 # to seed the data
 python scripts/seed_demo.py

 # start the live streaming
 python -m app.dashboard.synthetic_stream

## Deploying to Vercel and Render

The React app is a responsive web app and works in desktop and mobile browsers.
It is not a separate native iOS/Android app.

### Frontend on Vercel

Create a Vercel project with `frontend` as its root directory. Use the
`npm run build` build command and `dist` output directory. Add the environment
variable `VITE_API_BASE_URL` with the public origin of the deployed Render API,
for example `https://your-api.onrender.com` (do not append `/api/v1`). The
`frontend/vercel.json` configuration supports client-side route fallback.

### API on Render

Create a Render Blueprint from this repository using `render.yaml`. Configure
`DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` for a reachable MySQL
database; Render does not provide a MySQL database in this service definition.
Set `CORS_ORIGINS` to the exact Vercel site origin, such as
`https://your-app.vercel.app`. The blueprint generates `JWT_SECRET_KEY` and
starts the API on Render's assigned port.

The production stream uses the same API origin over WebSockets. If using a
custom stream host, set `VITE_PRODUCTION_STREAM_URL` in Vercel to its public
`wss://` URL. Vite variables are embedded during the frontend build, so redeploy
the frontend after changing them.