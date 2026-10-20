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
uvicorn app.main:app --reload
```

- Swagger: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/api/v1/health
- DB health: http://127.0.0.1:8000/api/v1/health/db
- Authentication: http://127.0.0.1:8000/docs

On startup, `AUTO_CREATE_DATABASE=true` creates the database if missing, and `AUTO_CREATE_TABLES=true` applies `schema.sql`. Existing tables are not dropped. `CREATE TABLE IF NOT EXISTS` does not alter existing table definitions.

Test connection independently:

```powershell
python scripts/test_db.py
```

## Authentication and authorization

- `POST /api/v1/auth/register` creates an account and returns a bearer token.
- `POST /api/v1/auth/login` verifies credentials and returns a bearer token.
- `GET /api/v1/auth/me` returns the profile for the bearer token.

Registration always creates a `SUPERVISOR`; role selection is deliberately not
exposed to public clients. Assign `ADMIN` or `MANAGER` only through a trusted
administrative process. Passwords are hashed with bcrypt. Tokens expire after
`JWT_ACCESS_TOKEN_MINUTES` (60 minutes by default).

All machine reads require a valid bearer token. Creating, updating, and deleting
machines requires the `ADMIN` or `MANAGER` role. Include the login/register
`access_token` in an `Authorization: Bearer <token>` header.

Run the frontend separately during development:

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server forwards `/api` requests to `http://127.0.0.1:8000`.
Set `VITE_API_BASE_URL` if the API is hosted at a different URL.

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
